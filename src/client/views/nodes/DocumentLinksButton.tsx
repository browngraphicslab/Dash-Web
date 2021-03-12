import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, Opt, WidthSym, DocListCastAsync } from "../../../fields/Doc";
import { emptyFunction, setupMoveUpEvents, returnFalse, Utils, emptyPath } from "../../../Utils";
import { TraceMobx } from "../../../fields/util";
import { DocUtils, Docs } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { LinkManager } from "../../util/LinkManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocumentView } from "./DocumentView";
import { StrCast, Cast } from "../../../fields/Types";
import { LinkDescriptionPopup } from "./LinkDescriptionPopup";
import { Hypothesis } from "../../util/HypothesisUtils";
import { Id } from "../../../fields/FieldSymbols";
import { TaskCompletionBox } from "./TaskCompletedBox";
import React = require("react");
import './DocumentLinksButton.scss';
import { DocServer } from "../../DocServer";
import { LightboxView } from "../LightboxView";
import { cat } from "shelljs";

const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

interface DocumentLinksButtonProps {
    View: DocumentView;
    Offset?: (number | undefined)[];
    AlwaysOn?: boolean;
    InMenu?: boolean;
    StartLink?: boolean;
    links: Doc[];
}
@observer
export class DocumentLinksButton extends React.Component<DocumentLinksButtonProps, {}> {
    private _linkButton = React.createRef<HTMLDivElement>();
    @observable public static StartLink: Doc | undefined;
    @observable public static StartLinkView: DocumentView | undefined;
    @observable public static AnnotationId: string | undefined;
    @observable public static AnnotationUri: string | undefined;
    @observable public static LinkEditorDocView: DocumentView | undefined;

    @observable public static invisibleWebDoc: Opt<Doc>;
    public static invisibleWebRef = React.createRef<HTMLDivElement>();

    @action public static ClearLinkEditor() { DocumentLinksButton.LinkEditorDocView = undefined; }
    @action @undoBatch
    onLinkButtonMoved = (e: PointerEvent) => {
        if (this.props.InMenu && this.props.StartLink) {
            if (this._linkButton.current !== null) {
                const linkDrag = UndoManager.StartBatch("Drag Link");
                this.props.View && DragManager.StartLinkDrag(this._linkButton.current, this.props.View.props.Document, this.props.View.ComponentView?.getAnchor, e.pageX, e.pageY, {
                    dragComplete: dropEv => {
                        if (this.props.View && dropEv.linkDocument) {// dropEv.linkDocument equivalent to !dropEve.aborted since linkDocument is only assigned on a completed drop
                            !dropEv.linkDocument.linkRelationship && (Doc.GetProto(dropEv.linkDocument).linkRelationship = "hyperlink");
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
                if (DocumentLinksButton.StartLink === this.props.View.props.Document) {
                    DocumentLinksButton.StartLink = undefined;
                    DocumentLinksButton.StartLinkView = undefined;
                } else {
                    DocumentLinksButton.StartLink = this.props.View.props.Document;
                    DocumentLinksButton.StartLinkView = this.props.View;
                }
            } else if (!this.props.InMenu) {
                if (doubleTap) {
                    const rootDoc = this.props.View.rootDoc;
                    const docid = Doc.CurrentUserEmail + Doc.GetProto(rootDoc)[Id] + "-pivotish";
                    DocServer.GetRefField(docid).then(async docx => {
                        const rootAlias = () => {
                            const rootAlias = Doc.MakeAlias(rootDoc);
                            rootAlias.x = rootAlias.y = 0;
                            return rootAlias;
                        };
                        let wid = rootDoc[WidthSym]();
                        const target = ((docx instanceof Doc) && docx) || Docs.Create.FreeformDocument([rootAlias()], { title: this.props.View.Document.title + "-pivot", _width: 500, _height: 500, }, docid);
                        const docs = await DocListCastAsync(Doc.GetProto(target).data);
                        if (!target.pivotFocusish) (Doc.GetProto(target).pivotFocusish = target);
                        DocListCast(rootDoc.links).forEach(link => {
                            const other = LinkManager.getOppositeAnchor(link, rootDoc);
                            const otherdoc = !other ? undefined : other.annotationOn ? Cast(other.annotationOn, Doc, null) : other;
                            if (otherdoc && !docs?.some(d => Doc.AreProtosEqual(d, otherdoc))) {
                                const alias = Doc.MakeAlias(otherdoc);
                                alias.x = wid;
                                alias.y = 0;
                                alias._lockedPosition = false;
                                wid += otherdoc[WidthSym]();
                                Doc.AddDocToList(Doc.GetProto(target), "data", alias);
                            }
                        });
                        LightboxView.SetLightboxDoc(target);
                    });
                }
                else DocumentLinksButton.LinkEditorDocView = this.props.View;
            }
        }));
    }

    @action @undoBatch
    onLinkClick = (e: React.MouseEvent): void => {
        if (this.props.InMenu && this.props.StartLink) {
            DocumentLinksButton.AnnotationId = undefined;
            DocumentLinksButton.AnnotationUri = undefined;
            if (DocumentLinksButton.StartLink === this.props.View.props.Document) {
                DocumentLinksButton.StartLink = undefined;
                DocumentLinksButton.StartLinkView = undefined;
            } else {
                DocumentLinksButton.StartLink = this.props.View.props.Document;
                DocumentLinksButton.StartLinkView = this.props.View;
            }

            //action(() => Doc.BrushDoc(this.props.View.Document));
        } else if (!this.props.InMenu) {
            DocumentLinksButton.LinkEditorDocView = this.props.View;
        }
    }

    completeLink = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, undoBatch(action((e, doubleTap) => {
            if (doubleTap && !this.props.StartLink) {
                if (DocumentLinksButton.StartLink === this.props.View.props.Document) {
                    DocumentLinksButton.StartLink = undefined;
                    DocumentLinksButton.StartLinkView = undefined;
                    DocumentLinksButton.AnnotationId = undefined;
                } else if (DocumentLinksButton.StartLink && DocumentLinksButton.StartLink !== this.props.View.props.Document) {
                    const sourceDoc = DocumentLinksButton.StartLink;
                    const targetDoc = this.props.View.ComponentView?.getAnchor?.() || this.props.View.Document;
                    const linkDoc = DocUtils.MakeLink({ doc: sourceDoc }, { doc: targetDoc }, "long drag");

                    LinkManager.currentLink = linkDoc;

                    runInAction(() => {
                        if (linkDoc) {
                            TaskCompletionBox.textDisplayed = "Link Created";
                            TaskCompletionBox.popupX = e.screenX;
                            TaskCompletionBox.popupY = e.screenY - 133;
                            TaskCompletionBox.taskCompleted = true;

                            LinkDescriptionPopup.popupX = e.screenX;
                            LinkDescriptionPopup.popupY = e.screenY - 100;
                            LinkDescriptionPopup.descriptionPopup = true;

                            const rect = document.body.getBoundingClientRect();
                            if (LinkDescriptionPopup.popupX + 200 > rect.width) {
                                LinkDescriptionPopup.popupX -= 190;
                                TaskCompletionBox.popupX -= 40;
                            }
                            if (LinkDescriptionPopup.popupY + 100 > rect.height) {
                                LinkDescriptionPopup.popupY -= 40;
                                TaskCompletionBox.popupY -= 40;
                            }

                            setTimeout(action(() => TaskCompletionBox.taskCompleted = false), 2500);
                        }
                    });
                }
            }
        })));
    }

    public static finishLinkClick = undoBatch(action((screenX: number, screenY: number, startLink: Doc, endLink: Doc, startIsAnnotation: boolean, endLinkView?: DocumentView,) => {
        if (startLink === endLink) {
            DocumentLinksButton.StartLink = undefined;
            DocumentLinksButton.StartLinkView = undefined;
            DocumentLinksButton.AnnotationId = undefined;
            DocumentLinksButton.AnnotationUri = undefined;
            //!this.props.StartLink 
        } else if (startLink !== endLink) {
            endLink = endLinkView?.docView?._componentView?.getAnchor?.() || endLink;
            startLink = DocumentLinksButton.StartLinkView?.docView?._componentView?.getAnchor?.() || startLink;
            const linkDoc = DocUtils.MakeLink({ doc: startLink }, { doc: endLink }, DocumentLinksButton.AnnotationId ? "hypothes.is annotation" : "long drag", undefined, undefined, true);

            LinkManager.currentLink = linkDoc;

            if (DocumentLinksButton.AnnotationId && DocumentLinksButton.AnnotationUri) { // if linking from a Hypothes.is annotation
                Doc.GetProto(linkDoc as Doc).linksToAnnotation = true;
                Doc.GetProto(linkDoc as Doc).annotationId = DocumentLinksButton.AnnotationId;
                Doc.GetProto(linkDoc as Doc).annotationUri = DocumentLinksButton.AnnotationUri;
                const dashHyperlink = Utils.prepend("/doc/" + (startIsAnnotation ? endLink[Id] : startLink[Id]));
                Hypothesis.makeLink(StrCast(startIsAnnotation ? endLink.title : startLink.title), dashHyperlink, DocumentLinksButton.AnnotationId,
                    (startIsAnnotation ? startLink : endLink)); // edit annotation to add a Dash hyperlink to the linked doc
            }

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

                const rect = document.body.getBoundingClientRect();
                if (LinkDescriptionPopup.popupX + 200 > rect.width) {
                    LinkDescriptionPopup.popupX -= 190;
                    TaskCompletionBox.popupX -= 40;
                }
                if (LinkDescriptionPopup.popupY + 100 > rect.height) {
                    LinkDescriptionPopup.popupY -= 40;
                    TaskCompletionBox.popupY -= 40;
                }

                setTimeout(action(() => { TaskCompletionBox.taskCompleted = false; }), 2500);
            }
        }
    }));


    @action clearLinks() {
        DocumentLinksButton.StartLink = undefined;
        DocumentLinksButton.StartLinkView = undefined;
    }

    @computed get filteredLinks() {
        const results = [] as Doc[];
        Array.from(new Set<Doc>(this.props.links)).forEach(link => {
            if (!DocUtils.FilterDocs([link], this.props.View.props.docFilters(), []).length) {
                if (DocUtils.FilterDocs([link.anchor2 as Doc], this.props.View.props.docFilters(), []).length) {
                    results.push(link);
                }
                if (DocUtils.FilterDocs([link.anchor1 as Doc], this.props.View.props.docFilters(), []).length) {
                    results.push(link);
                }
            } else results.push(link);
        });
        return results;
    }

    @computed get linkButtonInner() {
        const btnDim = this.props.InMenu ? "20px" : "30px";
        const link = <img style={{ width: "22px", height: "16px" }} src={`/assets/${"link.png"}`} />;

        return <div className="documentLinksButton-cont" ref={this._linkButton}
            style={{ left: this.props.Offset?.[0], top: this.props.Offset?.[1], right: this.props.Offset?.[2], bottom: this.props.Offset?.[3] }}
        >
            <div className={"documentLinksButton"}
                onPointerDown={this.onLinkButtonDown} onClick={this.onLinkClick}
                style={{
                    backgroundColor: this.props.InMenu ? "" : "#add8e6",
                    color: this.props.InMenu ? "white" : "black",
                    width: btnDim,
                    height: btnDim,
                }} >
                {this.props.InMenu ?
                    this.props.StartLink ?
                        <FontAwesomeIcon className="documentdecorations-icon" icon="link" size="sm" />
                        : link
                    : Array.from(this.filteredLinks).length}
            </div>
            {this.props.InMenu && !this.props.StartLink && DocumentLinksButton.StartLink !== this.props.View.props.Document ?
                <div className={"documentLinksButton-endLink"}
                    style={{
                        width: btnDim, height: btnDim,
                        backgroundColor: DocumentLinksButton.StartLink ? "" : "grey",
                        opacity: DocumentLinksButton.StartLink ? "" : "50%",
                        border: DocumentLinksButton.StartLink ? "" : "none",
                        cursor: DocumentLinksButton.StartLink ? "pointer" : "default"
                    }}
                    onPointerDown={DocumentLinksButton.StartLink && this.completeLink}
                    onClick={e => DocumentLinksButton.StartLink && DocumentLinksButton.finishLinkClick(e.clientX, e.clientY, DocumentLinksButton.StartLink, this.props.View.props.Document, true, this.props.View)} />
                : (null)
            }
            {DocumentLinksButton.StartLink === this.props.View.props.Document && this.props.InMenu && this.props.StartLink ?
                <div className={"documentLinksButton-startLink"} onPointerDown={this.clearLinks} onClick={this.clearLinks} style={{ width: btnDim, height: btnDim }} />
                : (null)
            }
        </div >;
    }

    render() {
        TraceMobx();

        const menuTitle = this.props.StartLink ? "Drag or tap to start link" : "Tap to complete link";
        const buttonTitle = "Tap to view links; double tap to open link collection";
        const title = this.props.InMenu ? menuTitle : buttonTitle;

        return !Array.from(this.filteredLinks).length && !this.props.AlwaysOn ? (null) :
            this.props.InMenu && (DocumentLinksButton.StartLink || this.props.StartLink) ?
                <Tooltip title={<><div className="dash-tooltip">{title}</div></>}>
                    {this.linkButtonInner}
                </Tooltip>
                :
                !DocumentLinksButton.LinkEditorDocView && !this.props.InMenu ?
                    <Tooltip title={<><div className="dash-tooltip">{title}</div></>}>
                        {this.linkButtonInner}
                    </Tooltip>
                    : this.linkButtonInner;
    }
}
