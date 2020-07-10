import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../fields/Doc";
import { emptyFunction, setupMoveUpEvents, returnFalse } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { UndoManager, undoBatch } from "../../util/UndoManager";
import './DocumentLinksButton.scss';
import { DocumentView } from "./DocumentView";
import React = require("react");
import { DocUtils } from "../../documents/Documents";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LinkDocPreview } from "./LinkDocPreview";
import { LinkCreatedBox } from "./LinkCreatedBox";
import { LinkDescriptionPopup } from "./LinkDescriptionPopup";
import { LinkManager } from "../../util/LinkManager";
import { Tooltip } from "@material-ui/core";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

interface DocumentLinksButtonProps {
    View: DocumentView;
    Offset?: number[];
    AlwaysOn?: boolean;
    InMenu?: boolean;
}
@observer
export class DocumentLinksButton extends React.Component<DocumentLinksButtonProps, {}> {
    private _linkButton = React.createRef<HTMLDivElement>();

    @observable public static StartLink: DocumentView | undefined;

    @action @undoBatch
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

    @undoBatch
    onLinkButtonDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onLinkButtonMoved, emptyFunction, action((e, doubleTap) => {
            if (doubleTap && this.props.InMenu) {
                //action(() => Doc.BrushDoc(this.props.View.Document));
                DocumentLinksButton.StartLink = this.props.View;
            } else if (!!!this.props.InMenu) {
                DocumentLinksButton.EditLink = this.props.View;
                DocumentLinksButton.EditLinkLoc = [e.clientX + 10, e.clientY];
            }
        }));
    }

    @action @undoBatch
    onLinkClick = (e: React.MouseEvent): void => {
        if (this.props.InMenu) {
            DocumentLinksButton.StartLink = this.props.View;
            //action(() => Doc.BrushDoc(this.props.View.Document));
        } else if (!!!this.props.InMenu) {
            DocumentLinksButton.EditLink = this.props.View;
            DocumentLinksButton.EditLinkLoc = [e.clientX + 10, e.clientY];
        }
    }

    @action @undoBatch
    completeLink = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, action((e, doubleTap) => {
            if (doubleTap) {
                if (DocumentLinksButton.StartLink === this.props.View) {
                    DocumentLinksButton.StartLink = undefined;
                    // action((e: React.PointerEvent<HTMLDivElement>) => {
                    //     Doc.UnBrushDoc(this.props.View.Document);
                    // });
                } else {

                    if (DocumentLinksButton.StartLink && DocumentLinksButton.StartLink !== this.props.View) {
                        const linkDoc = DocUtils.MakeLink({ doc: DocumentLinksButton.StartLink.props.Document }, { doc: this.props.View.props.Document }, "long drag");
                        LinkManager.currentLink = linkDoc;
                        linkDoc ? linkDoc.hidden = true : null;
                        linkDoc ? linkDoc.linkDisplay = true : null;

                        runInAction(() => {
                            LinkCreatedBox.popupX = e.screenX;
                            LinkCreatedBox.popupY = e.screenY - 133;
                            LinkCreatedBox.linkCreated = true;

                            LinkDescriptionPopup.popupX = e.screenX;
                            LinkDescriptionPopup.popupY = e.screenY - 100;
                            LinkDescriptionPopup.descriptionPopup = true;

                            setTimeout(action(() => { LinkCreatedBox.linkCreated = false; }), 2500);
                        });
                    }
                }
            }
        }));
    }

    @action @undoBatch
    finishLinkClick = (e: React.MouseEvent) => {
        if (DocumentLinksButton.StartLink === this.props.View) {
            DocumentLinksButton.StartLink = undefined;
            // action((e: React.PointerEvent<HTMLDivElement>) => {
            //     Doc.UnBrushDoc(this.props.View.Document);
            // });
        } else {
            if (DocumentLinksButton.StartLink && DocumentLinksButton.StartLink !== this.props.View) {
                const linkDoc = DocUtils.MakeLink({ doc: DocumentLinksButton.StartLink.props.Document }, { doc: this.props.View.props.Document }, "long drag");
                LinkManager.currentLink = linkDoc;
                linkDoc ? linkDoc.hidden = true : null;
                linkDoc ? linkDoc.linkDisplay = true : null;

                runInAction(() => {
                    LinkCreatedBox.popupX = e.screenX;
                    LinkCreatedBox.popupY = e.screenY - 133;
                    LinkCreatedBox.linkCreated = true;

                    if (LinkDescriptionPopup.showDescriptions === "ON" || !LinkDescriptionPopup.showDescriptions) {
                        LinkDescriptionPopup.popupX = e.screenX;
                        LinkDescriptionPopup.popupY = e.screenY - 100;
                        LinkDescriptionPopup.descriptionPopup = true;
                    }

                    setTimeout(action(() => { LinkCreatedBox.linkCreated = false; }), 2500);
                });
            }
        }
    }

    @observable
    public static EditLink: DocumentView | undefined;
    public static EditLinkLoc: number[] = [0, 0];

    @computed
    get linkButton() {
        const links = DocListCast(this.props.View.props.Document.links);

        const title = this.props.InMenu ? "Drag or tap to create links" : "Tap to view links";

        const linkButton = <div ref={this._linkButton} style={{ minWidth: 20, minHeight: 20, position: "absolute", left: this.props.Offset?.[0] }}>
            <div className={"documentLinksButton"} style={{
                backgroundColor: DocumentLinksButton.StartLink && !!!this.props.InMenu ? "transparent" : this.props.InMenu ? "black" : "",
                color: this.props.InMenu ? "white" : "black",
                width: this.props.InMenu ? "20px" : "30px", height: this.props.InMenu ? "20px" : "30px", fontWeight: "bold"
            }}
                onPointerDown={this.onLinkButtonDown} onClick={this.onLinkClick}
            // onPointerLeave={action(() => LinkDocPreview.LinkInfo = undefined)}
            // onPointerEnter={action(e => links.length && (LinkDocPreview.LinkInfo = {
            //     addDocTab: this.props.View.props.addDocTab,
            //     linkSrc: this.props.View.props.Document,
            //     linkDoc: links[0],
            //     Location: [e.clientX, e.clientY + 20]
            // }))} 
            >
                {links.length && !!!this.props.InMenu ? links.length : <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" />}
            </div>
            {DocumentLinksButton.StartLink && DocumentLinksButton.StartLink !== this.props.View ? <div className={"documentLinksButton-endLink"}
                style={{ width: this.props.InMenu ? "20px" : "30px", height: this.props.InMenu ? "20px" : "30px" }}
                onPointerDown={this.completeLink} onClick={e => this.finishLinkClick(e)} /> : (null)}
            {DocumentLinksButton.StartLink === this.props.View ? <div className={"documentLinksButton-startLink"}
                style={{ width: this.props.InMenu ? "20px" : "30px", height: this.props.InMenu ? "20px" : "30px" }} /> : (null)}
        </div>;
        return (!links.length) && !this.props.AlwaysOn ? (null) :
            <Tooltip title={title}>
                {linkButton}
            </Tooltip>;
    }
    render() {
        return this.linkButton;
    }
}
