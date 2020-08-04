import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../fields/Doc";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, returnFalse, setupMoveUpEvents, emptyPath } from "../../../Utils";
import { DocUtils } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { LinkManager } from "../../util/LinkManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import './DocumentLinksButton.scss';
import { DocumentView } from "./DocumentView";
import { LinkDescriptionPopup } from "./LinkDescriptionPopup";
import { TaskCompletionBox } from "./TaskCompletedBox";
import React = require("react");
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

interface DocumentLinksButtonProps {
    View: DocumentView;
    Offset?: number[];
    AlwaysOn?: boolean;
    InMenu?: boolean;
    StartLink?: boolean;
    links: Doc[];
}
@observer
export class DocumentLinksButton extends React.Component<DocumentLinksButtonProps, {}> {
    private _linkButton = React.createRef<HTMLDivElement>();

    @observable public static StartLink: DocumentView | undefined;

    @action @undoBatch
    onLinkButtonMoved = (e: PointerEvent) => {
        if (this.props.InMenu && this.props.StartLink) {
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
        return false;
    }

    @undoBatch
    onLinkButtonDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onLinkButtonMoved, emptyFunction, action((e, doubleTap) => {
            if (doubleTap && this.props.InMenu && this.props.StartLink) {
                //action(() => Doc.BrushDoc(this.props.View.Document));
                if (DocumentLinksButton.StartLink === this.props.View) {
                    DocumentLinksButton.StartLink = undefined;
                } else {
                    DocumentLinksButton.StartLink = this.props.View;
                }
            } else if (!this.props.InMenu) {
                DocumentLinksButton.EditLink = this.props.View;
                DocumentLinksButton.EditLinkLoc = [e.clientX + 10, e.clientY];
            }
        }));
    }

    @action @undoBatch
    onLinkClick = (e: React.MouseEvent): void => {
        if (this.props.InMenu && this.props.StartLink) {
            if (DocumentLinksButton.StartLink === this.props.View) {
                DocumentLinksButton.StartLink = undefined;
            } else {
                DocumentLinksButton.StartLink = this.props.View;
            }

            //action(() => Doc.BrushDoc(this.props.View.Document));
        } else if (!this.props.InMenu) {
            DocumentLinksButton.EditLink = this.props.View;
            DocumentLinksButton.EditLinkLoc = [e.clientX + 10, e.clientY];
        }
    }

    completeLink = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, undoBatch(action((e, doubleTap) => {
            if (doubleTap && this.props.InMenu && !this.props.StartLink) {
                if (DocumentLinksButton.StartLink === this.props.View) {
                    DocumentLinksButton.StartLink = undefined;
                } else if (DocumentLinksButton.StartLink && DocumentLinksButton.StartLink !== this.props.View) {
                    const linkDoc = DocUtils.MakeLink({ doc: DocumentLinksButton.StartLink.props.Document }, { doc: this.props.View.props.Document }, "long drag");
                    LinkManager.currentLink = linkDoc;
                    if (linkDoc) {
                        TaskCompletionBox.textDisplayed = "Link Created";
                        TaskCompletionBox.popupX = e.screenX;
                        TaskCompletionBox.popupY = e.screenY - 133;
                        TaskCompletionBox.taskCompleted = true;

                        LinkDescriptionPopup.popupX = e.screenX;
                        LinkDescriptionPopup.popupY = e.screenY - 100;
                        LinkDescriptionPopup.descriptionPopup = true;

                        setTimeout(action(() => TaskCompletionBox.taskCompleted = false), 2500);
                    }
                }
            }
        })));
    }
    finishLinkClick = undoBatch(action((screenX: number, screenY: number) => {
        if (DocumentLinksButton.StartLink === this.props.View) {
            DocumentLinksButton.StartLink = undefined;
        } else if (this.props.InMenu && !this.props.StartLink && DocumentLinksButton.StartLink && DocumentLinksButton.StartLink !== this.props.View) {
            const linkDoc = DocUtils.MakeLink({ doc: DocumentLinksButton.StartLink.props.Document }, { doc: this.props.View.props.Document }, "long drag");
            // this notifies any of the subviews that a document is made so that they can make finer-grained hyperlinks ().  see note above in onLInkButtonMoved
            DocumentLinksButton.StartLink!._link = this.props.View._link = linkDoc;
            setTimeout(action(() => DocumentLinksButton.StartLink!._link = this.props.View._link = undefined), 0);
            LinkManager.currentLink = linkDoc;
            if (linkDoc) {
                TaskCompletionBox.textDisplayed = "Link Created";
                TaskCompletionBox.popupX = screenX;
                TaskCompletionBox.popupY = screenY - 133;
                TaskCompletionBox.taskCompleted = true;

                if (LinkDescriptionPopup.showDescriptions === "ON" || !LinkDescriptionPopup.showDescriptions) {
                    LinkDescriptionPopup.popupX = screenX;
                    LinkDescriptionPopup.popupY = screenY - 100;
                    LinkDescriptionPopup.descriptionPopup = true;
                }

                setTimeout(action(() => TaskCompletionBox.taskCompleted = false), 2500);
            }
        }
    }));

    @observable
    public static EditLink: DocumentView | undefined;
    public static EditLinkLoc: number[] = [0, 0];


    @action clearLinks() {
        DocumentLinksButton.StartLink = undefined;
    }

    @computed
    get linkButton() {
        TraceMobx();
        const links = this.props.links;

        const menuTitle = this.props.StartLink ? "Drag or tap to start link" : "Tap to complete link";
        const buttonTitle = "Tap to view links";
        const title = this.props.InMenu ? menuTitle : buttonTitle;


        const startLink = <img
            style={{ width: "11px", height: "11px" }}
            id={"startLink-icon"}
            src={`/assets/${"startLink.png"}`} />;

        const endLink = <img
            style={{ width: "14px", height: "9px" }}
            id={"endLink-icon"}
            src={`/assets/${"endLink.png"}`} />;

        const link = <img
            style={{ width: "22px", height: "16px" }}
            id={"link-icon"}
            src={`/assets/${"link.png"}`} />;

        const linkButton = <div ref={this._linkButton} style={{ minWidth: 20, minHeight: 20, position: "absolute", left: this.props.Offset?.[0] }}>
            <div className={"documentLinksButton"} style={{
                backgroundColor: this.props.InMenu ? "black" : "",
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

                {/* {this.props.InMenu ? this.props.StartLink ? <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" /> :
                    <FontAwesomeIcon className="documentdecorations-icon" icon="hand-paper" size="sm" /> : links.length} */}

                {this.props.InMenu ? this.props.StartLink ? <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" /> :
                    link : links.length}

            </div>
            {DocumentLinksButton.StartLink && this.props.InMenu && !this.props.StartLink &&
                DocumentLinksButton.StartLink !== this.props.View ? <div className={"documentLinksButton-endLink"}
                    style={{
                        width: this.props.InMenu ? "20px" : "30px", height: this.props.InMenu ? "20px" : "30px",
                        backgroundColor: DocumentLinksButton.StartLink ? "" : "grey",
                        border: DocumentLinksButton.StartLink ? "" : "none"
                    }}
                    onPointerDown={DocumentLinksButton.StartLink ? this.completeLink : emptyFunction}
                    onClick={e => DocumentLinksButton.StartLink ? this.finishLinkClick(e.screenX, e.screenY) : emptyFunction} /> : (null)}
            {DocumentLinksButton.StartLink === this.props.View && this.props.InMenu && this.props.StartLink ? <div className={"documentLinksButton-startLink"}
                style={{ width: this.props.InMenu ? "20px" : "30px", height: this.props.InMenu ? "20px" : "30px" }}
                onPointerDown={this.clearLinks} onClick={this.clearLinks}
            /> : (null)}
        </div>;

        return (!links.length) && !this.props.AlwaysOn ? (null) :
            this.props.InMenu ?
                <Tooltip title={<><div className="dash-tooltip">{title}</div></>}>
                    {linkButton}
                </Tooltip> : !!!DocumentLinksButton.EditLink && !this.props.InMenu ?
                    <Tooltip title={<><div className="dash-tooltip">{title}</div></>}>
                        {linkButton}
                    </Tooltip> :
                    linkButton;
    }
    render() {
        return this.linkButton;
    }
}
