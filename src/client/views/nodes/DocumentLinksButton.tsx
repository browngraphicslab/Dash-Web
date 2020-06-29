import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../fields/Doc";
import { emptyFunction, setupMoveUpEvents, returnFalse } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { UndoManager } from "../../util/UndoManager";
import './DocumentLinksButton.scss';
import { DocumentView } from "./DocumentView";
import React = require("react");
import { DocUtils } from "../../documents/Documents";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LinkDocPreview } from "./LinkDocPreview";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

interface DocumentLinksButtonProps {
    View: DocumentView;
    Offset?: number[];
    AlwaysOn?: boolean;
}
@observer
export class DocumentLinksButton extends React.Component<DocumentLinksButtonProps, {}> {
    private _linkButton = React.createRef<HTMLDivElement>();

    @action
    onLinkButtonMoved = (e: PointerEvent) => {
        if (this._linkButton.current !== null) {
            const linkDrag = UndoManager.StartBatch("Drag Link");
            this.props.View && DragManager.StartLinkDrag(this._linkButton.current, this.props.View.props.Document, e.pageX, e.pageY, {
                dragComplete: dropEv => {
                    const linkDoc = dropEv.linkDragData?.linkDocument as Doc; // equivalent to !dropEve.aborted since linkDocument is only assigned on a completed drop
                    if (this.props.View && linkDoc) {
                        !linkDoc.linkRelationship && (Doc.GetProto(linkDoc).linkRelationship = "hyperlink");

                        // we want to allow specific views to handle the link creation in their own way (e.g., rich text makes text hyperlinks)
                        // the dragged view can regiser a linkDropCallback to be notified that the link was made and to update their data structures
                        // however, the dropped document isn't so accessible.  What we do is set the newly created link document on the documentView
                        // The documentView passes a function prop returning this link doc to its descendants who can react to changes to it.
                        dropEv.linkDragData?.linkDropCallback?.(dropEv.linkDragData);
                        runInAction(() => this.props.View._link = linkDoc);
                        setTimeout(action(() => this.props.View._link = undefined), 0);
                    }
                    linkDrag?.end();
                },
                hideSource: false
            });
            return true;
        }
        return false;
    }

    @observable static StartLink: DocumentView | undefined;
    onLinkButtonDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onLinkButtonMoved, emptyFunction, action((e, doubleTap) => {
            if (doubleTap) {
                DocumentLinksButton.StartLink = this.props.View;
            } else {
                DocumentLinksButton.EditLink = this.props.View;
                DocumentLinksButton.EditLinkLoc = [e.clientX + 10, e.clientY];
            }
        }));
    }
    completeLink = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, action((e, doubleTap) => {
            if (doubleTap) {
                if (DocumentLinksButton.StartLink === this.props.View) {
                    DocumentLinksButton.StartLink = undefined;
                } else {
                    DocumentLinksButton.StartLink && DocumentLinksButton.StartLink !== this.props.View &&
                        DocUtils.MakeLink({ doc: DocumentLinksButton.StartLink.props.Document }, { doc: this.props.View.props.Document }, "long drag");
                }
            }
        }));
    }

    @observable
    public static EditLink: DocumentView | undefined;
    public static EditLinkLoc: number[] = [0, 0];

    @computed
    get linkButton() {
        const links = DocListCast(this.props.View.props.Document.links);
        return (!links.length || links[0].hidden) && !this.props.AlwaysOn ? (null) :
            <div title="Drag(create link) Tap(view links)" ref={this._linkButton} style={{ minWidth: 20, minHeight: 20, position: "absolute", left: this.props.Offset?.[0] }}>
                <div className={"documentLinksButton"} style={{ backgroundColor: DocumentLinksButton.StartLink ? "transparent" : "" }}
                    onPointerDown={this.onLinkButtonDown}
                    onPointerLeave={action(() => LinkDocPreview.LinkInfo = undefined)}
                    onPointerEnter={action(e => links.length && (LinkDocPreview.LinkInfo = {
                        addDocTab: this.props.View.props.addDocTab,
                        linkSrc: this.props.View.props.Document,
                        linkDoc: links[0],
                        Location: [e.clientX, e.clientY + 20]
                    }))} >
                    {links.length ? links.length : <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" />}
                </div>
                {DocumentLinksButton.StartLink && DocumentLinksButton.StartLink !== this.props.View ? <div className={"documentLinksButton-endLink"} onPointerDown={this.completeLink} /> : (null)}
                {DocumentLinksButton.StartLink === this.props.View ? <div className={"documentLinksButton-startLink"} /> : (null)}
            </div>;
    }
    render() {
        return this.linkButton;
    }
}
