import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { action, computed, IReactionDisposer, reaction, trace, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, Opt, WidthSym, DocListCastAsync } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { ObjectField } from "../../../new_fields/ObjectField";
import { createSchema, makeInterface, listSpec } from "../../../new_fields/Schema";
import { BoolCast, Cast, FieldValue, StrCast, NumCast, PromiseValue } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { emptyFunction, Utils, returnFalse, returnTrue } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils, DocumentType } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager, dropActionType } from "../../util/DragManager";
import { SearchUtil } from "../../util/SearchUtil";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { CollectionView } from "../collections/CollectionView";
import { ContextMenu } from "../ContextMenu";
import { DocComponent } from "../DocComponent";
import { PresentationView } from "../presentationview/PresentationView";
import { Template, Templates } from "./../Templates";
import { DocumentContentsView } from "./DocumentContentsView";
import * as rp from "request-promise";
import "./DocumentView.scss";
import React = require("react");
import { Id, Copy } from '../../../new_fields/FieldSymbols';
import { ContextMenuProps } from '../ContextMenuItem';
import { list, object, createSimpleSchema } from 'serializr';
import { LinkManager } from '../../util/LinkManager';
import { RouteStore } from '../../../server/RouteStore';
import { FormattedTextBox } from './FormattedTextBox';
import { OverlayView } from '../OverlayView';
import { ScriptingRepl } from '../ScriptingRepl';
import { ClientUtils } from '../../util/ClientUtils';
import { EditableView } from '../EditableView';
import { faHandPointer, faHandPointRight } from '@fortawesome/free-regular-svg-icons';
import { DocumentDecorations } from '../DocumentDecorations';
import { DictationManager } from '../../util/DictationManager';
import { CollectionViewType } from '../collections/CollectionBaseView';
const JsxParser = require('react-jsx-parser').default; //TODO Why does this need to be imported like this?

library.add(fa.faTrash);
library.add(fa.faShare);
library.add(fa.faDownload);
library.add(fa.faExpandArrowsAlt);
library.add(fa.faCompressArrowsAlt);
library.add(fa.faLayerGroup);
library.add(fa.faExternalLinkAlt);
library.add(fa.faAlignCenter);
library.add(fa.faCaretSquareRight);
library.add(fa.faSquare);
library.add(fa.faConciergeBell);
library.add(fa.faWindowRestore);
library.add(fa.faFolder);
library.add(fa.faMapPin);
library.add(fa.faLink);
library.add(fa.faFingerprint);
library.add(fa.faCrosshairs);
library.add(fa.faDesktop);
library.add(fa.faUnlock);
library.add(fa.faLock);
library.add(fa.faLaptopCode, fa.faMale, fa.faCopy, fa.faHandPointRight, fa.faCompass, fa.faSnowflake, fa.faMicrophone);

// const linkSchema = createSchema({
//     title: "string",
//     linkDescription: "string",
//     linkTags: "string",
//     linkedTo: Doc,
//     linkedFrom: Doc
// });

// type LinkDoc = makeInterface<[typeof linkSchema]>;
// const LinkDoc = makeInterface(linkSchema);

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Doc;
    DataDoc?: Doc;
    fitToBox?: boolean;
    addDocument?: (doc: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument?: (doc: Doc) => boolean;
    moveDocument?: (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    renderDepth: number;
    showOverlays?: (doc: Doc) => { title?: string, caption?: string };
    ContentScaling: () => number;
    PanelWidth: () => number;
    PanelHeight: () => number;
    focus: (doc: Doc, willZoom: boolean, scale?: number) => void;
    selectOnLoad: boolean;
    parentActive: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    bringToFront: (doc: Doc, sendToBack?: boolean) => void;
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => void;
    collapseToPoint?: (scrpt: number[], expandedDocs: Doc[] | undefined) => void;
    zoomToScale: (scale: number) => void;
    getScale: () => number;
    animateBetweenIcon?: (iconPos: number[], startTime: number, maximizing: boolean) => void;
    ChromeHeight?: () => number;
}

const schema = createSchema({
    layout: "string",
    nativeWidth: "number",
    nativeHeight: "number",
    backgroundColor: "string",
    opacity: "number",
    hidden: "boolean"
});

export const positionSchema = createSchema({
    nativeWidth: "number",
    nativeHeight: "number",
    width: "number",
    height: "number",
    x: "number",
    y: "number",
});

export type PositionDocument = makeInterface<[typeof positionSchema]>;
export const PositionDocument = makeInterface(positionSchema);

type Document = makeInterface<[typeof schema]>;
const Document = makeInterface(schema);

@observer
export class DocumentView extends DocComponent<DocumentViewProps, Document>(Document) {
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    private _doubleTap = false;
    private _hitExpander = false;
    private _mainCont = React.createRef<HTMLDivElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;

    public get ContentDiv() { return this._mainCont.current; }
    @computed get active(): boolean { return SelectionManager.IsSelected(this) || this.props.parentActive(); }
    @computed get topMost(): boolean { return this.props.renderDepth === 0; }
    @computed get templates(): List<string> {
        let field = this.props.Document.templates;
        if (field && field instanceof List) {
            return field;
        }
        return new List<string>();
    }
    set templates(templates: List<string>) { this.props.Document.templates = templates; }
    screenRect = (): ClientRect | DOMRect => this._mainCont.current ? this._mainCont.current.getBoundingClientRect() : new DOMRect();

    _animateToIconDisposer?: IReactionDisposer;
    _reactionDisposer?: IReactionDisposer;
    @action
    componentDidMount() {
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
        // bcz: kind of ugly .. setup a reaction to update the title of a summary document's target (maximizedDocs) whenver the summary doc's title changes
        this._reactionDisposer = reaction(() => [DocListCast(this.props.Document.maximizedDocs).map(md => md.title),
        this.props.Document.summaryDoc, this.props.Document.summaryDoc instanceof Doc ? this.props.Document.summaryDoc.title : ""],
            () => {
                let maxDoc = DocListCast(this.props.Document.maximizedDocs);
                if (maxDoc.length === 1 && StrCast(this.props.Document.title).startsWith("-") && StrCast(this.props.Document.layout).indexOf("IconBox") !== -1) {
                    this.props.Document.proto!.title = "-" + maxDoc[0].title + ".icon";
                }
                let sumDoc = Cast(this.props.Document.summaryDoc, Doc);
                if (sumDoc instanceof Doc && StrCast(this.props.Document.title).startsWith("-")) {
                    this.props.Document.proto!.title = "-" + sumDoc.title + ".expanded";
                }
            }, { fireImmediately: true });
        this._animateToIconDisposer = reaction(() => this.props.Document.isIconAnimating, (values) =>
            (values instanceof List) && this.animateBetweenIcon(values, values[2], values[3] ? true : false)
            , { fireImmediately: true });
        DocumentManager.Instance.DocumentViews.push(this);
    }

    animateBetweenIcon = (iconPos: number[], startTime: number, maximizing: boolean) => {
        this.props.animateBetweenIcon ? this.props.animateBetweenIcon(iconPos, startTime, maximizing) :
            DocumentView.animateBetweenIconFunc(this.props.Document, this.Document[WidthSym](), this.Document[HeightSym](), startTime, maximizing);
    }

    public static animateBetweenIconFunc = (doc: Doc, width: number, height: number, stime: number, maximizing: boolean, cb?: (progress: number) => void) => {
        setTimeout(() => {
            let now = Date.now();
            let progress = now < stime + 200 ? Math.min(1, (now - stime) / 200) : 1;
            doc.width = progress === 1 ? width : maximizing ? 25 + (width - 25) * progress : width + (25 - width) * progress;
            doc.height = progress === 1 ? height : maximizing ? 25 + (height - 25) * progress : height + (25 - height) * progress;
            cb && cb(progress);
            if (now < stime + 200) {
                DocumentView.animateBetweenIconFunc(doc, width, height, stime, maximizing, cb);
            }
            else {
                doc.isMinimized = !maximizing;
                doc.isIconAnimating = undefined;
            }
            doc.willMaximize = false;
        },
            2);
    }
    @action
    componentDidUpdate() {
        if (this._dropDisposer) {
            this._dropDisposer();
        }
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
    }
    @action
    componentWillUnmount() {
        if (this._reactionDisposer) this._reactionDisposer();
        if (this._animateToIconDisposer) this._animateToIconDisposer();
        if (this._dropDisposer) this._dropDisposer();
        DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);
    }

    stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    }

    get dataDoc() {
        if (this.props.DataDoc === undefined && this.props.Document.layout instanceof Doc) {
            // if there is no dataDoc (ie, we're not rendering a temlplate layout), but this document
            // has a template layout document, then we will render the template layout but use 
            // this document as the data document for the layout.
            return this.props.Document;
        }
        return this.props.DataDoc !== this.props.Document ? this.props.DataDoc : undefined;
    }
    startDragging(x: number, y: number, dropAction: dropActionType, dragSubBullets: boolean) {
        if (this._mainCont.current) {
            let allConnected = [this.props.Document, ...(dragSubBullets ? DocListCast(this.props.Document.subBulletDocs) : [])];
            let alldataConnected = [this.dataDoc, ...(dragSubBullets ? DocListCast(this.props.Document.subBulletDocs) : [])];
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            let dragData = new DragManager.DocumentDragData(allConnected, alldataConnected);
            const [xoff, yoff] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).transformDirection(x - left, y - top);
            dragData.dropAction = dropAction;
            dragData.xOffset = xoff;
            dragData.yOffset = yoff;
            dragData.moveDocument = this.props.moveDocument;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, {
                handlers: {
                    dragComplete: action(emptyFunction)
                },
                hideSource: !dropAction
            });
        }
    }
    toggleMinimized = async () => {
        let minimizedDoc = await Cast(this.props.Document.minimizedDoc, Doc);
        if (minimizedDoc) {
            let scrpt = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(
                NumCast(minimizedDoc.x) - NumCast(this.Document.x), NumCast(minimizedDoc.y) - NumCast(this.Document.y));
            this.collapseTargetsToPoint(scrpt, await DocListCastAsync(minimizedDoc.maximizedDocs));
        }
    }

    static _undoBatch?: UndoManager.Batch = undefined;
    @action
    public collapseTargetsToPoint = (scrpt: number[], expandedDocs: Doc[] | undefined): void => {
        SelectionManager.DeselectAll();
        if (expandedDocs) {
            if (!DocumentView._undoBatch) {
                DocumentView._undoBatch = UndoManager.StartBatch("iconAnimating");
            }
            let isMinimized: boolean | undefined;
            expandedDocs.map(maximizedDoc => {
                let iconAnimating = Cast(maximizedDoc.isIconAnimating, List);
                if (!iconAnimating || (Date.now() - iconAnimating[2] > 1000)) {
                    if (isMinimized === undefined) {
                        isMinimized = BoolCast(maximizedDoc.isMinimized);
                    }
                    maximizedDoc.willMaximize = isMinimized;
                    maximizedDoc.isMinimized = false;
                    maximizedDoc.isIconAnimating = new List<number>([scrpt[0], scrpt[1], Date.now(), isMinimized ? 1 : 0]);
                }
            });
            setTimeout(() => {
                DocumentView._undoBatch && DocumentView._undoBatch.end();
                DocumentView._undoBatch = undefined;
            }, 500);
        }
    }

    onClick = async (e: React.MouseEvent) => {
        if (e.nativeEvent.cancelBubble) return; // needed because EditableView may stopPropagation which won't apparently stop this event from firing.
        e.stopPropagation();
        let altKey = e.altKey;
        let ctrlKey = e.ctrlKey;
        if (this._doubleTap && this.props.renderDepth) {
            let fullScreenAlias = Doc.MakeAlias(this.props.Document);
            fullScreenAlias.templates = new List<string>();
            Doc.UseDetailLayout(fullScreenAlias);
            fullScreenAlias.showCaption = true;
            this.props.addDocTab(fullScreenAlias, this.dataDoc, "inTab");
            SelectionManager.DeselectAll();
            this.props.Document.libraryBrush = false;
        }
        else if (CurrentUserUtils.MainDocId !== this.props.Document[Id] &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
                Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            SelectionManager.SelectDoc(this, e.ctrlKey);
            let isExpander = (e.target as any).id === "isExpander";
            if (BoolCast(this.props.Document.isButton) || isExpander) {
                SelectionManager.DeselectAll();
                let subBulletDocs = await DocListCastAsync(this.props.Document.subBulletDocs);
                let maximizedDocs = await DocListCastAsync(this.props.Document.maximizedDocs);
                let summarizedDocs = await DocListCastAsync(this.props.Document.summarizedDocs);
                let linkedDocs = LinkManager.Instance.getAllRelatedLinks(this.props.Document);
                let expandedDocs: Doc[] = [];
                expandedDocs = subBulletDocs ? [...subBulletDocs, ...expandedDocs] : expandedDocs;
                expandedDocs = maximizedDocs ? [...maximizedDocs, ...expandedDocs] : expandedDocs;
                expandedDocs = summarizedDocs ? [...summarizedDocs, ...expandedDocs] : expandedDocs;
                // let expandedDocs = [...(subBulletDocs ? subBulletDocs : []), ...(maximizedDocs ? maximizedDocs : []), ...(summarizedDocs ? summarizedDocs : []),];
                if (expandedDocs.length) {   // bcz: need a better way to associate behaviors with click events on widget-documents
                    let maxLocation = StrCast(this.props.Document.maximizeLocation, "inPlace");
                    let getDispDoc = (target: Doc) => Object.getOwnPropertyNames(target).indexOf("isPrototype") === -1 ? target : Doc.MakeDelegate(target);
                    if (altKey || ctrlKey) {
                        maxLocation = this.props.Document.maximizeLocation = (ctrlKey ? maxLocation : (maxLocation === "inPlace" || !maxLocation ? "inTab" : "inPlace"));
                        if (!maxLocation || maxLocation === "inPlace") {
                            let hadView = expandedDocs.length === 1 && DocumentManager.Instance.getDocumentView(expandedDocs[0], this.props.ContainingCollectionView);
                            let wasMinimized = !hadView && expandedDocs.reduce((min, d) => !min && !BoolCast(d.IsMinimized), false);
                            expandedDocs.forEach(maxDoc => Doc.GetProto(maxDoc).isMinimized = false);
                            let hasView = expandedDocs.length === 1 && DocumentManager.Instance.getDocumentView(expandedDocs[0], this.props.ContainingCollectionView);
                            if (!hasView) {
                                this.props.addDocument && expandedDocs.forEach(async maxDoc => this.props.addDocument!(getDispDoc(maxDoc), false));
                            }
                            expandedDocs.forEach(maxDoc => maxDoc.isMinimized = wasMinimized);
                        }
                    }
                    if (maxLocation && maxLocation !== "inPlace" && CollectionDockingView.Instance) {
                        let dataDocs = DocListCast(CollectionDockingView.Instance.props.Document.data);
                        if (dataDocs) {
                            expandedDocs.forEach(maxDoc =>
                                (!CollectionDockingView.Instance.CloseRightSplit(Doc.GetProto(maxDoc)) &&
                                    this.props.addDocTab(getDispDoc(maxDoc), undefined, maxLocation)));
                        }
                    } else {
                        let scrpt = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(NumCast(this.Document.width) / 2, NumCast(this.Document.height) / 2);
                        this.collapseTargetsToPoint(scrpt, expandedDocs);
                    }
                }
                else if (linkedDocs.length) {
                    let first = linkedDocs.filter(d => Doc.AreProtosEqual(d.anchor1 as Doc, this.props.Document));
                    let linkedFwdDocs = first.length ? [first[0].anchor2 as Doc, first[0].anchor1 as Doc] : [expandedDocs[0], expandedDocs[0]];

                    // @TODO: shouldn't always follow target context
                    let linkedFwdContextDocs = [first.length ? await (first[0].targetContext) as Doc : undefined, undefined];

                    let linkedFwdPage = [first.length ? NumCast(first[0].anchor2Page, undefined) : undefined, undefined];

                    if (!linkedFwdDocs.some(l => l instanceof Promise)) {
                        let maxLocation = StrCast(linkedFwdDocs[0].maximizeLocation, "inTab");
                        let targetContext = !Doc.AreProtosEqual(linkedFwdContextDocs[altKey ? 1 : 0], this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.Document) ? linkedFwdContextDocs[altKey ? 1 : 0] : undefined;
                        DocumentManager.Instance.jumpToDocument(linkedFwdDocs[altKey ? 1 : 0], ctrlKey, false, document => {
                            this.props.focus(this.props.Document, true, 1);
                            setTimeout(() =>
                                this.props.addDocTab(document, undefined, maxLocation), 1000);
                        }
                            , linkedFwdPage[altKey ? 1 : 0], targetContext);
                    }
                }
            }
        }
    }
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        this._hitExpander = DocListCast(this.props.Document.subBulletDocs).length > 0;
        // if (e.shiftKey && e.buttons === 1 && CollectionDockingView.Instance) {
        // CollectionDockingView.Instance.StartOtherDrag(e, [Doc.MakeAlias(this.props.Document)], [this.dataDoc]);
        // e.stopPropagation();
        // } else {
        if (this.active) e.stopPropagation(); // events stop at the lowest document that is active.  
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
        // }
    }
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble && this.active) {
            if (!this.props.Document.excludeFromLibrary && (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3)) {
                if (!e.altKey && !this.topMost && e.buttons === 1 && !BoolCast(this.props.Document.lockedPosition)) {
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                    this.startDragging(this._downX, this._downY, e.ctrlKey || e.altKey ? "alias" : undefined, this._hitExpander);
                }
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        this._doubleTap = (Date.now() - this._lastTap < 300 && e.button === 0 && Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2);
        this._lastTap = Date.now();
    }

    @undoBatch
    deleteClicked = (): void => { SelectionManager.DeselectAll(); this.props.removeDocument && this.props.removeDocument(this.props.Document); }

    @undoBatch
    fieldsClicked = (): void => {
        let kvp = Docs.Create.KVPDocument(this.props.Document, { width: 300, height: 300 });
        this.props.addDocTab(kvp, this.dataDoc, "onRight");
    }

    @undoBatch
    makeBtnClicked = (): void => {
        let doc = Doc.GetProto(this.props.Document);
        doc.isButton = !BoolCast(doc.isButton);
        if (doc.isButton) {
            if (!doc.nativeWidth) {
                doc.nativeWidth = this.props.Document[WidthSym]();
                doc.nativeHeight = this.props.Document[HeightSym]();
            }
        } else {
            doc.nativeWidth = doc.nativeHeight = undefined;
        }
    }

    @undoBatch
    public fullScreenClicked = (): void => {
        CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(this);
        SelectionManager.DeselectAll();
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.AnnotationDragData) {
            e.stopPropagation();
            let annotationDoc = de.data.annotationDocument;
            annotationDoc.linkedToDoc = true;
            de.data.targetContext = this.props.ContainingCollectionView!.props.Document;
            let targetDoc = this.props.Document;
            targetDoc.targetContext = de.data.targetContext;
            let annotations = await DocListCastAsync(annotationDoc.annotations);
            if (annotations) {
                annotations.forEach(anno => {
                    anno.target = targetDoc;
                });
            }
            let pdfDoc = await Cast(annotationDoc.pdfDoc, Doc);
            if (pdfDoc) {
                DocUtils.MakeLink(annotationDoc, targetDoc, this.props.ContainingCollectionView!.props.Document, `Annotation from ${StrCast(pdfDoc.title)}`, "", StrCast(pdfDoc.title));
            }
        }
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc = de.data.linkSourceDocument;
            let destDoc = this.props.Document;

            e.stopPropagation();
            if (de.mods === "AltKey") {
                const protoDest = destDoc.proto;
                const protoSrc = sourceDoc.proto;
                let src = protoSrc ? protoSrc : sourceDoc;
                let dst = protoDest ? protoDest : destDoc;
                dst.data = (src.data! as ObjectField)[Copy]();
                dst.nativeWidth = src.nativeWidth;
                dst.nativeHeight = src.nativeHeight;
            }
            else {
                // const docs = await SearchUtil.Search(`data_l:"${destDoc[Id]}"`, true);
                // const views = docs.map(d => DocumentManager.Instance.getDocumentView(d)).filter(d => d).map(d => d as DocumentView);
                let linkDoc = DocUtils.MakeLink(sourceDoc, destDoc, this.props.ContainingCollectionView ? this.props.ContainingCollectionView.props.Document : undefined);
                de.data.droppedDocuments.push(destDoc);
                de.data.linkDocument = linkDoc;
            }
        }
    }

    @action
    onDrop = (e: React.DragEvent) => {
        let text = e.dataTransfer.getData("text/plain");
        if (!e.isDefaultPrevented() && text && text.startsWith("<div")) {
            let oldLayout = FieldValue(this.Document.layout) || "";
            let layout = text.replace("{layout}", oldLayout);
            this.Document.layout = layout;
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    addTemplate = (template: Template) => {
        this.templates.push(template.Layout);
        this.templates = this.templates;
    }

    @action
    removeTemplate = (template: Template) => {
        for (let i = 0; i < this.templates.length; i++) {
            if (this.templates[i] === template.Layout) {
                this.templates.splice(i, 1);
                break;
            }
        }
        this.templates = this.templates;
    }
    @action
    clearTemplates = () => {
        this.templates.length = 0;
        this.templates = this.templates;
    }

    @undoBatch
    @action
    freezeNativeDimensions = (): void => {
        let proto = this.props.Document.isTemplate ? this.props.Document : Doc.GetProto(this.props.Document);
        this.props.Document.autoHeight = proto.autoHeight = false;
        proto.ignoreAspect = !BoolCast(proto.ignoreAspect);
        if (!BoolCast(proto.ignoreAspect) && !proto.nativeWidth) {
            proto.nativeWidth = this.props.PanelWidth();
            proto.nativeHeight = this.props.PanelHeight();
        }
    }
    @undoBatch
    @action
    makeBackground = (): void => {
        this.props.Document.isBackground = !this.props.Document.isBackground;
        this.props.Document.isBackground && this.props.bringToFront(this.props.Document, true);
    }

    @undoBatch
    @action
    toggleLockPosition = (): void => {
        this.props.Document.lockedPosition = BoolCast(this.props.Document.lockedPosition) ? undefined : true;
    }

    listen = async () => {
        let transcript = await DictationManager.Controls.listen();
        transcript && (Doc.GetProto(this.props.Document).transcript = transcript);
    }

    @action
    onContextMenu = async (e: React.MouseEvent): Promise<void> => {
        e.persist();
        e.stopPropagation();
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3 ||
            e.isDefaultPrevented()) {
            e.preventDefault();
            return;
        }
        e.preventDefault();

        const cm = ContextMenu.Instance;
        let subitems: ContextMenuProps[] = [];
        subitems.push({ description: "Open Full Screen", event: this.fullScreenClicked, icon: "desktop" });
        subitems.push({ description: "Open Tab", event: () => this.props.addDocTab && this.props.addDocTab(this.props.Document, this.dataDoc, "inTab"), icon: "folder" });
        subitems.push({ description: "Open Tab Alias", event: () => this.props.addDocTab && this.props.addDocTab(Doc.MakeAlias(this.props.Document), this.dataDoc, "inTab"), icon: "folder" });
        subitems.push({ description: "Open Right", event: () => this.props.addDocTab && this.props.addDocTab(this.props.Document, this.dataDoc, "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Right Alias", event: () => this.props.addDocTab && this.props.addDocTab(Doc.MakeAlias(this.props.Document), this.dataDoc, "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Fields", event: this.fieldsClicked, icon: "layer-group" });
        cm.addItem({ description: "Open...", subitems: subitems, icon: "external-link-alt" });
        cm.addItem({ description: BoolCast(this.props.Document.ignoreAspect, false) || !this.props.Document.nativeWidth || !this.props.Document.nativeHeight ? "Freeze" : "Unfreeze", event: this.freezeNativeDimensions, icon: "snowflake" });
        cm.addItem({ description: "Pin to Presentation", event: () => PresentationView.Instance.PinDoc(this.props.Document), icon: "map-pin" });
        cm.addItem({ description: BoolCast(this.props.Document.lockedPosition) ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.props.Document.lockedPosition) ? "unlock" : "lock" });
        cm.addItem({ description: "Transcribe Speech", event: this.listen, icon: "microphone" });
        let makes: ContextMenuProps[] = [];
        makes.push({ description: this.props.Document.isBackground ? "Remove Background" : "Make Background", event: this.makeBackground, icon: BoolCast(this.props.Document.lockedPosition) ? "unlock" : "lock" });
        makes.push({ description: this.props.Document.isButton ? "Remove Button" : "Make Button", event: this.makeBtnClicked, icon: "concierge-bell" });
        makes.push({
            description: "Make Portal", event: () => {
                let portal = Docs.Create.FreeformDocument([], { width: this.props.Document[WidthSym]() + 10, height: this.props.Document[HeightSym](), title: this.props.Document.title + ".portal" });
                //Doc.GetProto(this.props.Document).subBulletDocs = new List<Doc>([portal]);
                //summary.proto!.maximizeLocation = "inTab";  // or "inPlace", or "onRight"
                //Doc.GetProto(this.props.Document).templates = new List<string>([Templates.Bullet.Layout]);
                //let coll = Docs.Create.StackingDocument([this.props.Document, portal], { x: NumCast(this.props.Document.x), y: NumCast(this.props.Document.y), width: this.props.Document[WidthSym]() + 10, height: this.props.Document[HeightSym](), title: this.props.Document.title + ".cont" });
                //this.props.addDocument && this.props.addDocument(coll);
                //this.props.removeDocument && this.props.removeDocument(this.props.Document);
                DocUtils.MakeLink(this.props.Document, portal, undefined, this.props.Document.title + ".portal");
                this.makeBtnClicked();

            }, icon: "window-restore"
        });
        cm.addItem({ description: "Make...", subitems: makes, icon: "hand-point-right" });
        // cm.addItem({
        //     description: "Find aliases", event: async () => {
        //         const aliases = await SearchUtil.GetAliasesOfDocument(this.props.Document);
        //         this.props.addDocTab && this.props.addDocTab(Docs.Create.SchemaDocument(["title"], aliases, {}), undefined, "onRight"); // bcz: dataDoc?
        //     }, icon: "search"
        // });
        if (this.props.Document.detailedLayout && !this.props.Document.isTemplate) {
            cm.addItem({ description: "Toggle detail", event: () => Doc.ToggleDetailLayout(this.props.Document), icon: "image" });
        }
        cm.addItem({ description: "Add Repl", icon: "laptop-code", event: () => OverlayView.Instance.addWindow(<ScriptingRepl />, { x: 300, y: 100, width: 200, height: 200, title: "Scripting REPL" }) });
        let existing = ContextMenu.Instance.findByDescription("Layout...");
        let layoutItems: ContextMenuProps[] = existing && "subitems" in existing ? existing.subitems : [];
        layoutItems.push({ description: "Center View", event: () => this.props.focus(this.props.Document, false), icon: "crosshairs" });
        layoutItems.push({ description: "Zoom to Document", event: () => this.props.focus(this.props.Document, true), icon: "search" });
        !existing && cm.addItem({ description: "Layout...", subitems: layoutItems, icon: "compass" });
        if (!ClientUtils.RELEASE) {
            let copies: ContextMenuProps[] = [];
            copies.push({ description: "Copy URL", event: () => Utils.CopyText(Utils.prepend("/doc/" + this.props.Document[Id])), icon: "link" });
            copies.push({ description: "Copy ID", event: () => Utils.CopyText(this.props.Document[Id]), icon: "fingerprint" });
            cm.addItem({ description: "Copy...", subitems: copies, icon: "copy" });
        }
        cm.addItem({
            description: "Download document", icon: "download", event: () => {
                const a = document.createElement("a");
                const url = Utils.prepend(`/downloadId/${this.props.Document[Id]}`);
                a.href = url;
                a.download = `DocExport-${this.props.Document[Id]}.zip`;
                a.click();
            }
        });
        cm.addItem({ description: "Delete", event: this.deleteClicked, icon: "trash" });
        type User = { email: string, userDocumentId: string };
        let usersMenu: ContextMenuProps[] = [];
        try {
            let stuff = await rp.get(Utils.prepend(RouteStore.getUsers));
            const users: User[] = JSON.parse(stuff);
            usersMenu = users.filter(({ email }) => email !== CurrentUserUtils.email).map(({ email, userDocumentId }) => ({
                description: email, event: async () => {
                    const userDocument = await Cast(DocServer.GetRefField(userDocumentId), Doc);
                    if (!userDocument) {
                        throw new Error(`Couldn't get user document of user ${email}`);
                    }
                    const notifDoc = await Cast(userDocument.optionalRightCollection, Doc);
                    if (notifDoc instanceof Doc) {
                        const data = await Cast(notifDoc.data, listSpec(Doc));
                        const sharedDoc = Doc.MakeAlias(this.props.Document);
                        if (data) {
                            data.push(sharedDoc);
                        } else {
                            notifDoc.data = new List([sharedDoc]);
                        }
                    }
                }, icon: "male"
            }));
        } catch {

        }
        runInAction(() => {
            cm.addItem({ description: "Share...", subitems: usersMenu, icon: "share" });
            if (!this.topMost) {
                // DocumentViews should stop propagation of this event
                e.stopPropagation();
            }
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
            if (!SelectionManager.IsSelected(this)) {
                SelectionManager.SelectDoc(this, false);
            }
        });
    }

    onPointerEnter = (e: React.PointerEvent): void => { this.props.Document.libraryBrush = true; };
    onPointerLeave = (e: React.PointerEvent): void => { this.props.Document.libraryBrush = false; };

    isSelected = () => SelectionManager.IsSelected(this);
    @action select = (ctrlPressed: boolean) => { SelectionManager.SelectDoc(this, ctrlPressed); };

    @computed get nativeWidth() { return this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.Document.nativeHeight || 0; }
    @computed get contents() {
        return (<DocumentContentsView {...this.props}
            ChromeHeight={this.chromeHeight}
            isSelected={this.isSelected} select={this.select}
            selectOnLoad={this.props.selectOnLoad}
            layoutKey={"layout"}
            fitToBox={BoolCast(this.props.Document.fitToBox) ? true : this.props.fitToBox}
            DataDoc={this.dataDoc} />);
    }

    chromeHeight = () => {
        let showOverlays = this.props.showOverlays ? this.props.showOverlays(this.layoutDoc) : undefined;
        let showTitle = showOverlays && "title" in showOverlays ? showOverlays.title : StrCast(this.layoutDoc.showTitle);
        return showTitle ? 25 : 0;
    }

    get layoutDoc() {
        // if this document's layout field contains a document (ie, a rendering template), then we will use that
        // to determine the render JSX string, otherwise the layout field should directly contain a JSX layout string.
        return this.props.Document.layout instanceof Doc ? this.props.Document.layout : this.props.Document;
    }
    render() {
        if (this.Document.hidden) {
            return null;
        }
        let self = this;
        let backgroundColor = StrCast(this.layoutDoc.backgroundColor);
        let foregroundColor = StrCast(this.layoutDoc.color);
        var nativeWidth = this.nativeWidth > 0 && !BoolCast(this.props.Document.ignoreAspect) ? `${this.nativeWidth}px` : "100%";
        var nativeHeight = BoolCast(this.props.Document.ignoreAspect) ? this.props.PanelHeight() / this.props.ContentScaling() : this.nativeHeight > 0 ? `${this.nativeHeight}px` : "100%";
        let showOverlays = this.props.showOverlays ? this.props.showOverlays(this.layoutDoc) : undefined;
        let showTitle = showOverlays && "title" in showOverlays ? showOverlays.title : StrCast(this.layoutDoc.showTitle);
        let showCaption = showOverlays && "caption" in showOverlays ? showOverlays.caption : StrCast(this.layoutDoc.showCaption);
        let templates = Cast(this.layoutDoc.templates, listSpec("string"));
        if (!showOverlays && templates instanceof List) {
            templates.map(str => {
                if (str.indexOf("{props.Document.title}") !== -1) showTitle = "title";
                if (str.indexOf("fieldKey={\"caption\"}") !== -1) showCaption = "caption";
            });
        }
        let showTextTitle = showTitle && StrCast(this.layoutDoc.layout).startsWith("<FormattedTextBox") ? showTitle : undefined;
        return (
            <div className={`documentView-node${this.topMost ? "-topmost" : ""}`}
                ref={this._mainCont}
                style={{
                    pointerEvents: this.layoutDoc.isBackground && !this.isSelected() ? "none" : "all",
                    color: foregroundColor,
                    outlineColor: "maroon",
                    outlineStyle: "dashed",
                    outlineWidth: BoolCast(this.layoutDoc.libraryBrush) && !StrCast(Doc.GetProto(this.props.Document).borderRounding) ?
                        `${this.props.ScreenToLocalTransform().Scale}px` : "0px",
                    marginLeft: BoolCast(this.layoutDoc.libraryBrush) && StrCast(Doc.GetProto(this.props.Document).borderRounding) ?
                        `${-1 * this.props.ScreenToLocalTransform().Scale}px` : undefined,
                    marginTop: BoolCast(this.layoutDoc.libraryBrush) && StrCast(Doc.GetProto(this.props.Document).borderRounding) ?
                        `${-1 * this.props.ScreenToLocalTransform().Scale}px` : undefined,
                    border: BoolCast(this.layoutDoc.libraryBrush) && StrCast(Doc.GetProto(this.props.Document).borderRounding) ?
                        `dashed maroon ${this.props.ScreenToLocalTransform().Scale}px` : undefined,
                    borderRadius: "inherit",
                    background: backgroundColor,
                    width: nativeWidth,
                    height: nativeHeight,
                    transform: `scale(${this.props.ContentScaling()})`,
                    opacity: this.Document.opacity
                }}
                onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}
                onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}
            >
                {!showTitle && !showCaption ? this.contents :
                    <div style={{ position: "absolute", display: "inline-block", width: "100%", height: "100%", pointerEvents: "none" }}>

                        <div style={{ width: "100%", height: showTextTitle ? "calc(100% - 33px)" : "100%", display: "inline-block", position: "absolute", top: showTextTitle ? "29px" : undefined }}>
                            {this.contents}
                        </div>
                        {!showTitle ? (null) :
                            <div style={{
                                position: showTextTitle ? "relative" : "absolute", top: 0, padding: "4px", textAlign: "center", textOverflow: "ellipsis", whiteSpace: "pre",
                                pointerEvents: SelectionManager.GetIsDragging() ? "none" : "all",
                                overflow: "hidden", width: `${100 * this.props.ContentScaling()}%`, height: 25, background: "rgba(0, 0, 0, .4)", color: "white",
                                transformOrigin: "top left", transform: `scale(${1 / this.props.ContentScaling()})`
                            }}>
                                <EditableView
                                    contents={(this.layoutDoc.isTemplate || !this.dataDoc ? this.layoutDoc : this.dataDoc)[showTitle]}
                                    display={"block"}
                                    height={72}
                                    fontSize={12}
                                    GetValue={() => StrCast((this.layoutDoc.isTemplate || !this.dataDoc ? this.layoutDoc : this.dataDoc)[showTitle!])}
                                    SetValue={(value: string) => (Doc.GetProto(this.layoutDoc)[showTitle!] = value) ? true : true}
                                />
                            </div>
                        }
                        {!showCaption ? (null) :
                            <div style={{ position: "absolute", bottom: 0, transformOrigin: "bottom left", width: `${100 * this.props.ContentScaling()}%`, transform: `scale(${1 / this.props.ContentScaling()})` }}>
                                <FormattedTextBox {...this.props} DataDoc={this.dataDoc} active={returnTrue} isSelected={this.isSelected} focus={emptyFunction} select={this.select} selectOnLoad={this.props.selectOnLoad} fieldExt={""} hideOnLeave={true} fieldKey={showCaption} />
                            </div>
                        }
                    </div>
                }
            </div>
        );
    }
}