import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { action, computed, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as rp from "request-promise";
import { Doc, DocListCast, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { Copy, Id } from '../../../new_fields/FieldSymbols';
import { List } from "../../../new_fields/List";
import { ObjectField } from "../../../new_fields/ObjectField";
import { createSchema, listSpec, makeInterface } from "../../../new_fields/Schema";
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, Cast, FieldValue, NumCast, PromiseValue, StrCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { RouteStore } from '../../../server/RouteStore';
import { emptyFunction, returnTrue, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from "../../documents/Documents";
import { DocumentType } from '../../documents/DocumentTypes';
import { ClientUtils } from '../../util/ClientUtils';
import { DictationManager } from '../../util/DictationManager';
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager, dropActionType } from "../../util/DragManager";
import { LinkManager } from '../../util/LinkManager';
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { CollectionView } from "../collections/CollectionView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from "../DocComponent";
import { EditableView } from '../EditableView';
import { MainView } from '../MainView';
import { OverlayView } from '../OverlayView';
import { ScriptBox } from '../ScriptBox';
import { ScriptingRepl } from '../ScriptingRepl';
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import { FormattedTextBox } from './FormattedTextBox';
import React = require("react");
import { CompileScript, Scripting } from '../../util/Scripting';
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
    onClick?: ScriptField;
    addDocument?: (doc: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument?: (doc: Doc) => boolean;
    moveDocument?: (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    renderDepth: number;
    showOverlays?: (doc: Doc) => { title?: string, caption?: string };
    ContentScaling: () => number;
    ruleProvider: Doc | undefined;
    PanelWidth: () => number;
    PanelHeight: () => number;
    focus: (doc: Doc, willZoom: boolean, scale?: number) => void;
    parentActive: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    bringToFront: (doc: Doc, sendToBack?: boolean) => void;
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => void;
    pinToPres: (document: Doc) => void;
    collapseToPoint?: (scrpt: number[], expandedDocs: Doc[] | undefined) => void;
    zoomToScale: (scale: number) => void;
    backgroundColor: (doc: Doc) => string | undefined;
    getScale: () => number;
    animateBetweenIcon?: (maximize: boolean, target: number[]) => void;
    ChromeHeight?: () => number;
}

export const documentSchema = createSchema({
    layout: "string", // should also allow Doc but that can't be expressed in the schema
    title: "string",
    nativeWidth: "number",
    nativeHeight: "number",
    backgroundColor: "string",
    opacity: "number",
    hidden: "boolean",
    onClick: ScriptField,
    ignoreAspect: "boolean",
    autoHeight: "boolean",
    isTemplate: "boolean",
    isButton: "boolean",
    isBackground: "boolean",
    ignoreClick: "boolean",
    type: "string",
    maximizeLocation: "string",
    lockedPosition: "boolean",
    excludeFromLibrary: "boolean",
    width: "number",
    height: "number",
    borderRounding: "string",
    fitToBox: "boolean",
    searchFields: "string",
    heading: "number",
    showCaption: "string",
    showTitle: "string"
});

type Document = makeInterface<[typeof documentSchema]>;
const Document = makeInterface(documentSchema);

@observer
export class DocumentView extends DocComponent<DocumentViewProps, Document>(Document) {
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    private _doubleTap = false;
    private _hitTemplateDrag = false;
    private _mainCont = React.createRef<HTMLDivElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;

    public get ContentDiv() { return this._mainCont.current; }
    @computed get active(): boolean { return SelectionManager.IsSelected(this) || this.props.parentActive(); }
    @computed get topMost(): boolean { return this.props.renderDepth === 0; }

    @action
    componentDidMount() {
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
        DocumentManager.Instance.DocumentViews.push(this);
    }

    @action
    componentDidUpdate() {
        this._dropDisposer && this._dropDisposer();
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
    }
    @action
    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
        DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);
    }

    get dataDoc() {
        // bcz: don't think we need this, but left it in in case strange behavior pops up.  DocumentContentsView has this functionality
        // if (this.props.DataDoc === undefined && (this.props.Document.layout instanceof Doc || this.props.Document instanceof Promise)) {
        //     // if there is no dataDoc (ie, we're not rendering a temlplate layout), but this document
        //     // has a template layout document, then we will render the template layout but use 
        //     // this document as the data document for the layout.
        //     return this.props.Document;
        // }
        return this.props.DataDoc !== this.props.Document ? this.props.DataDoc : undefined;
    }
    startDragging(x: number, y: number, dropAction: dropActionType, applyAsTemplate?: boolean) {
        if (this._mainCont.current) {
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            let dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [xoff, yoff] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).transformDirection(x - left, y - top);
            dragData.dropAction = dropAction;
            dragData.xOffset = xoff;
            dragData.yOffset = yoff;
            dragData.moveDocument = this.props.moveDocument;
            dragData.applyAsTemplate = applyAsTemplate;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, {
                handlers: {
                    dragComplete: action(emptyFunction)
                },
                hideSource: !dropAction
            });
        }
    }

    @action
    public collapseTargetsToPoint = (scrpt: number[], expandedDocs: Doc[] | undefined): void => {
        SelectionManager.DeselectAll();
        expandedDocs && expandedDocs.map(expDoc => {
            if (expDoc.isMinimized || expDoc.isAnimating === "min") { // MAXIMIZE DOC
                if (expDoc.isMinimized) {  // docs are never actaully at the minimized location.  so when we unminimize one, we have to set our overrides to make it look like it was at the minimize location
                    expDoc.isMinimized = false;
                    expDoc.animateToPos = new List<number>([...scrpt, 0]);
                    expDoc.animateToDimensions = new List<number>([0, 0]);
                }
                setTimeout(() => {
                    expDoc.isAnimating = "max";
                    expDoc.animateToPos = new List<number>([0, 0, 1]);
                    expDoc.animateToDimensions = new List<number>([NumCast(expDoc.width), NumCast(expDoc.height)]);
                    setTimeout(() => expDoc.isAnimating === "max" && (expDoc.isAnimating = expDoc.animateToPos = expDoc.animateToDimensions = undefined), 600);
                }, 0);
            } else {  // MINIMIZE DOC
                expDoc.isAnimating = "min";
                expDoc.animateToPos = new List<number>([...scrpt, 0]);
                expDoc.animateToDimensions = new List<number>([0, 0]);
                setTimeout(() => {
                    if (expDoc.isAnimating === "min") {
                        expDoc.isMinimized = true;
                        expDoc.isAnimating = expDoc.animateToPos = expDoc.animateToDimensions = undefined;
                    }
                }, 600);
            }
        });
    }

    onClick = async (e: React.MouseEvent) => {
        if (e.nativeEvent.cancelBubble) return; // || SelectionManager.IsSelected(this)) -- bcz: needed because EditableView may stopPropagation which won't apparently stop this event from firing.
        if (this.onClickHandler && this.onClickHandler.script) {
            e.stopPropagation();
            this.onClickHandler.script.run({ this: this.Document.isTemplate && this.props.DataDoc ? this.props.DataDoc : this.props.Document });
            e.preventDefault();
            return;
        }
        let altKey = e.altKey;
        let ctrlKey = e.ctrlKey;
        if (this._doubleTap && this.props.renderDepth) {
            e.stopPropagation();
            let fullScreenAlias = Doc.MakeAlias(this.props.Document);
            Doc.UseDetailLayout(fullScreenAlias);
            fullScreenAlias.showCaption = "caption";
            this.props.addDocTab(fullScreenAlias, this.dataDoc, "inTab");
            SelectionManager.DeselectAll();
            Doc.UnBrushDoc(this.props.Document);
        }
        else if (!this.Document.ignoreClick && CurrentUserUtils.MainDocId !== this.props.Document[Id] &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
                Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            e.stopPropagation();
            SelectionManager.SelectDoc(this, e.ctrlKey);
            if (this.Document.isButton || this.Document.type === DocumentType.BUTTON) {
                let maximizedDocs = await DocListCastAsync(this.props.Document.maximizedDocs);
                let summarizedDocs = await DocListCastAsync(this.props.Document.summarizedDocs);
                let linkedDocs = LinkManager.Instance.getAllRelatedLinks(this.props.Document);
                let expandedDocs: Doc[] = [];
                expandedDocs = maximizedDocs ? [...maximizedDocs, ...expandedDocs] : expandedDocs;
                expandedDocs = summarizedDocs ? [...summarizedDocs, ...expandedDocs] : expandedDocs;
                // let expandedDocs = [ ...(maximizedDocs ? maximizedDocs : []), ...(summarizedDocs ? summarizedDocs : []),];
                if (expandedDocs.length) {
                    SelectionManager.DeselectAll();
                    let maxLocation = StrCast(this.Document.maximizeLocation, "inPlace");
                    let getDispDoc = (target: Doc) => Object.getOwnPropertyNames(target).indexOf("isPrototype") === -1 ? target : Doc.MakeDelegate(target);
                    if (altKey || ctrlKey) {
                        maxLocation = this.Document.maximizeLocation = (ctrlKey ? maxLocation : (maxLocation === "inPlace" || !maxLocation ? "inTab" : "inPlace"));
                        if (!maxLocation || maxLocation === "inPlace") {
                            let hadView = expandedDocs.length === 1 && DocumentManager.Instance.getDocumentView(expandedDocs[0], this.props.ContainingCollectionView);
                            let wasMinimized = !hadView && expandedDocs.reduce((min, d) => !min && !d.isMinimized, false);
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
                    SelectionManager.DeselectAll();
                    let first = linkedDocs.filter(d => Doc.AreProtosEqual(d.anchor1 as Doc, this.props.Document) && !d.anchor1anchored);
                    let firstUnshown = first.filter(d => DocumentManager.Instance.getDocumentViews(d.anchor2 as Doc).length === 0);
                    if (firstUnshown.length) first = [firstUnshown[0]];
                    let linkedFwdDocs = first.length ? [first[0].anchor2 as Doc, first[0].anchor1 as Doc] : [expandedDocs[0], expandedDocs[0]];

                    // @TODO: shouldn't always follow target context
                    let linkedFwdContextDocs = [first.length ? await (first[0].targetContext) as Doc : undefined, undefined];

                    let linkedFwdPage = [first.length ? NumCast(first[0].anchor2Page, undefined) : undefined, undefined];

                    if (!linkedFwdDocs.some(l => l instanceof Promise)) {
                        let maxLocation = StrCast(linkedFwdDocs[0].maximizeLocation, "inTab");
                        let targetContext = !Doc.AreProtosEqual(linkedFwdContextDocs[altKey ? 1 : 0], this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.Document) ? linkedFwdContextDocs[altKey ? 1 : 0] : undefined;
                        DocumentManager.Instance.jumpToDocument(linkedFwdDocs[altKey ? 1 : 0], ctrlKey, false,
                            document => {  // open up target if it's not already in view ...
                                let cv = this.props.ContainingCollectionView;  // bcz: ugh --- maybe need to have a props.unfocus() method so that we leave things in the state we found them??
                                let px = cv && cv.props.Document.panX;
                                let py = cv && cv.props.Document.panY;
                                let s = cv && cv.props.Document.scale;
                                this.props.focus(this.props.Document, true, 1);  // by zooming into the button document first
                                setTimeout(() => {
                                    this.props.addDocTab(document, undefined, maxLocation);
                                    cv && (cv.props.Document.panX = px);
                                    cv && (cv.props.Document.panY = py);
                                    cv && (cv.props.Document.scale = s);
                                }, 1000); // then after the 1sec animation, open up the target in a new tab
                            },
                            linkedFwdPage[altKey ? 1 : 0], targetContext);
                    }
                }
            }
        }
    }


    onPointerDown = (e: React.PointerEvent): void => {
        if (e.nativeEvent.cancelBubble) return;
        this._downX = e.clientX;
        this._downY = e.clientY;
        this._hitTemplateDrag = false;
        for (let element = (e.target as any); element && !this._hitTemplateDrag; element = element.parentElement) {
            if (element.className && element.className.toString() === "collectionViewBaseChrome-collapse") {
                this._hitTemplateDrag = true;
            }
        }
        if (this.active) e.stopPropagation(); // events stop at the lowest document that is active.  
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
    }
    onPointerMove = (e: PointerEvent): void => {
        if (e.cancelBubble && this.active) {
            document.removeEventListener("pointermove", this.onPointerMove);
        }
        else if (!e.cancelBubble && this.active) {
            if (!this.Document.excludeFromLibrary && (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3)) {
                if (!e.altKey && !this.topMost && e.buttons === 1 && !BoolCast(this.Document.lockedPosition)) {
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                    this.startDragging(this._downX, this._downY, e.ctrlKey || e.altKey ? "alias" : undefined, this._hitTemplateDrag);
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
    makeNativeViewClicked = (): void => {
        makeNativeView(this.props.Document);
    }
    @undoBatch
    makeCustomViewClicked = (): void => {
        this.props.Document.nativeLayout = this.Document.layout;
        this.props.Document.nativeType = this.Document.type;
        this.props.Document.nonCustomAutoHeight = this.Document.autoHeight;
        this.props.Document.nonCustomWidth = this.Document.width;
        this.props.Document.nonCustomHeight = this.Document.height;
        this.props.Document.nonCustomNativeWidth = this.Document.nativeWidth;
        this.props.Document.nonCustomNativeHeight = this.Document.nativeHeight;
        this.props.Document.nonCustomIgnoreAspect = this.Document.ignoreAspect;
        PromiseValue(Cast(this.props.Document.customLayout, Doc)).then(custom => {
            if (custom) {
                this.Document.type = DocumentType.TEMPLATE;
                this.props.Document.layout = custom;
                !custom.nativeWidth && (this.Document.nativeWidth = 0);
                !custom.nativeHeight && (this.Document.nativeHeight = 0);
                !custom.nativeWidth && (this.Document.ignoreAspect = true);
                this.Document.autoHeight = BoolCast(this.Document.customAutoHeight);
                this.Document.width = NumCast(this.props.Document.customWidth);
                this.Document.height = NumCast(this.props.Document.customHeight);
                this.Document.nativeWidth = NumCast(this.props.Document.customNativeWidth);
                this.Document.nativeHeight = NumCast(this.props.Document.customNativeHeight);
                this.Document.ignoreAspect = BoolCast(this.Document.customIgnoreAspect);
                this.props.Document.customAutoHeight = undefined;
                this.props.Document.customWidth = undefined;
                this.props.Document.customHeight = undefined;
                this.props.Document.customNativeWidth = undefined;
                this.props.Document.customNativeHeight = undefined;
                this.props.Document.customIgnoreAspect = undefined;
            } else {
                let options = { title: "data", width: (this.Document.width || 0), x: -(this.Document.width || 0) / 2, y: - (this.Document.height || 0) / 2, };
                let fieldTemplate = this.Document.type === DocumentType.TEXT ? Docs.Create.TextDocument(options) :
                    this.Document.type === DocumentType.VID ? Docs.Create.VideoDocument("http://www.cs.brown.edu", options) :
                        Docs.Create.ImageDocument("http://www.cs.brown.edu", options);

                fieldTemplate.backgroundColor = this.Document.backgroundColor;
                fieldTemplate.heading = 1;
                fieldTemplate.autoHeight = true;

                let docTemplate = Docs.Create.FreeformDocument([fieldTemplate], { title: this.Document.title + "layout", width: (this.Document.width || 0) + 20, height: Math.max(100, (this.Document.height || 0) + 45) });
                let proto = Doc.GetProto(docTemplate);
                Doc.MakeMetadataFieldTemplate(fieldTemplate, proto, true);

                Doc.ApplyTemplateTo(docTemplate, this.props.Document, undefined, false);
                Doc.GetProto(this.dataDoc || this.props.Document).customLayout = this.Document.layout;
            }
        });
    }

    @undoBatch
    makeBtnClicked = (): void => {
        let doc = Doc.GetProto(this.props.Document);
        if (doc.isButton || doc.onClick) {
            doc.isButton = false;
            doc.onClick = undefined;
        } else {
            doc.isButton = true;
        }
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
            annotations && annotations.forEach(anno => anno.target = targetDoc);

            DocUtils.MakeLink(annotationDoc, targetDoc, this.props.ContainingCollectionView!.props.Document, `Link from ${StrCast(annotationDoc.title)}`);
        }
        if (de.data instanceof DragManager.DocumentDragData && de.data.applyAsTemplate) {
            Doc.ApplyTemplateTo(de.data.draggedDocuments[0], this.props.Document, this.props.DataDoc);
            e.stopPropagation();
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

    @undoBatch
    @action
    freezeNativeDimensions = (): void => {
        let proto = this.Document.isTemplate ? this.props.Document : Doc.GetProto(this.props.Document);
        proto.autoHeight = this.Document.autoHeight = false;
        proto.ignoreAspect = !proto.ignoreAspect;
        if (!proto.ignoreAspect && !proto.nativeWidth) {
            proto.nativeWidth = this.props.PanelWidth();
            proto.nativeHeight = this.props.PanelHeight();
        }
    }
    @undoBatch
    @action
    makeIntoPortal = (): void => {
        if (!DocListCast(this.props.Document.links).find(doc => {
            if (Cast(doc.anchor2, Doc) instanceof Doc && (Cast(doc.anchor2, Doc) as Doc)!.title === this.Document.title + ".portal") return true;
            return false;
        })) {
            let portalID = (this.Document.title + ".portal").replace(/^-/, "").replace(/\([0-9]*\)$/, "");
            DocServer.GetRefField(portalID).then(existingPortal => {
                let portal = existingPortal instanceof Doc ? existingPortal : Docs.Create.FreeformDocument([], { width: (this.Document.width || 0) + 10, height: this.Document.height || 0, title: portalID });
                DocUtils.MakeLink(this.props.Document, portal, undefined, portalID);
                Doc.GetProto(this.props.Document).isButton = true;
            });
        }
    }
    @undoBatch
    @action
    toggleCustomView = (): void => {
        if (this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.DataDoc) {
            Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.ContainingCollectionView.props.DataDoc);
        } else {
            if (this.Document.type !== DocumentType.COL && this.Document.type !== DocumentType.TEMPLATE) {
                this.makeCustomViewClicked();
            } else if (this.Document.nativeLayout) {
                this.makeNativeViewClicked();
            }
        }
    }

    @undoBatch
    @action
    makeBackground = (): void => {
        this.layoutDoc.isBackground = !this.layoutDoc.isBackground;
        this.layoutDoc.isBackground && this.props.bringToFront(this.layoutDoc, true);
    }

    @undoBatch
    @action
    toggleLockPosition = (): void => {
        this.layoutDoc.lockedPosition = BoolCast(this.layoutDoc.lockedPosition) ? undefined : true;
    }

    listen = async () => {
        Doc.GetProto(this.props.Document).transcript = await DictationManager.Controls.listen({
            continuous: { indefinite: true },
            interimHandler: (results: string) => {
                let main = MainView.Instance;
                main.dictationSuccess = true;
                main.dictatedPhrase = results;
                main.isListening = { interim: true };
            }
        });
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
        subitems.push({ description: "Open Full Screen", event: () => CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(this), icon: "desktop" });
        subitems.push({ description: "Open Tab        ", event: () => this.props.addDocTab(this.props.Document, this.dataDoc, "inTab"), icon: "folder" });
        subitems.push({ description: "Open Right      ", event: () => this.props.addDocTab(this.props.Document, this.dataDoc, "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Alias Tab  ", event: () => this.props.addDocTab(Doc.MakeAlias(this.props.Document), this.dataDoc, "inTab"), icon: "folder" });
        subitems.push({ description: "Open Alias Right", event: () => this.props.addDocTab(Doc.MakeAlias(this.props.Document), this.dataDoc, "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Fields     ", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { width: 300, height: 300 }), undefined, "onRight"), icon: "layer-group" });
        cm.addItem({ description: "Open...", subitems: subitems, icon: "external-link-alt" });

        let existingOnClick = ContextMenu.Instance.findByDescription("OnClick...");
        let onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
        onClicks.push({ description: "Enter Portal", event: this.makeIntoPortal, icon: "window-restore" });
        onClicks.push({
            description: "Toggle Detail", event: () => {
                let compiled = CompileScript("toggleDetail(this)", {
                    params: { this: "Doc" },
                    typecheck: false,
                    editable: true,
                });
                if (compiled.compiled) {
                    this.Document.onClick = new ScriptField(compiled);
                }
            }, icon: "window-restore"
        });
        onClicks.push({ description: this.layoutDoc.ignoreClick ? "Select" : "Do Nothing", event: () => this.layoutDoc.ignoreClick = !this.layoutDoc.ignoreClick, icon: this.layoutDoc.ignoreClick ? "unlock" : "lock" });
        onClicks.push({ description: this.Document.isButton || this.Document.onClick ? "Remove Click Behavior" : "Follow Link", event: this.makeBtnClicked, icon: "concierge-bell" });
        onClicks.push({ description: "Edit onClick Script", icon: "edit", event: (obj: any) => ScriptBox.EditButtonScript("On Button Clicked ...", this.props.Document, "onClick", obj.x, obj.y) });
        onClicks.push({
            description: "Edit onClick Foreach Doc Script", icon: "edit", event: (obj: any) => {
                this.props.Document.collectionContext = this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.Document;
                ScriptBox.EditButtonScript("Foreach Collection Doc (d) => ", this.props.Document, "onClick", obj.x, obj.y, "docList(this.collectionContext.data).map(d => {", "});\n");
            }
        });
        !existingOnClick && cm.addItem({ description: "OnClick...", subitems: onClicks, icon: "hand-point-right" });

        let existing = ContextMenu.Instance.findByDescription("Layout...");
        let layoutItems: ContextMenuProps[] = existing && "subitems" in existing ? existing.subitems : [];
        layoutItems.push({ description: this.Document.isBackground ? "As Foreground" : "As Background", event: this.makeBackground, icon: this.Document.lockedPosition ? "unlock" : "lock" });
        if (this.props.DataDoc) {
            layoutItems.push({ description: "Make View of Metadata Field", event: () => Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.DataDoc!), icon: "concierge-bell" });
        }
        layoutItems.push({ description: `${this.layoutDoc.chromeStatus !== "disabled" ? "Hide" : "Show"} Chrome`, event: () => this.layoutDoc.chromeStatus = (this.layoutDoc.chromeStatus !== "disabled" ? "disabled" : "enabled"), icon: "project-diagram" });
        layoutItems.push({ description: `${this.layoutDoc.autoHeight ? "Variable Height" : "Auto Height"}`, event: () => this.layoutDoc.autoHeight = !this.layoutDoc.autoHeight, icon: "plus" });
        layoutItems.push({ description: this.Document.ignoreAspect || !this.Document.nativeWidth || !this.Document.nativeHeight ? "Freeze" : "Unfreeze", event: this.freezeNativeDimensions, icon: "snowflake" });
        layoutItems.push({ description: this.layoutDoc.lockedPosition ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.layoutDoc.lockedPosition) ? "unlock" : "lock" });
        layoutItems.push({ description: "Center View", event: () => this.props.focus(this.props.Document, false), icon: "crosshairs" });
        layoutItems.push({ description: "Zoom to Document", event: () => this.props.focus(this.props.Document, true), icon: "search" });
        if (this.props.Document.detailedLayout && !this.Document.isTemplate) {
            layoutItems.push({ description: "Toggle detail", event: () => Doc.ToggleDetailLayout(this.props.Document), icon: "image" });
        }
        if (this.Document.type !== DocumentType.COL && this.Document.type !== DocumentType.TEMPLATE) {
            layoutItems.push({ description: "Use Custom Layout", event: this.makeCustomViewClicked, icon: "concierge-bell" });
        } else if (this.props.Document.nativeLayout) {
            layoutItems.push({ description: "Use Native Layout", event: this.makeNativeViewClicked, icon: "concierge-bell" });
        }
        !existing && cm.addItem({ description: "Layout...", subitems: layoutItems, icon: "compass" });
        if (!ClientUtils.RELEASE) {
            let copies: ContextMenuProps[] = [];
            copies.push({ description: "Copy URL", event: () => Utils.CopyText(Utils.prepend("/doc/" + this.props.Document[Id])), icon: "link" });
            copies.push({ description: "Copy ID", event: () => Utils.CopyText(this.props.Document[Id]), icon: "fingerprint" });
            cm.addItem({ description: "Copy...", subitems: copies, icon: "copy" });
        }
        let existingAnalyze = ContextMenu.Instance.findByDescription("Analyzers...");
        let analyzers: ContextMenuProps[] = existingAnalyze && "subitems" in existingAnalyze ? existingAnalyze.subitems : [];
        analyzers.push({ description: "Transcribe Speech", event: this.listen, icon: "microphone" });
        !existingAnalyze && cm.addItem({ description: "Analyzers...", subitems: analyzers, icon: "hand-point-right" });
        cm.addItem({ description: "Pin to Presentation", event: () => this.props.pinToPres(this.props.Document), icon: "map-pin" }); //I think this should work... and it does! A miracle!
        cm.addItem({ description: "Add Repl", icon: "laptop-code", event: () => OverlayView.Instance.addWindow(<ScriptingRepl />, { x: 300, y: 100, width: 200, height: 200, title: "Scripting REPL" }) });
        cm.addItem({
            description: "Download document", icon: "download", event: async () => {
                let y = JSON.parse(await rp.get(Utils.CorsProxy("http://localhost:8983/solr/dash/select"), {
                    qs: { q: 'world', fq: 'NOT baseProto_b:true AND NOT deleted:true', start: '0', rows: '100', hl: true, 'hl.fl': '*' }
                }));
                console.log(y);
                // const a = document.createElement("a");
                // const url = Utils.prepend(`/downloadId/${this.props.Document[Id]}`);
                // a.href = url;
                // a.download = `DocExport-${this.props.Document[Id]}.zip`;
                // a.click();
            }
        });

        cm.addItem({ description: "Publish", event: () => DocUtils.Publish(this.props.Document, this.Document.title || "", this.props.addDocument, this.props.removeDocument), icon: "file" });
        cm.addItem({ description: "Delete", event: this.deleteClicked, icon: "trash" });
        type User = { email: string, userDocumentId: string };
        let usersMenu: ContextMenuProps[] = [];
        try {
            let stuff = await rp.get(Utils.prepend(RouteStore.getUsers));
            const users: User[] = JSON.parse(stuff);
            usersMenu = users.filter(({ email }) => email !== Doc.CurrentUserEmail).map(({ email, userDocumentId }) => ({
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
            if (!ClientUtils.RELEASE) {
                let setWriteMode = (mode: DocServer.WriteMode) => {
                    DocServer.AclsMode = mode;
                    const mode1 = mode;
                    const mode2 = mode === DocServer.WriteMode.Default ? mode : DocServer.WriteMode.Playground;
                    DocServer.setFieldWriteMode("x", mode1);
                    DocServer.setFieldWriteMode("y", mode1);
                    DocServer.setFieldWriteMode("width", mode1);
                    DocServer.setFieldWriteMode("height", mode1);

                    DocServer.setFieldWriteMode("panX", mode2);
                    DocServer.setFieldWriteMode("panY", mode2);
                    DocServer.setFieldWriteMode("scale", mode2);
                    DocServer.setFieldWriteMode("viewType", mode2);
                };
                let aclsMenu: ContextMenuProps[] = [];
                aclsMenu.push({ description: "Default (write/read all)", event: () => setWriteMode(DocServer.WriteMode.Default), icon: DocServer.AclsMode === DocServer.WriteMode.Default ? "check" : "exclamation" });
                aclsMenu.push({ description: "Playground (write own/no read)", event: () => setWriteMode(DocServer.WriteMode.Playground), icon: DocServer.AclsMode === DocServer.WriteMode.Playground ? "check" : "exclamation" });
                aclsMenu.push({ description: "Live Playground (write own/read others)", event: () => setWriteMode(DocServer.WriteMode.LivePlayground), icon: DocServer.AclsMode === DocServer.WriteMode.LivePlayground ? "check" : "exclamation" });
                aclsMenu.push({ description: "Live Readonly (no write/read others)", event: () => setWriteMode(DocServer.WriteMode.LiveReadonly), icon: DocServer.AclsMode === DocServer.WriteMode.LiveReadonly ? "check" : "exclamation" });
                cm.addItem({ description: "Collaboration ACLs...", subitems: aclsMenu, icon: "share" });
                cm.addItem({ description: "Undo Debug Test", event: () => UndoManager.TraceOpenBatches(), icon: "exclamation" });
            }

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

    onPointerEnter = (e: React.PointerEvent): void => { Doc.BrushDoc(this.props.Document); };
    onPointerLeave = (e: React.PointerEvent): void => { Doc.UnBrushDoc(this.props.Document); };

    isSelected = () => SelectionManager.IsSelected(this);
    @action select = (ctrlPressed: boolean) => { SelectionManager.SelectDoc(this, ctrlPressed); };
    @computed get nativeWidth() { return this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.Document.nativeHeight || 0; }
    @computed get onClickHandler() { return this.props.onClick ? this.props.onClick : this.Document.onClick; }
    @computed get contents() {
        return (<DocumentContentsView {...this.props}
            ChromeHeight={this.chromeHeight}
            isSelected={this.isSelected}
            select={this.select}
            onClick={this.onClickHandler}
            layoutKey={"layout"}
            fitToBox={this.Document.fitToBox ? true : this.props.fitToBox}
            DataDoc={this.dataDoc} />);
    }

    chromeHeight = () => {
        let showOverlays = this.props.showOverlays ? this.props.showOverlays(this.layoutDoc) : undefined;
        let showTitle = showOverlays && "title" in showOverlays ? showOverlays.title : StrCast(this.layoutDoc.showTitle);
        let templates = Cast(this.layoutDoc.templates, listSpec("string"));
        if (!showOverlays && templates instanceof List) {
            templates.map(str => {
                if (!showTitle && str.indexOf("{props.Document.title}") !== -1) showTitle = "title";
            });
        }
        return (showTitle ? 25 : 0) + 1;// bcz: why 8??
    }

    get layoutDoc(): Document {
        // if this document's layout field contains a document (ie, a rendering template), then we will use that
        // to determine the render JSX string, otherwise the layout field should directly contain a JSX layout string.
        return Document(this.props.Document.layout instanceof Doc ? this.props.Document.layout : this.props.Document);
    }

    render() {
        const ruleColor = this.props.ruleProvider ? StrCast(this.props.ruleProvider["ruleColor_" + this.Document.heading]) : undefined;
        const ruleRounding = this.props.ruleProvider ? StrCast(this.props.ruleProvider["ruleRounding_" + this.Document.heading]) : undefined;
        const colorSet = this.layoutDoc.backgroundColor !== this.layoutDoc.defaultBackgroundColor;
        const clusterCol = this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.Document.clusterOverridesDefaultBackground;
        const backgroundColor = this.layoutDoc.isBackground || (clusterCol && !colorSet) ?
            this.props.backgroundColor(this.layoutDoc) || StrCast(this.layoutDoc.backgroundColor) :
            ruleColor && !colorSet ? ruleColor : StrCast(this.layoutDoc.backgroundColor) || this.props.backgroundColor(this.layoutDoc);

        const nativeWidth = this.nativeWidth > 0 && !this.Document.ignoreAspect ? `${this.nativeWidth}px` : "100%";
        const nativeHeight = this.Document.ignoreAspect ? this.props.PanelHeight() / this.props.ContentScaling() : this.nativeHeight > 0 ? `${this.nativeHeight}px` : "100%";
        const showOverlays = this.props.showOverlays ? this.props.showOverlays(this.layoutDoc) : undefined;
        const showTitle = showOverlays && "title" in showOverlays ? showOverlays.title : this.layoutDoc.showTitle;
        const showCaption = showOverlays && "caption" in showOverlays ? showOverlays.caption : this.layoutDoc.showCaption;
        const showTextTitle = showTitle && StrCast(this.layoutDoc.layout).indexOf("FormattedTextBox") !== -1 ? showTitle : undefined;
        const fullDegree = Doc.isBrushedHighlightedDegree(this.props.Document);
        const borderRounding = this.Document.borderRounding || ruleRounding;
        const localScale = this.props.ScreenToLocalTransform().Scale * fullDegree;
        const searchHighlight = (!this.Document.searchFields ? (null) :
            <div className="documentView-searchHighlight" style={{ width: `${100 * this.props.ContentScaling()}%`, transform: `scale(${1 / this.props.ContentScaling()})` }}>
                {this.Document.searchFields}
            </div>);
        const captionView = (!showCaption ? (null) :
            <div className="documentView-captionWrapper" style={{ width: `${100 * this.props.ContentScaling()}%`, transform: `scale(${1 / this.props.ContentScaling()})` }}>
                <FormattedTextBox {...this.props}
                    onClick={this.onClickHandler} DataDoc={this.dataDoc} active={returnTrue}
                    isSelected={this.isSelected} focus={emptyFunction} select={this.select}
                    fieldExt={""} hideOnLeave={true} fieldKey={showCaption}
                />
            </div>);
        const titleView = (!showTitle ? (null) :
            <div className="documentView-titleWrapper" style={{
                position: showTextTitle ? "relative" : "absolute",
                pointerEvents: SelectionManager.GetIsDragging() ? "none" : "all",
                width: `${100 * this.props.ContentScaling()}%`,
                transform: `scale(${1 / this.props.ContentScaling()})`
            }}>
                <EditableView
                    contents={(this.layoutDoc.isTemplate || !this.dataDoc ? this.layoutDoc : this.dataDoc)[showTitle]}
                    display={"block"} height={72} fontSize={12}
                    GetValue={() => StrCast((this.layoutDoc.isTemplate || !this.dataDoc ? this.layoutDoc : this.dataDoc)[showTitle])}
                    SetValue={(value: string) => ((this.layoutDoc.isTemplate ? this.layoutDoc : Doc.GetProto(this.layoutDoc))[showTitle] = value) ? true : true}
                />
            </div>);
        return (
            <div className={`documentView-node${this.topMost ? "-topmost" : ""}`}
                ref={this._mainCont}
                style={{
                    transition: this.props.Document.isAnimating !== undefined ? ".5s linear" : StrCast(this.layoutDoc.transition),
                    pointerEvents: this.layoutDoc.isBackground && !this.isSelected() ? "none" : "all",
                    color: StrCast(this.layoutDoc.color),
                    outlineColor: ["transparent", "maroon", "maroon", "yellow"][fullDegree],
                    outlineStyle: ["none", "dashed", "solid", "solid"][fullDegree],
                    outlineWidth: fullDegree && !borderRounding ? `${localScale}px` : "0px",
                    border: fullDegree && borderRounding ? `${["none", "dashed", "solid", "solid"][fullDegree]} ${["transparent", "maroon", "maroon", "yellow"][fullDegree]} ${localScale}px` : undefined,
                    background: backgroundColor,
                    width: nativeWidth,
                    height: nativeHeight,
                    transform: `scale(${this.props.ContentScaling()})`,
                    opacity: this.Document.opacity
                }}
                onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}
                onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}
            >
                {!showTitle && !showCaption ?
                    this.Document.searchFields ?
                        (<div className="documentView-searchWrapper">
                            {this.contents}
                            {searchHighlight}
                        </div>)
                        :
                        this.contents
                    :
                    <div className="documentView-styleWrapper" >
                        <div className="documentView-styleContentWrapper" style={{ height: showTextTitle ? "calc(100% - 29px)" : "100%", top: showTextTitle ? "29px" : undefined }}>
                            {this.contents}
                        </div>
                        {titleView}
                        {captionView}
                        {searchHighlight}
                    </div>
                }
            </div>
        );
    }
}


let makeNativeView = (doc: any): void => {
    doc.layout = doc.nativeLayout;
    doc.nativeLayout = undefined;
    doc.type = doc.nativeType;

    doc.customAutoHeight = doc.autoHeight;
    doc.customWidth = doc.width;
    doc.customHeight = doc.height;
    doc.customNativeWidth = doc.nativeWidth;
    doc.customNativeHeight = doc.nativeHeight;
    doc.customIgnoreAspect = doc.ignoreAspect;

    doc.autoHeight = doc.nonCustomAutoHeight;
    doc.width = doc.nonCustomWidth;
    doc.height = doc.nonCustomHeight;
    doc.nativeWidth = doc.nonCustomNativeWidth;
    doc.nativeHeight = doc.nonCustomNativeHeight;
    doc.ignoreAspect = doc.nonCustomIgnoreAspect;
    doc.nonCustomAutoHeight = undefined;
    doc.nonCustomWidth = undefined;
    doc.nonCustomHeight = undefined;
    doc.nonCustomNativeWidth = undefined;
    doc.nonCustomNativeHeight = undefined;
    doc.nonCustomIgnoreAspect = undefined;
};
let makeCustomView = (doc: any): void => {
    doc.nativeLayout = doc.layout;
    doc.nativeType = doc.type;
    doc.nonCustomAutoHeight = doc.autoHeight;
    doc.nonCustomWidth = doc.nativeWidth;
    doc.nonCustomHeight = doc.nativeHeight;
    doc.nonCustomNativeWidth = doc.nativeWidth;
    doc.nonCustomNativeHeight = doc.nativeHeight;
    doc.nonCustomIgnoreAspect = doc.ignoreAspect;
    let custom = doc.customLayout as Doc;
    if (custom instanceof Doc) {
        doc.type = DocumentType.TEMPLATE;
        doc.layout = custom;
        !custom.nativeWidth && (doc.nativeWidth = 0);
        !custom.nativeHeight && (doc.nativeHeight = 0);
        !custom.nativeWidth && (doc.ignoreAspect = true);
        doc.autoHeight = doc.autoHeight;
        doc.width = doc.customWidth;
        doc.height = doc.customHeight;
        doc.nativeWidth = doc.customNativeWidth;
        doc.nativeHeight = doc.customNativeHeight;
        doc.ignoreAspect = doc.ignoreAspect;
        doc.customAutoHeight = undefined;
        doc.customWidth = undefined;
        doc.customHeight = undefined;
        doc.customNativeWidth = undefined;
        doc.customNativeHeight = undefined;
        doc.customIgnoreAspect = undefined;
    }
};
Scripting.addGlobal(function toggleDetail(doc: any) {
    if (doc.type !== DocumentType.COL && doc.type !== DocumentType.TEMPLATE) {
        makeCustomView(doc);
    } else if (doc.nativeLayout) {
        makeNativeView(doc);
    }
});