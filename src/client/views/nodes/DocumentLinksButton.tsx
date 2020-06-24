import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../fields/Doc";
import { emptyFunction, setupMoveUpEvents } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { UndoManager } from "../../util/UndoManager";
import './DocumentLinksButton.scss';
import { DocumentView } from "./DocumentView";
import React = require("react");
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

interface DocumentLinksButtonProps {
    View: DocumentView;
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

    onLinkButtonDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onLinkButtonMoved, emptyFunction, action((e) => {
            DocumentLinksButton.EditLink = this.props.View;
            DocumentLinksButton.EditLinkLoc = [e.clientX, e.clientY];
        }));
    }

    @observable
    public static EditLink: DocumentView | undefined;
    public static EditLinkLoc: number[] = [0, 0];

    @computed
    get linkButton() {
        const links = DocListCast(this.props.View.props.Document.links);
        return !this.props.View || !links.length || links[0].hidden ? (null) :
            <div title="Drag(create link) Tap(view links)" style={{ position: "absolute", left: -15, bottom: -15 }} ref={this._linkButton}>
                <div className={"documentLinksButton-button-nonempty"} onPointerDown={this.onLinkButtonDown} >
                    {links.length}
                </div>
            </div>;
    }
    render() {
        return this.linkButton;
    }
}