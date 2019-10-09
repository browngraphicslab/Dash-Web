import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { action, computed, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import * as rp from "request-promise";
import { Doc, DocListCast, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { Id } from '../../../new_fields/FieldSymbols';
import { createSchema, listSpec, makeInterface } from "../../../new_fields/Schema";
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, Cast, NumCast, PromiseValue, StrCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { emptyFunction, returnTrue, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from "../../documents/Documents";
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
import { DocumentType } from '../../documents/DocumentTypes';
import { GooglePhotos } from '../../apis/google_docs/GooglePhotosClientUtils';
import { ImageField } from '../../../new_fields/URLField';
import SharingManager from '../../util/SharingManager';
import { Scripting } from '../../util/Scripting';

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

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    ContainingCollectionDoc: Opt<Doc>;
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
    focus: (doc: Doc, willZoom: boolean, scale?: number, afterFocus?: () => boolean) => void;
    parentActive: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    bringToFront: (doc: Doc, sendToBack?: boolean) => void;
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    zoomToScale: (scale: number) => void;
    backgroundColor: (doc: Doc) => string | undefined;
    getScale: () => number;
    animateBetweenIcon?: (maximize: boolean, target: number[]) => void;
    ChromeHeight?: () => number;
}

export const documentSchema = createSchema({
    // layout: "string", // this should be a "string" or Doc, but can't do that in schemas, so best to leave it out
    title: "string",            // document title (can be on either data document or layout)
    nativeWidth: "number",      // native width of document which determines how much document contents are scaled when the document's width is set
    nativeHeight: "number",     // "
    width: "number",            // width of document in its container's coordinate system
    height: "number",           // "
    backgroundColor: "string",  // background color of document
    opacity: "number",          // opacity of document
    onClick: ScriptField,       // script to run when document is clicked (can be overriden by an onClick prop)
    ignoreAspect: "boolean",    // whether aspect ratio should be ignored when laying out or manipulating the document
    autoHeight: "boolean",      // whether the height of the document should be computed automatically based on its contents
    isTemplate: "boolean",      // whether this document acts as a template layout for describing how other documents should be displayed
    isBackground: "boolean",    // whether document is a background element and ignores input events (can only selet with marquee)
    type: "string",             // enumerated type of document
    maximizeLocation: "string", // flag for where to place content when following a click interaction (e.g., onRight, inPlace, inTab) 
    lockedPosition: "boolean",  // whether the document can be spatially manipulated
    inOverlay: "boolean",       // whether the document is rendered in an OverlayView which handles selection/dragging differently
    borderRounding: "string",   // border radius rounding of document
    searchFields: "string",     // the search fields to display when this document matches a search in its metadata
    heading: "number",          // the logical layout 'heading' of this document (used by rule provider to stylize h1 header elements, from h2, etc)
    showCaption: "string",      // whether editable caption text is overlayed at the bottom of the document 
    showTitle: "string",        // whether an editable title banner is displayed at tht top of the document
    isButton: "boolean",        // whether document functions as a button (overiding native interactions of its content)      
    ignoreClick: "boolean",     // whether documents ignores input clicks (but does not ignore manipulation and other events) 
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
    @computed get active() { return SelectionManager.IsSelected(this) || this.props.parentActive(); }
    @computed get topMost() { return this.props.renderDepth === 0; }
    @computed get nativeWidth() { return this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.Document.nativeHeight || 0; }
    @computed get onClickHandler() { return this.props.onClick ? this.props.onClick : this.Document.onClick; }

    @action
    componentDidMount() {
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, { handlers: { drop: this.drop.bind(this) } }));
        DocumentManager.Instance.DocumentViews.push(this);
    }

    @action
    componentDidUpdate() {
        this._dropDisposer && this._dropDisposer();
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, { handlers: { drop: this.drop.bind(this) } }));
    }

    @action
    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
        DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);
    }

    startDragging(x: number, y: number, dropAction: dropActionType, applyAsTemplate?: boolean) {
        if (this._mainCont.current) {
            let dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            dragData.offset = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).transformDirection(x - left, y - top);
            dragData.dropAction = dropAction;
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

    onClick = async (e: React.MouseEvent) => {
        if (!e.nativeEvent.cancelBubble && !this.Document.ignoreClick && CurrentUserUtils.MainDocId !== this.props.Document[Id] &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD && Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            e.stopPropagation();
            let preventDefault = true;
            if (this._doubleTap && this.props.renderDepth) {
                let fullScreenAlias = Doc.MakeAlias(this.props.Document);
                let layoutNative = await PromiseValue(Cast(this.props.Document.layoutNative, Doc));
                if (layoutNative && fullScreenAlias.layout === layoutNative.layout) {
                    await swapViews(fullScreenAlias, "layoutCustom", "layoutNative");
                }
                this.props.addDocTab(fullScreenAlias, undefined, "inTab");
                SelectionManager.DeselectAll();
                Doc.UnBrushDoc(this.props.Document);
            } else if (this.onClickHandler && this.onClickHandler.script) {
                this.onClickHandler.script.run({ this: this.Document.isTemplate && this.props.DataDoc ? this.props.DataDoc : this.props.Document }, console.log);
            } else if (this.Document.isButton) {
                SelectionManager.SelectDoc(this, e.ctrlKey); // don't think this should happen if a button action is actually triggered.
                this.buttonClick(e.altKey, e.ctrlKey);
            } else {
                SelectionManager.SelectDoc(this, e.ctrlKey);
                preventDefault = false;
            }
            preventDefault && e.preventDefault();
        }
    }

    buttonClick = async (altKey: boolean, ctrlKey: boolean) => {
        let maximizedDocs = await DocListCastAsync(this.props.Document.maximizedDocs);
        let summarizedDocs = await DocListCastAsync(this.props.Document.summarizedDocs);
        let linkDocs = LinkManager.Instance.getAllRelatedLinks(this.props.Document);
        let expandedDocs: Doc[] = [];
        expandedDocs = maximizedDocs ? [...maximizedDocs, ...expandedDocs] : expandedDocs;
        expandedDocs = summarizedDocs ? [...summarizedDocs, ...expandedDocs] : expandedDocs;
        // let expandedDocs = [ ...(maximizedDocs ? maximizedDocs : []), ...(summarizedDocs ? summarizedDocs : []),];
        if (expandedDocs.length) {
            SelectionManager.DeselectAll();
            let maxLocation = StrCast(this.Document.maximizeLocation, "inPlace");
            maxLocation = this.Document.maximizeLocation = (!ctrlKey ? !altKey ? maxLocation : (maxLocation !== "inPlace" ? "inPlace" : "onRight") : (maxLocation !== "inPlace" ? "inPlace" : "inTab"));
            if (maxLocation === "inPlace") {
                expandedDocs.forEach(maxDoc => this.props.addDocument && this.props.addDocument(maxDoc, false));
                let scrpt = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(NumCast(this.Document.width) / 2, NumCast(this.Document.height) / 2);
                DocumentManager.Instance.animateBetweenPoint(scrpt, expandedDocs);
            } else {
                expandedDocs.forEach(maxDoc => (!this.props.addDocTab(maxDoc, undefined, "close") && this.props.addDocTab(maxDoc, undefined, maxLocation)));
            }
        }
        else if (linkDocs.length) {
            DocumentManager.Instance.FollowLink(undefined, this.props.Document,
                // open up target if it's not already in view ... by zooming into the button document first and setting flag to reset zoom afterwards
                (doc: Doc, maxLocation: string) => this.props.focus(this.props.Document, true, 1, () => this.props.addDocTab(doc, undefined, maxLocation)),
                ctrlKey, altKey, this.props.ContainingCollectionDoc);
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.nativeEvent.cancelBubble && e.button === 0) return;
        this._downX = e.clientX;
        this._downY = e.clientY;
        this._hitTemplateDrag = false;
        // this whole section needs to move somewhere else.  We're trying to initiate a special "template" drag where
        // this document is the template and we apply it to whatever we drop it on.
        for (let element = (e.target as any); element && !this._hitTemplateDrag; element = element.parentElement) {
            if (element.className && element.className.toString() === "collectionViewBaseChrome-collapse") {
                this._hitTemplateDrag = true;
            }
        }
        if (this.active && e.button === 0 && !this.Document.lockedPosition && !this.Document.inOverlay) e.stopPropagation(); // events stop at the lowest document that is active.  if right dragging, we let it go through though to allow for context menu clicks. PointerMove callbacks should remove themselves if the move event gets stopPropagated by a lower-level handler (e.g, marquee drag);
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
        if ((e.nativeEvent as any).formattedHandled) { e.stopPropagation(); }
    }
    onPointerMove = (e: PointerEvent): void => {
        if ((e as any).formattedHandled) { e.stopPropagation(); return; }
        if (e.cancelBubble && this.active) {
            document.removeEventListener("pointermove", this.onPointerMove); // stop listening to pointerMove if something else has stopPropagated it (e.g., the MarqueeView)
        }
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this) || this.props.parentActive()) && !this.Document.lockedPosition && !this.Document.inOverlay) {
            if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
                if (!e.altKey && !this.topMost && e.buttons === 1) {
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
    static makeNativeViewClicked = async (doc: Doc): Promise<void> => swapViews(doc, "layoutNative", "layoutCustom")

    static makeCustomViewClicked = async (doc: Doc, dataDoc: Opt<Doc>) => {
        const batch = UndoManager.StartBatch("CustomViewClicked");
        if (doc.layoutCustom === undefined) {
            Doc.GetProto(dataDoc || doc).layoutNative = Doc.MakeTitled("layoutNative");
            await swapViews(doc, "", "layoutNative");

            const width = NumCast(doc.width);
            const height = NumCast(doc.height);
            const options = { title: "data", width, x: -width / 2, y: - height / 2, };

            let fieldTemplate: Doc;
            switch (doc.type) {
                case DocumentType.TEXT:
                    fieldTemplate = Docs.Create.TextDocument(options);
                    break;
                case DocumentType.PDF:
                    fieldTemplate = Docs.Create.PdfDocument("http://www.msn.com", options);
                    break;
                case DocumentType.VID:
                    fieldTemplate = Docs.Create.VideoDocument("http://www.cs.brown.edu", options);
                    break;
                default:
                    fieldTemplate = Docs.Create.ImageDocument("http://www.cs.brown.edu", options);
            }

            fieldTemplate.backgroundColor = doc.backgroundColor;
            fieldTemplate.heading = 1;
            fieldTemplate.autoHeight = true;

            let docTemplate = Docs.Create.FreeformDocument([fieldTemplate], { title: doc.title + "_layout", width: width + 20, height: Math.max(100, height + 45) });

            Doc.MakeMetadataFieldTemplate(fieldTemplate, Doc.GetProto(docTemplate), true);
            Doc.ApplyTemplateTo(docTemplate, doc, undefined);
            Doc.GetProto(dataDoc || doc).layoutCustom = Doc.MakeTitled("layoutCustom");
        } else {
            await swapViews(doc, "layoutCustom", "layoutNative");
        }
        batch.end();
    }

    @undoBatch
    makeBtnClicked = (): void => {
        if (this.Document.isButton || this.Document.onClick || this.Document.ignoreClick) {
            this.Document.isButton = false;
            this.Document.ignoreClick = false;
            this.Document.onClick = undefined;
        } else {
            this.Document.isButton = true;
        }
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.AnnotationDragData) {
            /// this whole section for handling PDF annotations looks weird.  Need to rethink this to make it cleaner
            e.stopPropagation();
            (de.data as any).linkedToDoc = true;

            DocUtils.MakeLink({ doc: de.data.annotationDocument }, { doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, `Link from ${StrCast(de.data.annotationDocument.title)}`);
        }
        if (de.data instanceof DragManager.DocumentDragData && de.data.applyAsTemplate) {
            Doc.ApplyTemplateTo(de.data.draggedDocuments[0], this.props.Document);
            e.stopPropagation();
        }
        if (de.data instanceof DragManager.LinkDragData) {
            e.stopPropagation();
            // const docs = await SearchUtil.Search(`data_l:"${destDoc[Id]}"`, true);
            // const views = docs.map(d => DocumentManager.Instance.getDocumentView(d)).filter(d => d).map(d => d as DocumentView);
            de.data.linkSourceDocument !== this.props.Document &&
                (de.data.linkDocument = DocUtils.MakeLink({ doc: de.data.linkSourceDocument }, { doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, "in-text link being created")); // TODODO this is where in text links get passed
        }
    }

    @action
    onDrop = (e: React.DragEvent) => {
        let text = e.dataTransfer.getData("text/plain");
        if (!e.isDefaultPrevented() && text && text.startsWith("<div")) {
            let oldLayout = StrCast(this.props.Document.layout);
            let layout = text.replace("{layout}", oldLayout);
            this.props.Document.layout = layout;
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
    makeIntoPortal = async () => {
        let anchors = await Promise.all(DocListCast(this.props.Document.links).map(async (d: Doc) => Cast(d.anchor2, Doc)));
        if (!anchors.find(anchor2 => anchor2 && anchor2.title === this.Document.title + ".portal" ? true : false)) {
            let portalID = (this.Document.title + ".portal").replace(/^-/, "").replace(/\([0-9]*\)$/, "");
            DocServer.GetRefField(portalID).then(existingPortal => {
                let portal = existingPortal instanceof Doc ? existingPortal : Docs.Create.FreeformDocument([], { width: (this.Document.width || 0) + 10, height: this.Document.height || 0, title: portalID });
                DocUtils.MakeLink({ doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, { doc: portal }, portalID, "portal link");
                this.Document.isButton = true;
            });
        }
    }

    @undoBatch
    @action
    setCustomView = (custom: boolean): void => {
        if (this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.DataDoc) {
            Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.ContainingCollectionView.props.DataDoc);
        } else { // bcz: not robust -- for now documents with string layout are native documents, and those with Doc layouts are customized
            custom ? DocumentView.makeCustomViewClicked(this.props.Document, this.props.DataDoc) : DocumentView.makeNativeViewClicked(this.props.Document);
        }
    }

    @undoBatch
    @action
    makeBackground = (): void => {
        this.Document.isBackground = !this.Document.isBackground;
        this.Document.isBackground && this.props.bringToFront(this.Document, true);
    }

    @undoBatch
    @action
    toggleLockPosition = (): void => {
        this.Document.lockedPosition = this.Document.lockedPosition ? undefined : true;
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
        subitems.push({ description: "Open Tab        ", event: () => this.props.addDocTab(this.props.Document, this.props.DataDoc, "inTab"), icon: "folder" });
        subitems.push({ description: "Open Right      ", event: () => this.props.addDocTab(this.props.Document, this.props.DataDoc, "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Alias Tab  ", event: () => this.props.addDocTab(Doc.MakeAlias(this.props.Document), this.props.DataDoc, "inTab"), icon: "folder" });
        subitems.push({ description: "Open Alias Right", event: () => this.props.addDocTab(Doc.MakeAlias(this.props.Document), this.props.DataDoc, "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Fields     ", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { width: 300, height: 300 }), undefined, "onRight"), icon: "layer-group" });
        cm.addItem({ description: "Open...", subitems: subitems, icon: "external-link-alt" });

        if (Cast(this.props.Document.data, ImageField)) {
            cm.addItem({ description: "Export to Google Photos", event: () => GooglePhotos.Transactions.UploadImages([this.props.Document]), icon: "caret-square-right" });
        }
        if (Cast(Doc.GetProto(this.props.Document).data, listSpec(Doc))) {
            cm.addItem({ description: "Export to Google Photos Album", event: () => GooglePhotos.Export.CollectionToAlbum({ collection: this.props.Document }).then(console.log), icon: "caret-square-right" });
            cm.addItem({ description: "Tag Child Images via Google Photos", event: () => GooglePhotos.Query.TagChildImages(this.props.Document), icon: "caret-square-right" });
            cm.addItem({ description: "Write Back Link to Album", event: () => GooglePhotos.Transactions.AddTextEnrichment(this.props.Document), icon: "caret-square-right" });
        }

        let existingOnClick = ContextMenu.Instance.findByDescription("OnClick...");
        let onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
        onClicks.push({ description: "Enter Portal", event: this.makeIntoPortal, icon: "window-restore" });
        onClicks.push({ description: "Toggle Detail", event: () => this.Document.onClick = ScriptField.MakeScript("toggleDetail(this)"), icon: "window-restore" });
        onClicks.push({ description: this.Document.ignoreClick ? "Select" : "Do Nothing", event: () => this.Document.ignoreClick = !this.Document.ignoreClick, icon: this.Document.ignoreClick ? "unlock" : "lock" });
        onClicks.push({ description: this.Document.isButton || this.Document.onClick ? "Remove Click Behavior" : "Follow Link", event: this.makeBtnClicked, icon: "concierge-bell" });
        onClicks.push({ description: "Edit onClick Script", icon: "edit", event: (obj: any) => ScriptBox.EditButtonScript("On Button Clicked ...", this.props.Document, "onClick", obj.x, obj.y) });
        onClicks.push({
            description: "Edit onClick Foreach Doc Script", icon: "edit", event: (obj: any) => {
                this.props.Document.collectionContext = this.props.ContainingCollectionDoc;
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
        layoutItems.push({ description: `${this.Document.chromeStatus !== "disabled" ? "Hide" : "Show"} Chrome`, event: () => this.Document.chromeStatus = (this.Document.chromeStatus !== "disabled" ? "disabled" : "enabled"), icon: "project-diagram" });
        layoutItems.push({ description: `${this.Document.autoHeight ? "Variable Height" : "Auto Height"}`, event: () => this.Document.autoHeight = !this.Document.autoHeight, icon: "plus" });
        layoutItems.push({ description: this.Document.ignoreAspect || !this.Document.nativeWidth || !this.Document.nativeHeight ? "Freeze" : "Unfreeze", event: this.freezeNativeDimensions, icon: "snowflake" });
        layoutItems.push({ description: this.Document.lockedPosition ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.Document.lockedPosition) ? "unlock" : "lock" });
        layoutItems.push({ description: "Center View", event: () => this.props.focus(this.props.Document, false), icon: "crosshairs" });
        layoutItems.push({ description: "Zoom to Document", event: () => this.props.focus(this.props.Document, true), icon: "search" });
        if (this.Document.type !== DocumentType.COL && this.Document.type !== DocumentType.TEMPLATE) {
            layoutItems.push({ description: "Use Custom Layout", event: () => DocumentView.makeCustomViewClicked(this.props.Document, this.props.DataDoc), icon: "concierge-bell" });
        } else if (this.props.Document.layoutNative) {
            layoutItems.push({ description: "Use Native Layout", event: () => DocumentView.makeNativeViewClicked(this.props.Document), icon: "concierge-bell" });
        }
        !existing && cm.addItem({ description: "Layout...", subitems: layoutItems, icon: "compass" });
        if (!ClientUtils.RELEASE) {
            // let copies: ContextMenuProps[] = [];
            cm.addItem({ description: "Copy ID", event: () => Utils.CopyText(this.props.Document[Id]), icon: "fingerprint" });
            // cm.addItem({ description: "Copy...", subitems: copies, icon: "copy" });
        }
        let existingAnalyze = ContextMenu.Instance.findByDescription("Analyzers...");
        let analyzers: ContextMenuProps[] = existingAnalyze && "subitems" in existingAnalyze ? existingAnalyze.subitems : [];
        analyzers.push({ description: "Transcribe Speech", event: this.listen, icon: "microphone" });
        !existingAnalyze && cm.addItem({ description: "Analyzers...", subitems: analyzers, icon: "hand-point-right" });
        cm.addItem({ description: "Pin to Presentation", event: () => this.props.pinToPres(this.props.Document), icon: "map-pin" }); //I think this should work... and it does! A miracle!
        cm.addItem({ description: "Add Repl", icon: "laptop-code", event: () => OverlayView.Instance.addWindow(<ScriptingRepl />, { x: 300, y: 100, width: 200, height: 200, title: "Scripting REPL" }) });
        cm.addItem({
            description: "Download document", icon: "download", event: async () =>
                console.log(JSON.parse(await rp.get(Utils.CorsProxy("http://localhost:8983/solr/dash/select"), {
                    qs: { q: 'world', fq: 'NOT baseProto_b:true AND NOT deleted:true', start: '0', rows: '100', hl: true, 'hl.fl': '*' }
                })))
            // const a = document.createElement("a");
            // const url = Utils.prepend(`/downloadId/${this.props.Document[Id]}`);
            // a.href = url;
            // a.download = `DocExport-${this.props.Document[Id]}.zip`;
            // a.click();
        });

        cm.addItem({ description: "Publish", event: () => DocUtils.Publish(this.props.Document, this.Document.title || "", this.props.addDocument, this.props.removeDocument), icon: "file" });
        cm.addItem({ description: "Delete", event: this.deleteClicked, icon: "trash" });
        runInAction(() => {
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
        });
        runInAction(() => {
            cm.addItem({
                description: "Share",
                event: () => SharingManager.Instance.open(this),
                icon: "external-link-alt"
            });

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


    // the document containing the view layout information - will be the Document itself unless the Document has
    // a layout field.  In that case, all layout information comes from there unless overriden by Document
    get layoutDoc(): Document {
        return Document(this.props.Document.layout instanceof Doc ? this.props.Document.layout : this.props.Document);
    }

    // does Document set a layout prop 
    setsLayoutProp = (prop: string) => this.props.Document[prop] !== this.props.Document["default" + prop[0].toUpperCase() + prop.slice(1)];
    // get the a layout prop by first choosing the prop from Document, then falling back to the layout doc otherwise.
    getLayoutPropStr = (prop: string) => StrCast(this.setsLayoutProp(prop) ? this.props.Document[prop] : this.layoutDoc[prop]);
    getLayoutPropNum = (prop: string) => NumCast(this.setsLayoutProp(prop) ? this.props.Document[prop] : this.layoutDoc[prop]);

    isSelected = () => SelectionManager.IsSelected(this);
    select = (ctrlPressed: boolean) => { SelectionManager.SelectDoc(this, ctrlPressed); };

    chromeHeight = () => {
        let showOverlays = this.props.showOverlays ? this.props.showOverlays(this.Document) : undefined;
        let showTitle = showOverlays && "title" in showOverlays ? showOverlays.title : StrCast(this.Document.showTitle);
        return (showTitle ? 25 : 0) + 1;
    }

    childScaling = () => (this.props.Document.fitWidth ? this.props.PanelWidth() / this.nativeWidth : this.props.ContentScaling());
    @computed get contents() {
        return (<DocumentContentsView ContainingCollectionView={this.props.ContainingCollectionView}
            ContainingCollectionDoc={this.props.ContainingCollectionDoc}
            Document={this.props.Document}
            fitToBox={this.props.fitToBox}
            addDocument={this.props.addDocument}
            removeDocument={this.props.removeDocument}
            moveDocument={this.props.moveDocument}
            ScreenToLocalTransform={this.props.ScreenToLocalTransform}
            renderDepth={this.props.renderDepth}
            showOverlays={this.props.showOverlays}
            ContentScaling={this.childScaling}
            ruleProvider={this.props.ruleProvider}
            PanelWidth={this.props.PanelWidth}
            PanelHeight={this.props.PanelHeight}
            focus={this.props.focus}
            parentActive={this.props.parentActive}
            whenActiveChanged={this.props.whenActiveChanged}
            bringToFront={this.props.bringToFront}
            addDocTab={this.props.addDocTab}
            pinToPres={this.props.pinToPres}
            zoomToScale={this.props.zoomToScale}
            backgroundColor={this.props.backgroundColor}
            animateBetweenIcon={this.props.animateBetweenIcon}
            getScale={this.props.getScale}
            ChromeHeight={this.chromeHeight}
            isSelected={this.isSelected}
            select={this.select}
            onClick={this.onClickHandler}
            layoutKey="layout"
            DataDoc={this.props.DataDoc} />);
    }
    render() {
        let animDims = this.props.Document.animateToDimensions ? Array.from(Cast(this.props.Document.animateToDimensions, listSpec("number"))!) : undefined;
        const ruleColor = this.props.ruleProvider ? StrCast(this.props.ruleProvider["ruleColor_" + this.Document.heading]) : undefined;
        const ruleRounding = this.props.ruleProvider ? StrCast(this.props.ruleProvider["ruleRounding_" + this.Document.heading]) : undefined;
        const colorSet = this.setsLayoutProp("backgroundColor");
        const clusterCol = this.props.ContainingCollectionDoc && this.props.ContainingCollectionDoc.clusterOverridesDefaultBackground;
        const backgroundColor = this.Document.isBackground || (clusterCol && !colorSet) ?
            this.props.backgroundColor(this.Document) || StrCast(this.layoutDoc.backgroundColor) :
            ruleColor && !colorSet ? ruleColor : StrCast(this.layoutDoc.backgroundColor) || this.props.backgroundColor(this.Document);

        const nativeWidth = this.props.Document.fitWidth ? this.props.PanelWidth() : this.nativeWidth > 0 && !this.Document.ignoreAspect ? `${this.nativeWidth}px` : "100%";
        const nativeHeight = this.props.Document.fitWidth ? this.props.PanelHeight() : this.Document.ignoreAspect ? this.props.PanelHeight() / this.props.ContentScaling() : this.nativeHeight > 0 ? `${this.nativeHeight}px` : "100%";
        const showOverlays = this.props.showOverlays ? this.props.showOverlays(this.Document) : undefined;
        const showTitle = showOverlays && "title" in showOverlays ? showOverlays.title : this.getLayoutPropStr("showTitle");
        const showCaption = showOverlays && "caption" in showOverlays ? showOverlays.caption : this.getLayoutPropStr("showCaption");
        const showTextTitle = showTitle && StrCast(this.Document.layout).indexOf("FormattedTextBox") !== -1 ? showTitle : undefined;
        const fullDegree = Doc.isBrushedHighlightedDegree(this.props.Document);
        const borderRounding = this.getLayoutPropStr("borderRounding") || ruleRounding;
        const localScale = this.props.ScreenToLocalTransform().Scale * fullDegree;
        const searchHighlight = (!this.Document.searchFields ? (null) :
            <div className="documentView-searchHighlight" style={{ width: `${100 * this.props.ContentScaling()}%`, transform: `scale(${1 / this.props.ContentScaling()})` }}>
                {this.Document.searchFields}
            </div>);
        const captionView = (!showCaption ? (null) :
            <div className="documentView-captionWrapper" style={{ width: `${100 * this.props.ContentScaling()}%`, transform: `scale(${1 / this.props.ContentScaling()})` }}>
                <FormattedTextBox {...this.props}
                    onClick={this.onClickHandler} DataDoc={this.props.DataDoc} active={returnTrue}
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
                    contents={this.Document[showTitle]}
                    display={"block"} height={72} fontSize={12}
                    GetValue={() => StrCast(this.Document[showTitle])}
                    SetValue={(value: string) => (Doc.GetProto(this.Document)[showTitle] = value) ? true : true}
                />
            </div>);
        let animheight = animDims ? animDims[1] : nativeHeight;
        let animwidth = animDims ? animDims[0] : nativeWidth;

        const highlightColors = ["transparent", "maroon", "maroon", "yellow", "magenta", "cyan", "orange"];
        const highlightStyles = ["solid", "dashed", "solid", "solid", "solid", "solid", "solid", "solid"];
        return (
            <div className={`documentView-node${this.topMost ? "-topmost" : ""}`}
                ref={this._mainCont}
                style={{
                    transition: this.props.Document.isAnimating !== undefined ? ".5s linear" : StrCast(this.Document.transition),
                    pointerEvents: this.Document.isBackground && !this.isSelected() ? "none" : "all",
                    color: StrCast(this.Document.color),
                    outline: fullDegree && !borderRounding ? `${highlightColors[fullDegree]} ${highlightStyles[fullDegree]} ${localScale}px` : "solid 0px",
                    border: fullDegree && borderRounding ? `${highlightStyles[fullDegree]} ${highlightColors[fullDegree]} ${localScale}px` : undefined,
                    background: backgroundColor,
                    width: animwidth,
                    height: animheight,
                    transform: `scale(${this.props.Document.fitWidth ? 1 : this.props.ContentScaling()})`,
                    opacity: this.Document.opacity
                }}
                onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}
                onPointerEnter={() => Doc.BrushDoc(this.props.Document)} onPointerLeave={() => Doc.UnBrushDoc(this.props.Document)}
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

export async function swapViews(doc: Doc, newLayoutField: string, oldLayoutField: string, oldLayout?: Doc) {
    let oldLayoutExt = oldLayout || await Cast(doc[oldLayoutField], Doc);
    if (oldLayoutExt) {
        oldLayoutExt.autoHeight = doc.autoHeight;
        oldLayoutExt.width = doc.width;
        oldLayoutExt.height = doc.height;
        oldLayoutExt.nativeWidth = doc.nativeWidth;
        oldLayoutExt.nativeHeight = doc.nativeHeight;
        oldLayoutExt.ignoreAspect = doc.ignoreAspect;
        oldLayoutExt.backgroundLayout = doc.backgroundLayout;
        oldLayoutExt.type = doc.type;
        oldLayoutExt.layout = doc.layout;
    }

    let newLayoutExt = newLayoutField && await Cast(doc[newLayoutField], Doc);
    if (newLayoutExt) {
        doc.autoHeight = newLayoutExt.autoHeight;
        doc.width = newLayoutExt.width;
        doc.height = newLayoutExt.height;
        doc.nativeWidth = newLayoutExt.nativeWidth;
        doc.nativeHeight = newLayoutExt.nativeHeight;
        doc.ignoreAspect = newLayoutExt.ignoreAspect;
        doc.backgroundLayout = newLayoutExt.backgroundLayout;
        doc.type = newLayoutExt.type;
        doc.layout = await newLayoutExt.layout;
    }
}

Scripting.addGlobal(function toggleDetail(doc: any) {
    let native = typeof doc.layout === "string";
    swapViews(doc, native ? "layoutCustom" : "layoutNative", native ? "layoutNative" : "layoutCustom");
});