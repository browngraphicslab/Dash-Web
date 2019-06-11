import { library } from '@fortawesome/fontawesome-svg-core';
import { faAlignCenter, faCaretSquareRight, faCompressArrowsAlt, faExpandArrowsAlt, faLayerGroup, faSquare, faTrash, faConciergeBell, faFolder, faMapPin, faLink, faFingerprint, faCrosshairs, faDesktop } from '@fortawesome/free-solid-svg-icons';
import { action, computed, IReactionDisposer, reaction, trace, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, Opt, WidthSym, DocListCastAsync } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { ObjectField } from "../../../new_fields/ObjectField";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { BoolCast, Cast, FieldValue, StrCast, NumCast, PromiseValue } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { emptyFunction, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from "../../documents/Documents";
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
import { PresentationView } from "../PresentationView";
import { Template } from "./../Templates";
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import React = require("react");
import { Id, Copy } from '../../../new_fields/FieldSymbols';
import { ContextMenuProps } from '../ContextMenuItem';
const JsxParser = require('react-jsx-parser').default; //TODO Why does this need to be imported like this?

library.add(faTrash);
library.add(faExpandArrowsAlt);
library.add(faCompressArrowsAlt);
library.add(faLayerGroup);
library.add(faAlignCenter);
library.add(faCaretSquareRight);
library.add(faSquare);
library.add(faConciergeBell);
library.add(faFolder);
library.add(faMapPin);
library.add(faLink);
library.add(faFingerprint);
library.add(faCrosshairs);
library.add(faDesktop);

const linkSchema = createSchema({
    title: "string",
    linkDescription: "string",
    linkTags: "string",
    linkedTo: Doc,
    linkedFrom: Doc
});

type LinkDoc = makeInterface<[typeof linkSchema]>;
const LinkDoc = makeInterface(linkSchema);

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Doc;
    addDocument?: (doc: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument?: (doc: Doc) => boolean;
    moveDocument?: (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    isTopMost: boolean;
    ContentScaling: () => number;
    PanelWidth: () => number;
    PanelHeight: () => number;
    focus: (doc: Doc) => void;
    selectOnLoad: boolean;
    parentActive: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    bringToFront: (doc: Doc) => void;
    addDocTab: (doc: Doc, where: string) => void;
    collapseToPoint?: (scrpt: number[], expandedDocs: Doc[] | undefined) => void;
}

const schema = createSchema({
    layout: "string",
    nativeWidth: "number",
    nativeHeight: "number",
    backgroundColor: "string",
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
    @computed get topMost(): boolean { return this.props.isTopMost; }
    @computed get templates(): List<string> {
        let field = this.props.Document.templates;
        if (field && field instanceof List) {
            return field;
        }
        return new List<string>();
    }
    set templates(templates: List<string>) { this.props.Document.templates = templates; }
    screenRect = (): ClientRect | DOMRect => this._mainCont.current ? this._mainCont.current.getBoundingClientRect() : new DOMRect();

    constructor(props: DocumentViewProps) {
        super(props);
        this.selectOnLoad = props.selectOnLoad;
    }


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
        DocumentManager.Instance.DocumentViews.push(this);
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
        if (this._dropDisposer) this._dropDisposer();
        DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);
    }

    stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    }

    startDragging(x: number, y: number, dropAction: dropActionType, dragSubBullets: boolean) {
        if (this._mainCont.current) {
            let allConnected = [this.props.Document, ...(dragSubBullets ? DocListCast(this.props.Document.subBulletDocs) : [])];
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            let dragData = new DragManager.DocumentDragData(allConnected);
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
            this.props.collapseToPoint && this.props.collapseToPoint(scrpt, await DocListCastAsync(minimizedDoc.maximizedDocs));
        }
    }

    onClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        let altKey = e.altKey;
        let ctrlKey = e.ctrlKey;
        if (this._doubleTap && !this.props.isTopMost) {
            this.props.addDocTab(this.props.Document, "inTab");
            SelectionManager.DeselectAll();
            this.props.Document.libraryBrush = false;
        }
        else if (CurrentUserUtils.MainDocId !== this.props.Document[Id] &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
                Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            SelectionManager.SelectDoc(this, e.ctrlKey);
            let isExpander = (e.target as any).id === "isExpander";
            if (BoolCast(this.props.Document.isButton, false) || isExpander) {
                SelectionManager.DeselectAll();
                let subBulletDocs = await DocListCastAsync(this.props.Document.subBulletDocs);
                let maximizedDocs = await DocListCastAsync(this.props.Document.maximizedDocs);
                let summarizedDocs = await DocListCastAsync(this.props.Document.summarizedDocs);
                let linkedToDocs = await DocListCastAsync(this.props.Document.linkedToDocs, []);
                let linkedFromDocs = await DocListCastAsync(this.props.Document.linkedFromDocs, []);
                let expandedDocs: Doc[] = [];
                expandedDocs = subBulletDocs ? [...subBulletDocs, ...expandedDocs] : expandedDocs;
                expandedDocs = maximizedDocs ? [...maximizedDocs, ...expandedDocs] : expandedDocs;
                expandedDocs = summarizedDocs ? [...summarizedDocs, ...expandedDocs] : expandedDocs;
                // let expandedDocs = [...(subBulletDocs ? subBulletDocs : []), ...(maximizedDocs ? maximizedDocs : []), ...(summarizedDocs ? summarizedDocs : []),];
                if (expandedDocs.length) {   // bcz: need a better way to associate behaviors with click events on widget-documents
                    let expandedProtoDocs = expandedDocs.map(doc => Doc.GetProto(doc));
                    let maxLocation = StrCast(this.props.Document.maximizeLocation, "inPlace");
                    let getDispDoc = (target: Doc) => Object.getOwnPropertyNames(target).indexOf("isPrototype") === -1 ? target : Doc.MakeDelegate(target);
                    if (altKey) {
                        maxLocation = this.props.Document.maximizeLocation = (maxLocation === "inPlace" || !maxLocation ? "inTab" : "inPlace");
                        if (!maxLocation || maxLocation === "inPlace") {
                            let hadView = expandedDocs.length === 1 && DocumentManager.Instance.getDocumentView(expandedProtoDocs[0], this.props.ContainingCollectionView);
                            let wasMinimized = !hadView && expandedDocs.reduce((min, d) => !min && !BoolCast(d.IsMinimized, false), false);
                            expandedDocs.forEach(maxDoc => Doc.GetProto(maxDoc).isMinimized = false);
                            let hasView = expandedDocs.length === 1 && DocumentManager.Instance.getDocumentView(expandedProtoDocs[0], this.props.ContainingCollectionView);
                            if (!hasView) {
                                this.props.addDocument && expandedDocs.forEach(async maxDoc => this.props.addDocument!(getDispDoc(maxDoc), false));
                            }
                            expandedProtoDocs.forEach(maxDoc => maxDoc.isMinimized = wasMinimized);
                        }
                    }
                    if (maxLocation && maxLocation !== "inPlace" && CollectionDockingView.Instance) {
                        let dataDocs = DocListCast(CollectionDockingView.Instance.props.Document.data);
                        if (dataDocs) {
                            expandedDocs.forEach(maxDoc =>
                                (!CollectionDockingView.Instance.CloseRightSplit(Doc.GetProto(maxDoc)) &&
                                    this.props.addDocTab(getDispDoc(maxDoc), maxLocation)));
                        }
                    } else {
                        let scrpt = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(NumCast(this.Document.width) / 2, NumCast(this.Document.height) / 2);
                        this.props.collapseToPoint && this.props.collapseToPoint(scrpt, expandedProtoDocs);
                    }
                }
                else if (linkedToDocs.length || linkedFromDocs.length) {
                    let linkedFwdDocs = [
                        linkedToDocs.length ? linkedToDocs[0].linkedTo as Doc : linkedFromDocs.length ? linkedFromDocs[0].linkedFrom as Doc : expandedDocs[0],
                        linkedFromDocs.length ? linkedFromDocs[0].linkedFrom as Doc : linkedToDocs.length ? linkedToDocs[0].linkedTo as Doc : expandedDocs[0]];

                    let linkedFwdContextDocs = [
                        linkedToDocs.length ? await (linkedToDocs[0].linkedToContext) as Doc : linkedFromDocs.length ? await PromiseValue(linkedFromDocs[0].linkedFromContext) as Doc : undefined,
                        linkedFromDocs.length ? await (linkedFromDocs[0].linkedFromContext) as Doc : linkedToDocs.length ? await PromiseValue(linkedToDocs[0].linkedToContext) as Doc : undefined];

                    let linkedFwdPage = [
                        linkedToDocs.length ? NumCast(linkedToDocs[0].linkedToPage, undefined) : linkedFromDocs.length ? NumCast(linkedFromDocs[0].linkedFromPage, undefined) : undefined,
                        linkedFromDocs.length ? NumCast(linkedFromDocs[0].linkedFromPage, undefined) : linkedToDocs.length ? NumCast(linkedToDocs[0].linkedToPage, undefined) : undefined];

                    if (!linkedFwdDocs.some(l => l instanceof Promise)) {
                        let maxLocation = StrCast(linkedFwdDocs[altKey ? 1 : 0].maximizeLocation, "inTab");
                        DocumentManager.Instance.jumpToDocument(linkedFwdDocs[altKey ? 1 : 0], ctrlKey, document => this.props.addDocTab(document, maxLocation), linkedFwdPage[altKey ? 1 : 0], linkedFwdContextDocs[altKey ? 1 : 0]);
                    }
                }
            }
        }
    }
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        this._hitExpander = DocListCast(this.props.Document.subBulletDocs).length > 0;
        if (e.shiftKey && e.buttons === 1 && CollectionDockingView.Instance) {
            CollectionDockingView.Instance.StartOtherDrag([Doc.MakeAlias(this.props.Document)], e);
            e.stopPropagation();
        } else {
            if (this.active) e.stopPropagation(); // events stop at the lowest document that is active.  
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble && this.active) {
            if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
                document.removeEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
                if (!e.altKey && !this.topMost && e.buttons === 1) {
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

    deleteClicked = (): void => { this.props.removeDocument && this.props.removeDocument(this.props.Document); }
    fieldsClicked = (): void => { this.props.addDocTab(Docs.KVPDocument(this.props.Document, { width: 300, height: 300 }), "onRight") };
    makeBtnClicked = (): void => {
        let doc = Doc.GetProto(this.props.Document);
        doc.isButton = !BoolCast(doc.isButton, false);
        if (StrCast(doc.layout).indexOf("Formatted") !== -1) { // only need to freeze the dimensions of text boxes since they don't have a native width and height naturally
            if (doc.isButton && !doc.nativeWidth) {
                doc.nativeWidth = this.props.Document[WidthSym]();
                doc.nativeHeight = this.props.Document[HeightSym]();
            } else {
                doc.nativeWidth = doc.nativeHeight = undefined;
            }
        }
    }
    fullScreenClicked = (): void => {
        CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(Doc.MakeCopy(this.props.Document, false));
        SelectionManager.DeselectAll();
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
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
                DocUtils.MakeLink(sourceDoc, destDoc, this.props.ContainingCollectionView ? this.props.ContainingCollectionView.props.Document : undefined);
                de.data.droppedDocuments.push(destDoc);
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

    freezeNativeDimensions = (e: React.MouseEvent): void => {
        let proto = Doc.GetProto(this.props.Document);
        if (proto.ignoreAspect === undefined && !proto.nativeWidth) {
            proto.nativeWidth = this.props.PanelWidth();
            proto.nativeHeight = this.props.PanelHeight();
            proto.ignoreAspect = true;
        }
        proto.ignoreAspect = !BoolCast(proto.ignoreAspect, false);
    }

    @action
    onContextMenu = (e: React.MouseEvent): void => {
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
        subitems.push({ description: "Open Tab", event: () => this.props.addDocTab && this.props.addDocTab(this.props.Document, "inTab"), icon: "folder" });
        subitems.push({ description: "Open Tab Alias", event: () => this.props.addDocTab && this.props.addDocTab(Doc.MakeAlias(this.props.Document), "inTab"), icon: "folder" });
        subitems.push({ description: "Open Right", event: () => this.props.addDocTab && this.props.addDocTab(this.props.Document, "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Right Alias", event: () => this.props.addDocTab && this.props.addDocTab(Doc.MakeAlias(this.props.Document), "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Fields", event: this.fieldsClicked, icon: "layer-group" });
        cm.addItem({ description: "Open...", subitems: subitems });
        cm.addItem({ description: BoolCast(this.props.Document.ignoreAspect, false) || !this.props.Document.nativeWidth || !this.props.Document.nativeHeight ? "Freeze" : "Unfreeze", event: this.freezeNativeDimensions, icon: "edit" });
        cm.addItem({ description: "Pin to Pres", event: () => PresentationView.Instance.PinDoc(this.props.Document), icon: "map-pin" });
        cm.addItem({ description: this.props.Document.isButton ? "Remove Button" : "Make Button", event: this.makeBtnClicked, icon: "concierge-bell" });
        cm.addItem({
            description: "Find aliases", event: async () => {
                const aliases = await SearchUtil.GetAliasesOfDocument(this.props.Document);
                this.props.addDocTab && this.props.addDocTab(Docs.SchemaDocument(["title"], aliases, {}), "onRight");
            }, icon: "search"
        });
        cm.addItem({ description: "Center View", event: () => this.props.focus(this.props.Document), icon: "crosshairs" });
        cm.addItem({ description: "Copy URL", event: () => Utils.CopyText(DocServer.prepend("/doc/" + this.props.Document[Id])), icon: "link" });
        cm.addItem({ description: "Copy ID", event: () => Utils.CopyText(this.props.Document[Id]), icon: "fingerprint" });
        cm.addItem({ description: "Delete", event: this.deleteClicked, icon: "trash" });
        if (!this.topMost) {
            // DocumentViews should stop propagation of this event
            e.stopPropagation();
        }
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
        if (!SelectionManager.IsSelected(this)) {
            SelectionManager.SelectDoc(this, false);
        }
    }

    onPointerEnter = (e: React.PointerEvent): void => { this.props.Document.libraryBrush = true; };
    onPointerLeave = (e: React.PointerEvent): void => { this.props.Document.libraryBrush = false; };

    isSelected = () => SelectionManager.IsSelected(this);
    @action select = (ctrlPressed: boolean) => { this.selectOnLoad = false; SelectionManager.SelectDoc(this, ctrlPressed); }

    @observable selectOnLoad: boolean = false;
    @computed get nativeWidth() { return this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.Document.nativeHeight || 0; }
    @computed get contents() {
        return (
            <DocumentContentsView {...this.props} isSelected={this.isSelected} select={this.select} selectOnLoad={this.selectOnLoad} layoutKey={"layout"} />);
    }

    render() {
        var scaling = this.props.ContentScaling();
        var nativeHeight = this.nativeHeight > 0 ? `${this.nativeHeight}px` : "100%";
        var nativeWidth = this.nativeWidth > 0 ? `${this.nativeWidth}px` : "100%";
        return (
            <div className={`documentView-node${this.props.isTopMost ? "-topmost" : ""}`}
                ref={this._mainCont}
                style={{
                    outlineColor: "maroon",
                    outlineStyle: "dashed",
                    outlineWidth: BoolCast(this.props.Document.libraryBrush, false) ||
                        BoolCast(this.props.Document.protoBrush, false) ?
                        `${1 * this.props.ScreenToLocalTransform().Scale}px`
                        : "0px",
                    borderRadius: "inherit",
                    background: this.Document.backgroundColor || "",
                    width: nativeWidth,
                    height: nativeHeight,
                    transform: `scale(${scaling}, ${scaling})`
                }}
                onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}

                onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}
            >
                {this.contents}
            </div>
        );
    }
}