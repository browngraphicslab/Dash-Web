import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { DataSym, Doc, DocListCast, DocListCastOrNull, Field, HeightSym, Opt, WidthSym } from '../../../fields/Doc';
import { Id } from '../../../fields/FieldSymbols';
import { List } from '../../../fields/List';
import { RichTextField } from '../../../fields/RichTextField';
import { listSpec } from '../../../fields/Schema';
import { ComputedField, ScriptField } from '../../../fields/ScriptField';
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from '../../../fields/Types';
import { TraceMobx } from '../../../fields/util';
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnEmptyString, returnFalse, returnTrue, simulateMouseClick, Utils } from '../../../Utils';
import { Docs, DocUtils } from '../../documents/Documents';
import { DocumentType } from "../../documents/DocumentTypes";
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager, dropActionType } from "../../util/DragManager";
import { SelectionManager } from '../../util/SelectionManager';
import { SnappingManager } from '../../util/SnappingManager';
import { Transform } from '../../util/Transform';
import { undoBatch, UndoManager } from '../../util/UndoManager';
import { EditableView } from "../EditableView";
import { TREE_BULLET_WIDTH } from '../globalCssVariables.scss';
import { DocumentView, DocumentViewProps, StyleProviderFunc, DocumentViewInternal } from '../nodes/DocumentView';
import { FormattedTextBox } from '../nodes/formattedText/FormattedTextBox';
import { RichTextMenu } from '../nodes/formattedText/RichTextMenu';
import { KeyValueBox } from '../nodes/KeyValueBox';
import { SliderBox } from '../nodes/SliderBox';
import { StyleProp, testDocProps } from '../StyleProvider';
import { CollectionTreeView } from './CollectionTreeView';
import { CollectionView, CollectionViewType } from './CollectionView';
import "./TreeView.scss";
import React = require("react");

export interface TreeViewProps {
    treeView: CollectionTreeView;
    parentTreeView: TreeView | CollectionTreeView | undefined;
    observeHeight: (ref: any) => void;
    unobserveHeight: (ref: any) => void;
    prevSibling?: Doc;
    document: Doc;
    dataDoc?: Doc;
    containerCollection: Doc;
    renderDepth: number;
    dropAction: dropActionType;
    addDocTab: (doc: Doc, where: string) => boolean;
    panelWidth: () => number;
    panelHeight: () => number;
    addDocument: (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => boolean;
    removeDoc: ((doc: Doc | Doc[]) => boolean) | undefined;
    moveDocument: DragManager.MoveFunction;
    isContentActive: (outsideReaction?: boolean) => boolean;
    whenChildContentsActiveChanged: (isActive: boolean) => void;
    indentDocument?: (editTitle: boolean) => void;
    outdentDocument?: (editTitle: boolean) => void;
    ScreenToLocalTransform: () => Transform;
    dontRegisterView?: boolean;
    styleProvider?: StyleProviderFunc | undefined;
    treeViewHideHeaderFields: () => boolean;
    renderedIds: string[]; // list of document ids rendered used to avoid unending expansion of items in a cycle
    onCheckedClick?: () => ScriptField;
    onChildClick?: () => ScriptField;
    skipFields?: string[];
    firstLevel: boolean;
}

const treeBulletWidth = function () { return Number(TREE_BULLET_WIDTH.replace("px", "")); };

@observer
/**
 * Renders a treeView of a collection of documents
 * 
 * special fields:
 * treeViewOpen : flag denoting whether the documents sub-tree (contents) is visible or hidden
 * treeViewExpandedView : name of field whose contents are being displayed as the document's subtree
 */
export class TreeView extends React.Component<TreeViewProps> {
    static _editTitleOnLoad: Opt<{ id: string, parent: TreeView | CollectionTreeView | undefined }>;
    static _openTitleScript: Opt<ScriptField | undefined>;
    static _openLevelScript: Opt<ScriptField | undefined>;
    private _header: React.RefObject<HTMLDivElement> = React.createRef();
    private _tref = React.createRef<HTMLDivElement>();
    private _docRef: Opt<DocumentView>;
    private _selDisposer: Opt<IReactionDisposer>;
    private _editTitleScript: (() => ScriptField) | undefined;
    private _openScript: (() => ScriptField) | undefined;
    private _treedropDisposer?: DragManager.DragDropDisposer;

    get treeViewOpenIsTransient() { return this.props.treeView.doc.treeViewOpenIsTransient || Doc.IsPrototype(this.doc); }
    set treeViewOpen(c: boolean) {
        if (this.treeViewOpenIsTransient) this._transientOpenState = c;
        else {
            this.doc.treeViewOpen = c;
            this._transientOpenState = false;
        }
    }
    @observable _transientOpenState = false; // override of the treeViewOpen field allowing the display state to be independent of the document's state
    @observable _editTitle: boolean = false;
    @observable _dref: DocumentView | undefined | null;
    get displayName() { return "TreeView(" + this.props.document.title + ")"; }  // this makes mobx trace() statements more descriptive
    get defaultExpandedView() {
        return this.props.treeView.fileSysMode ? (this.doc.isFolder ? this.fieldKey : "aliases") :
            this.props.treeView.outlineMode || this.childDocs ? this.fieldKey : Doc.UserDoc().noviceMode ? "layout" : StrCast(this.props.treeView.doc.treeViewExpandedView, "fields");
    }

    @computed get doc() { return this.props.document; }
    @computed get treeViewOpen() { return (!this.treeViewOpenIsTransient && Doc.GetT(this.doc, "treeViewOpen", "boolean", true)) || this._transientOpenState; }
    @computed get treeViewExpandedView() { return StrCast(this.doc.treeViewExpandedView, this.defaultExpandedView); }
    @computed get MAX_EMBED_HEIGHT() { return NumCast(this.props.containerCollection.maxEmbedHeight, 200); }
    @computed get dataDoc() { return this.doc[DataSym]; }
    @computed get layoutDoc() { return Doc.Layout(this.doc); }
    @computed get fieldKey() { return Doc.LayoutFieldKey(this.doc); }
    @computed get childDocs() { return this.childDocList(this.fieldKey); }
    @computed get childLinks() { return this.childDocList("links"); }
    @computed get childAliases() { return this.childDocList("aliases"); }
    @computed get childAnnos() { return this.childDocList(this.fieldKey + "-annotations"); }
    @computed get selected() { return SelectionManager.Views().lastElement()?.props.Document === this.props.document; }

    childDocList(field: string) {
        const layout = Cast(Doc.LayoutField(this.doc), Doc, null);
        return (this.props.dataDoc ? DocListCastOrNull(this.props.dataDoc[field]) : undefined) || // if there's a data doc for an expanded template, use it's data field
            (layout ? DocListCastOrNull(layout[field]) : undefined) || // else if there's a layout doc, display it's fields
            DocListCastOrNull(this.doc[field]); // otherwise use the document's data field
    }
    @undoBatch move = (doc: Doc | Doc[], target: Doc | undefined, addDoc: (doc: Doc | Doc[]) => boolean) => {
        return this.doc !== target && this.props.removeDoc?.(doc) === true && addDoc(doc);
    }
    @undoBatch @action remove = (doc: Doc | Doc[], key: string) => {
        this.props.treeView.props.select(false);
        const ind = this.dataDoc[key].indexOf(doc);
        const res = (doc instanceof Doc ? [doc] : doc).reduce((flg, doc) => flg && Doc.RemoveDocFromList(this.dataDoc, key, doc), true);
        res && ind > 0 && DocumentManager.Instance.getDocumentView(this.dataDoc[key][ind - 1], this.props.treeView.props.CollectionView)?.select(false);
        return res;
    }

    @action setEditTitle = (docView?: DocumentView) => {
        this._selDisposer?.();
        if (!docView) {
            this._editTitle = false;
        }
        else if (docView.isSelected()) {
            this._editTitle = true;
            this._selDisposer = reaction(() => docView.isSelected(), sel => !sel && this.setEditTitle(undefined));
        } else {
            docView.select(false);
        }
    }
    @action
    openLevel = (docView: DocumentView) => {
        if (this.props.document.isFolder || Doc.IsSystem(this.props.document)) {
            this.treeViewOpen = !this.treeViewOpen;
        } else {
            this.props.addDocTab(this.props.document, "add:right");
        }
    }
    constructor(props: any) {
        super(props);
        if (!TreeView._openLevelScript) {
            TreeView._openTitleScript = ScriptField.MakeScript("scriptContext.setEditTitle(documentView)", { scriptContext: "any", documentView: "any" });
            TreeView._openLevelScript = ScriptField.MakeScript(`scriptContext.openLevel(documentView)`, { scriptContext: "any", documentView: "any" });
        }
        this._openScript = Doc.IsSystem(this.props.document) ? undefined : () => TreeView._openLevelScript!;
        this._editTitleScript = Doc.IsSystem(this.props.document) ? () => TreeView._openLevelScript! : () => TreeView._openTitleScript!;
    }

    _treeEle: any;
    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this._treedropDisposer?.();
        ele && (this._treedropDisposer = DragManager.MakeDropTarget(ele, this.treeDrop.bind(this), undefined, this.preTreeDrop.bind(this)), this.doc);
        if (this._treeEle) this.props.unobserveHeight(this._treeEle);
        this.props.observeHeight(this._treeEle = ele);
    }

    componentWillUnmount() {
        this._selDisposer?.();
        this._treeEle && this.props.unobserveHeight(this._treeEle);
        document.removeEventListener("pointermove", this.onDragMove, true);
        document.removeEventListener("pointermove", this.onDragUp, true);
    }

    onDragUp = (e: PointerEvent) => {
        document.removeEventListener("pointerup", this.onDragUp, true);
        document.removeEventListener("pointermove", this.onDragMove, true);
    }
    onPointerEnter = (e: React.PointerEvent): void => {
        this.props.isContentActive(true) && Doc.BrushDoc(this.dataDoc);
        if (e.buttons === 1 && SnappingManager.GetIsDragging()) {
            this._header.current!.className = "treeView-header";
            document.removeEventListener("pointermove", this.onDragMove, true);
            document.removeEventListener("pointerup", this.onDragUp, true);
            document.addEventListener("pointermove", this.onDragMove, true);
            document.addEventListener("pointerup", this.onDragUp, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        Doc.UnBrushDoc(this.dataDoc);
        if (this._header.current?.className !== "treeView-header-editing") {
            this._header.current!.className = "treeView-header";
        }
        document.removeEventListener("pointerup", this.onDragUp, true);
        document.removeEventListener("pointermove", this.onDragMove, true);
    }
    onDragMove = (e: PointerEvent): void => {
        Doc.UnBrushDoc(this.dataDoc);
        const pt = [e.clientX, e.clientY];
        const rect = this._header.current!.getBoundingClientRect();
        const before = pt[1] < rect.top + rect.height / 2;
        const inside = pt[0] > Math.min(rect.left + 75, rect.left + rect.width * .75) || (!before && this.treeViewOpen && this.childDocList.length);
        this._header.current!.className = "treeView-header";
        if (inside) this._header.current!.className += " treeView-header-inside";
        else if (before) this._header.current!.className += " treeView-header-above";
        else if (!before) this._header.current!.className += " treeView-header-below";
        e.stopPropagation();
    }

    public static makeTextBullet() {
        const bullet = Docs.Create.TextDocument("-text-", {
            layout: CollectionView.LayoutString("data"),
            title: "-title-", "sidebarColor": "transparent", "sidebarViewType": CollectionViewType.Freeform,
            treeViewExpandedViewLock: true, treeViewExpandedView: "data",
            _viewType: CollectionViewType.Tree, hideLinkButton: true, _showSidebar: true, treeViewType: "outline",
            x: 0, y: 0, _xMargin: 0, _yMargin: 0, _autoHeight: true, _singleLine: true, backgroundColor: "transparent", _width: 1000, _height: 10
        });
        Doc.GetProto(bullet).title = ComputedField.MakeFunction('self.text?.Text');
        Doc.GetProto(bullet).data = new List<Doc>([]);
        FormattedTextBox.SelectOnLoad = bullet[Id];
        return bullet;
    }

    makeTextCollection = () => {
        const bullet = TreeView.makeTextBullet();
        TreeView._editTitleOnLoad = { id: bullet[Id], parent: this };
        return this.props.addDocument(bullet);
    }

    makeFolder = () => {
        const folder = Docs.Create.TreeDocument([], { title: "-folder-", _stayInCollection: true, isFolder: true });
        TreeView._editTitleOnLoad = { id: folder[Id], parent: this.props.parentTreeView };
        return this.props.addDocument(folder);
    }

    preTreeDrop = (e: Event, de: DragManager.DropEvent, targetAction: dropActionType) => {
        const dragData = de.complete.docDragData;
        dragData && (dragData.dropAction = this.props.treeView.props.Document === dragData.treeViewDoc ? "same" : dragData.dropAction);
    }

    @undoBatch
    treeDrop = (e: Event, de: DragManager.DropEvent) => {
        const pt = [de.x, de.y];
        const rect = this._header.current!.getBoundingClientRect();
        const before = pt[1] < rect.top + rect.height / 2;
        const inside = this.props.treeView.fileSysMode && !this.doc.isFolder ? false : pt[0] > Math.min(rect.left + 75, rect.left + rect.width * .75) || (!before && this.treeViewOpen && this.childDocList.length);
        if (de.complete.linkDragData) {
            const sourceDoc = de.complete.linkDragData.linkSourceGetAnchor();
            const destDoc = this.doc;
            DocUtils.MakeLink({ doc: sourceDoc }, { doc: destDoc }, "tree link", "");
            e.stopPropagation();
        }
        const docDragData = de.complete.docDragData;
        if (docDragData) {
            e.stopPropagation();
            if (docDragData.draggedDocuments[0] === this.doc) return true;
            const parentAddDoc = (doc: Doc | Doc[]) => this.props.addDocument(doc, undefined, before);
            const canAdd = !StrCast((inside ? this.props.document : this.props.containerCollection)?.freezeChildren).includes("add") || docDragData.treeViewDoc === this.props.treeView.props.Document;
            const localAdd = (doc: Doc) => Doc.AddDocToList(this.dataDoc, this.fieldKey, doc) && ((doc.context = this.doc.context) || true) ? true : false;
            const addDoc = !inside ? parentAddDoc :
                (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg, doc) => flg && localAdd(doc), true as boolean);
            const move = (!docDragData.dropAction || docDragData.dropAction === "proto" || docDragData.dropAction === "move" || docDragData.dropAction === "same") && docDragData.moveDocument;
            if (canAdd) {
                UndoManager.RunInTempBatch(() => docDragData.droppedDocuments.reduce((added, d) => (move ? move(d, undefined, addDoc) || (docDragData.dropAction === "proto" ? addDoc(d) : false) : addDoc(d)) || added, false));
            }
        }
    }

    refTransform = (ref: HTMLDivElement | undefined | null) => {
        if (!ref) return this.props.ScreenToLocalTransform();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(ref);
        const outerXf = Utils.GetScreenTransform(this.props.treeView.MainEle());
        const offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        return this.props.ScreenToLocalTransform().translate(offset[0], offset[1]);
    }
    docTransform = () => this.refTransform(this._dref?.ContentRef?.current);
    getTransform = () => this.refTransform(this._tref.current);
    docWidth = () => {
        const layoutDoc = this.layoutDoc;
        const aspect = Doc.NativeAspect(layoutDoc);
        if (layoutDoc._fitWidth) return Math.min(this.props.panelWidth() - treeBulletWidth(), layoutDoc[WidthSym]());
        if (aspect) return Math.min(layoutDoc[WidthSym](), Math.min(this.MAX_EMBED_HEIGHT * aspect, this.props.panelWidth() - treeBulletWidth()));
        return Math.min(this.props.panelWidth() - treeBulletWidth(), Doc.NativeWidth(layoutDoc) ? layoutDoc[WidthSym]() : this.layoutDoc[WidthSym]());
    }
    docHeight = () => {
        const layoutDoc = this.layoutDoc;
        return Math.max(70, Math.min(this.MAX_EMBED_HEIGHT, (() => {
            const aspect = Doc.NativeAspect(layoutDoc);
            if (aspect) return this.docWidth() / (aspect || 1);
            return layoutDoc._fitWidth ?
                (!Doc.NativeHeight(this.doc) ?
                    NumCast(this.props.containerCollection._height)
                    :
                    Math.min(this.docWidth() * NumCast(layoutDoc.scrollHeight, Doc.NativeHeight(layoutDoc)) / (Doc.NativeWidth(layoutDoc) || NumCast(this.props.containerCollection._height))
                    ))
                :
                (layoutDoc[HeightSym]() || 50);
        })()));
    }

    @computed get expandedField() {
        const ids: { [key: string]: string } = {};
        const rows: JSX.Element[] = [];
        const doc = this.doc;
        doc && Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key));

        for (const key of Object.keys(ids).slice().sort()) {
            if (this.props.skipFields?.includes(key) || key === "title" || key === "treeViewOpen") continue;
            const contents = doc[key];
            let contentElement: (JSX.Element | null)[] | JSX.Element = [];

            if (contents instanceof Doc || (Cast(contents, listSpec(Doc)) && (Cast(contents, listSpec(Doc))!.length && Cast(contents, listSpec(Doc))![0] instanceof Doc))) {
                const remDoc = (doc: Doc | Doc[]) => this.remove(doc, key);
                const localAdd = (doc: Doc, addBefore?: Doc, before?: boolean) => {
                    const added = Doc.AddDocToList(this.dataDoc, key, doc, addBefore, before, false, true);
                    added && (doc.context = this.doc.context);
                    return added;
                };
                const addDoc = (doc: Doc | Doc[], addBefore?: Doc, before?: boolean) => (doc instanceof Doc ? [doc] : doc).reduce((flg, doc) => flg && localAdd(doc, addBefore, before), true);
                contentElement = TreeView.GetChildElements(contents instanceof Doc ? [contents] : DocListCast(contents),
                    this.props.treeView, this, doc, undefined, this.props.containerCollection, this.props.prevSibling, addDoc, remDoc, this.move,
                    this.props.dropAction, this.props.addDocTab, this.titleStyleProvider, this.props.ScreenToLocalTransform, this.props.isContentActive,
                    this.props.panelWidth, this.props.renderDepth, this.props.treeViewHideHeaderFields,
                    [...this.props.renderedIds, doc[Id]], this.props.onCheckedClick, this.props.onChildClick, this.props.skipFields, false, this.props.whenChildContentsActiveChanged,
                    this.props.dontRegisterView, emptyFunction, emptyFunction);
            } else {
                contentElement = <EditableView key="editableView"
                    contents={contents !== undefined ? Field.toString(contents as Field) : "null"}
                    height={13}
                    fontSize={12}
                    GetValue={() => Field.toKeyValueString(doc, key)}
                    SetValue={(value: string) => KeyValueBox.SetField(doc, key, value, true)} />;
            }
            rows.push(<div style={{ display: "flex" }} key={key}>
                <span style={{ fontWeight: "bold" }}>{key + ":"}</span>
                &nbsp;
                {contentElement}
            </div>);
        }
        rows.push(<div style={{ display: "flex" }} key={"newKeyValue"}>
            <EditableView
                key="editableView"
                contents={"+key:value"}
                height={13}
                fontSize={12}
                GetValue={returnEmptyString}
                SetValue={value => value.indexOf(":") !== -1 && KeyValueBox.SetField(doc, value.substring(0, value.indexOf(":")), value.substring(value.indexOf(":") + 1, value.length), true)} />
        </div>);
        return rows;
    }

    rtfWidth = () => Math.min(this.layoutDoc?.[WidthSym](), this.props.panelWidth() - treeBulletWidth());
    rtfHeight = () => this.rtfWidth() <= this.layoutDoc?.[WidthSym]() ? Math.min(this.layoutDoc?.[HeightSym](), this.MAX_EMBED_HEIGHT) : this.MAX_EMBED_HEIGHT;
    rtfOutlineHeight = () => Math.max(this.layoutDoc?.[HeightSym](), treeBulletWidth());
    expandPanelHeight = () => {
        if (this.layoutDoc._fitWidth) return this.docHeight();
        const aspect = this.layoutDoc[WidthSym]() / this.layoutDoc[HeightSym]();
        const docAspect = this.docWidth() / this.docHeight();
        return (docAspect < aspect) ? this.docWidth() / aspect : this.docHeight();
    }
    expandPanelWidth = () => {
        if (this.layoutDoc._fitWidth) return this.docWidth();
        const aspect = this.layoutDoc[WidthSym]() / this.layoutDoc[HeightSym]();
        const docAspect = this.docWidth() / this.docHeight();
        return (docAspect > aspect) ? this.docHeight() * aspect : this.docWidth();
    }

    @computed get renderContent() {
        TraceMobx();
        const expandKey = this.treeViewExpandedView;
        if (["links", "annotations", "aliases", this.fieldKey].includes(expandKey)) {
            const key = (expandKey === "annotations" ? `${this.fieldKey}-` : "") + expandKey;
            const remDoc = (doc: Doc | Doc[]) => this.remove(doc, key);
            const localAdd = (doc: Doc, addBefore?: Doc, before?: boolean) => {
                // if there's a sort ordering specified that can be modified on drop (eg, zorder can be modified, alphabetical can't),
                // then the modification would be done here
                const ordering = StrCast(this.doc.treeViewSortCriterion);
                if (ordering === "Z") {
                    const docs = TreeView.sortDocs(this.childDocs || ([] as Doc[]), ordering);
                    doc.zIndex = addBefore ? NumCast(addBefore.zIndex) + (before ? -0.5 : 0.5) : 1000;
                    docs.push(doc);
                    docs.sort((a, b) => NumCast(a.zIndex) > NumCast(b.zIndex) ? 1 : -1).forEach((d, i) => d.zIndex = i);
                }
                const added = Doc.AddDocToList(this.dataDoc, key, doc, addBefore, before, false, true);
                added && (doc.context = this.doc.context);
                return added;
            };
            const addDoc = (doc: Doc | Doc[], addBefore?: Doc, before?: boolean) => (doc instanceof Doc ? [doc] : doc).reduce((flg, doc) => flg && localAdd(doc, addBefore, before), true);
            const docs = expandKey === "aliases" ? this.childAliases : expandKey === "links" ? this.childLinks : expandKey === "annotations" ? this.childAnnos : this.childDocs;
            let downX = 0, downY = 0;
            const sortings = ["up", "down", "Z", undefined];
            const curSort = Math.max(0, sortings.indexOf(Cast(this.doc.treeViewSortCriterion, "string", null)));
            return <ul key={expandKey + "more"} title={"sort: " + sortings[curSort]} className={this.doc.treeViewHideTitle ? "no-indent" : ""}
                onPointerDown={e => { downX = e.clientX; downY = e.clientY; e.stopPropagation(); }}
                onClick={(e) => {
                    if (this.props.isContentActive() && Math.abs(e.clientX - downX) < 3 && Math.abs(e.clientY - downY) < 3) {
                        !this.props.treeView.outlineMode && (this.doc.treeViewSortCriterion = sortings[(curSort + 1) % sortings.length]);
                        e.stopPropagation();
                    }
                }}>
                {!docs ? (null) :
                    TreeView.GetChildElements(docs, this.props.treeView, this, this.layoutDoc,
                        this.dataDoc, this.props.containerCollection, this.props.prevSibling, addDoc, remDoc, this.move,
                        StrCast(this.doc.childDropAction, this.props.dropAction) as dropActionType, this.props.addDocTab, this.titleStyleProvider, this.props.ScreenToLocalTransform,
                        this.props.isContentActive, this.props.panelWidth, this.props.renderDepth, this.props.treeViewHideHeaderFields,
                        [...this.props.renderedIds, this.doc[Id]], this.props.onCheckedClick, this.props.onChildClick, this.props.skipFields, false, this.props.whenChildContentsActiveChanged,
                        this.props.dontRegisterView, emptyFunction, emptyFunction)}
            </ul >;
        } else if (this.treeViewExpandedView === "fields") {
            return <ul key={this.doc[Id] + this.doc.title}>
                <div style={{ display: "inline-block" }} >
                    {this.expandedField}
                </div>
            </ul>;
        }
        return <ul>{this.renderEmbeddedDocument(false)}</ul>; // "layout"
    }

    get onCheckedClick() { return this.doc.type === DocumentType.COL ? undefined : this.props.onCheckedClick?.() ?? ScriptCast(this.doc.onCheckedClick); }

    @action
    bulletClick = (e: React.MouseEvent) => {
        if (this.onCheckedClick) {
            this.onCheckedClick?.script.run({
                this: this.doc.isTemplateForField && this.props.dataDoc ? this.props.dataDoc : this.doc,
                heading: this.props.containerCollection.title,
                checked: this.doc.treeViewChecked === "check" ? "x" : this.doc.treeViewChecked === "x" ? "remove" : "check",
                containingTreeView: this.props.treeView.props.Document,
            }, console.log);
        } else {
            this.treeViewOpen = !this.treeViewOpen;
        }
        e.stopPropagation();
    }

    @computed get renderBullet() {
        TraceMobx();
        const iconType = this.props.treeView.props.styleProvider?.(this.doc, this.props.treeView.props, StyleProp.TreeViewIcon + (this.treeViewOpen ? ":open" : "")) || "question";
        const checked = this.onCheckedClick ? (this.doc.treeViewChecked ?? "unchecked") : undefined;
        return <div className={`bullet${this.props.treeView.outlineMode ? "-outline" : ""}`} key={"bullet"}
            title={this.childDocs?.length ? `click to see ${this.childDocs?.length} items` : "view fields"}
            onClick={this.bulletClick}
            style={this.props.treeView.outlineMode ? { opacity: this.titleStyleProvider?.(this.doc, this.props.treeView.props, StyleProp.Opacity) } : {
                color: StrCast(this.doc.color, checked === "unchecked" ? "white" : "inherit"),
                opacity: checked === "unchecked" ? undefined : 0.4
            }}>
            {this.props.treeView.outlineMode ?
                !(this.doc.text as RichTextField)?.Text ? (null) :
                    <FontAwesomeIcon size="sm" icon={[this.childDocs?.length && !this.treeViewOpen ? "fas" : "far", "circle"]} /> :
                <div className="treeView-bulletIcons" >
                    <div className={`treeView-${this.onCheckedClick ? "checkIcon" : "expandIcon"}`}>
                        <FontAwesomeIcon size="sm" icon={
                            checked === "check" ? "check" :
                                checked === "x" ? "times" :
                                    checked === "unchecked" ? "square" :
                                        !this.treeViewOpen ? "caret-right" : "caret-down"} />
                    </div>
                    {this.onCheckedClick ? (null) : <FontAwesomeIcon icon={iconType} />}
                </div>
            }
        </div>;
    }

    @action
    expandNextviewType = () => {
        if (this.treeViewOpen && !this.doc.isFolder && !this.props.treeView.outlineMode && !this.doc.treeViewExpandedViewLock) {
            const next = (modes: any[]) => modes[(modes.indexOf(StrCast(this.doc.treeViewExpandedView)) + 1) % modes.length];
            const annos = () => DocListCast(this.doc[this.fieldKey + "-annotations"]).length ? "annotations" : "";
            const links = () => DocListCast(this.doc.links).length ? "links" : "";
            const children = () => this.childDocs ? this.fieldKey : "";
            this.doc.treeViewExpandedView = next(this.props.treeView.fileSysMode ?
                (Doc.UserDoc().noviceMode ? ["layout", "aliases"] : ["layout", "aliases", "fields"]) :
                (Doc.UserDoc().noviceMode ? [children(), "layout"] : [children(), "fields", "layout", links(), annos()]).filter(mode => mode));
        }
        this.treeViewOpen = true;
    }

    @computed get headerElements() {
        return this.props.treeViewHideHeaderFields() || this.doc.treeViewHideHeaderFields ? (null)
            : <>
                {this.doc.hideContextMenu ? (null) : <FontAwesomeIcon key="bars" icon="bars" size="sm" onClick={e => { this.showContextMenu(e); e.stopPropagation(); }} />}
                {this.doc.treeViewExpandedViewLock || Doc.IsSystem(this.doc) ? (null) :
                    <span className="collectionTreeView-keyHeader" key={this.treeViewExpandedView} onPointerDown={this.expandNextviewType}>
                        {this.treeViewExpandedView}
                    </span>}
            </>;
    }

    showContextMenu = (e: React.MouseEvent) => {
        DocumentViewInternal.SelectAfterContextMenu = false;
        simulateMouseClick(this._docRef?.ContentDiv, e.clientX, e.clientY + 30, e.screenX, e.screenY + 30);
        DocumentViewInternal.SelectAfterContextMenu = true;
    }
    contextMenuItems = () => {
        const makeFolder = { script: ScriptField.MakeFunction(`scriptContext.makeFolder()`, { scriptContext: "any" })!, label: "New Folder" };
        return this.doc.isFolder ? [makeFolder] :
            Doc.IsSystem(this.doc) ? [] :
                this.props.treeView.fileSysMode && this.doc === Doc.GetProto(this.doc) ?
                    [{ script: ScriptField.MakeFunction(`openOnRight(getAlias(self))`)!, label: "Open Alias" }, makeFolder] :
                    [{ script: ScriptField.MakeFunction(`DocFocusOrOpen(self)`)!, label: "Focus or Open" }];
    }
    onChildClick = () => this.props.onChildClick?.() ?? (this._editTitleScript?.() || ScriptCast(this.doc.treeChildClick));
    onChildDoubleClick = () => (!this.props.treeView.outlineMode && this._openScript?.()) || ScriptCast(this.doc.treeChildDoubleClick);

    refocus = () => this.props.treeView.props.focus(this.props.treeView.props.Document);
    ignoreEvent = (e: any) => {
        if (this.props.isContentActive(true)) {
            e.stopPropagation();
            e.preventDefault();
        }
    }
    titleStyleProvider = (doc: (Doc | undefined), props: Opt<DocumentViewProps>, property: string): any => {
        if (!doc || doc !== this.doc) return this.props?.treeView?.props.styleProvider?.(doc, props, property); // properties are inherited from the CollectionTreeView, not the hierarchical parent in the treeView

        switch (property.split(":")[0]) {
            case StyleProp.Opacity: return this.props.treeView.outlineMode ? undefined : 1;
            case StyleProp.BackgroundColor: return this.selected ? "#7089bb" : StrCast(doc._backgroundColor, StrCast(doc.backgroundColor));
            case StyleProp.DocContents: return testDocProps(props) && !props?.treeViewDoc ? (null) :
                <div className="treeView-label" style={{    // just render a title for a tree view label (identified by treeViewDoc being set in 'props')
                    maxWidth: props?.PanelWidth() || undefined,
                    background: props?.styleProvider?.(doc, props, StyleProp.BackgroundColor),
                }}>
                    {StrCast(doc?.title)}
                </div>;
            default: return this.props?.treeView?.props.styleProvider?.(doc, props, property);
        }
    }
    embeddedStyleProvider = (doc: (Doc | undefined), props: Opt<DocumentViewProps>, property: string): any => {
        if (property.startsWith(StyleProp.Decorations)) return (null);
        return this.props?.treeView?.props.styleProvider?.(doc, props, property); // properties are inherited from the CollectionTreeView, not the hierarchical parent in the treeView
    }
    onKeyDown = (e: React.KeyboardEvent) => {
        if (this.doc.treeViewHideHeader || this.props.treeView.outlineMode) {
            e.stopPropagation();
            e.preventDefault();
            switch (e.key) {
                case "Tab": setTimeout(() => RichTextMenu.Instance.TextView?.EditorView?.focus(), 150);
                    return UndoManager.RunInBatch(() => e.shiftKey ? this.props.outdentDocument?.(true) : this.props.indentDocument?.(true), "tab");
                case "Backspace": return !(this.doc.text as RichTextField)?.Text && this.props.removeDoc?.(this.doc);
                case "Enter": return UndoManager.RunInBatch(this.makeTextCollection, "bullet");
            }
        }
    }
    titleWidth = () => Math.max(20, Math.min(this.props.treeView.truncateTitleWidth(), this.props.panelWidth() - 2 * treeBulletWidth()));

    /**
     * Renders the EditableView title element for placement into the tree.
     */
    @computed
    get renderTitle() {
        TraceMobx();
        const view = this._editTitle ? <EditableView key="_editTitle"
            oneLine={true}
            display={"inline-block"}
            editing={this._editTitle}
            background={"#7089bb"}
            contents={StrCast(this.doc.title)}
            height={12}
            sizeToContent={true}
            fontSize={12}
            GetValue={() => StrCast(this.doc.title)}
            OnTab={undoBatch((shift?: boolean) => {
                if (!shift) this.props.indentDocument?.(true);
                else this.props.outdentDocument?.(true);
            })}
            OnEmpty={undoBatch(() => this.props.treeView.outlineMode && this.props.removeDoc?.(this.doc))}
            OnFillDown={val => this.props.treeView.fileSysMode && this.makeFolder()}
            SetValue={undoBatch((value: string, shiftKey: boolean, enterKey: boolean) => {
                Doc.SetInPlace(this.doc, "title", value, false);
                this.props.treeView.outlineMode && enterKey && this.makeTextCollection();
            })}
        />
            : <DocumentView key="title"
                ref={action((r: any) => {
                    this._docRef = r ? r : undefined;
                    if (this._docRef && TreeView._editTitleOnLoad?.id === this.props.document[Id] && TreeView._editTitleOnLoad.parent === this.props.parentTreeView) {
                        this._docRef.select(false);
                        this.setEditTitle(this._docRef);
                        TreeView._editTitleOnLoad = undefined;
                    }
                })}
                Document={this.doc}
                DataDoc={undefined}
                scriptContext={this}
                hideDecorationTitle={this.props.treeView.outlineMode}
                hideResizeHandles={this.props.treeView.outlineMode}
                styleProvider={this.titleStyleProvider}
                layerProvider={returnTrue}
                docViewPath={returnEmptyDoclist}
                treeViewDoc={this.props.treeView.props.Document}
                addDocument={undefined}
                addDocTab={this.props.addDocTab}
                rootSelected={returnTrue}
                pinToPres={emptyFunction}
                onClick={this.onChildClick}
                onDoubleClick={this.onChildDoubleClick}
                dropAction={this.props.dropAction}
                moveDocument={this.move}
                removeDocument={this.props.removeDoc}
                ScreenToLocalTransform={this.getTransform}
                NativeHeight={() => 18}
                NativeWidth={this.titleWidth}
                PanelWidth={this.titleWidth}
                PanelHeight={() => 18}
                contextMenuItems={this.contextMenuItems}
                renderDepth={1}
                isContentActive={this.props.isContentActive}
                isDocumentActive={this.props.isContentActive}
                focus={this.refocus}
                whenChildContentsActiveChanged={this.props.whenChildContentsActiveChanged}
                bringToFront={emptyFunction}
                disableDocBrushing={this.props.treeView.props.disableDocBrushing}
                hideLinkButton={BoolCast(this.props.treeView.props.Document.childHideLinkButton)}
                dontRegisterView={BoolCast(this.props.treeView.props.Document.childDontRegisterViews, this.props.dontRegisterView)}
                docFilters={returnEmptyFilter}
                docRangeFilters={returnEmptyFilter}
                searchFilterDocs={returnEmptyDoclist}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={this.props.treeView.props.Document}
            />;

        return <>
            <div className={`docContainer${Doc.IsSystem(this.props.document) || this.props.document.isFolder ? "-system" : ""}`} ref={this._tref} title="click to edit title. Double Click or Drag to Open"
                style={{
                    fontWeight: Doc.IsSearchMatch(this.doc) !== undefined ? "bold" : undefined,
                    textDecoration: Doc.GetT(this.doc, "title", "string", true) ? "underline" : undefined,
                    outline: this.doc === CurrentUserUtils.ActiveDashboard ? "dashed 1px #06123232" : undefined,
                    pointerEvents: !this.props.isContentActive() && !SnappingManager.GetIsDragging() ? "none" : undefined
                }} >
                {view}
            </div >
            <div className={"right-buttons-container"}>
                {this.props.styleProvider?.(this.doc, this.props.treeView.props, StyleProp.Decorations + (Doc.IsSystem(this.props.containerCollection) ? ":afterHeader" : ""))} {/* hide and lock buttons */}
                {this.headerElements}
            </div>
        </>;
    }

    renderBulletHeader = (contents: JSX.Element, editing: boolean) => {
        return <>
            <div className={`treeView-header` + (editing ? "-editing" : "")} key="titleheader"
                ref={this._header}
                onClick={this.ignoreEvent}
                onPointerDown={this.ignoreEvent}
                onPointerEnter={this.onPointerEnter}
                onPointerLeave={this.onPointerLeave}>
                {contents}
            </div>
            {this.renderBorder}
        </>;
    }


    renderEmbeddedDocument = (asText: boolean) => {
        const layout = StrCast(Doc.LayoutField(this.layoutDoc));
        const isExpandable = layout.includes(FormattedTextBox.name) || layout.includes(SliderBox.name);
        const panelWidth = asText || isExpandable ? this.rtfWidth : this.expandPanelWidth;
        const panelHeight = asText ? this.rtfOutlineHeight : isExpandable ? this.rtfHeight : this.expandPanelHeight;
        return <DocumentView key={this.doc[Id]} ref={action((r: DocumentView | null) => this._dref = r)}
            Document={this.doc}
            DataDoc={undefined}
            PanelWidth={panelWidth}
            PanelHeight={panelHeight}
            NativeWidth={!asText && (this.layoutDoc.type === DocumentType.RTF || this.layoutDoc.type === DocumentType.SLIDER) ? this.rtfWidth : undefined}
            NativeHeight={!asText && (this.layoutDoc.type === DocumentType.RTF || this.layoutDoc.type === DocumentType.SLIDER) ? this.rtfHeight : undefined}
            LayoutTemplateString={asText ? FormattedTextBox.LayoutString("text") : undefined}
            isContentActive={asText ? this.props.isContentActive : returnFalse}
            isDocumentActive={asText ? this.props.isContentActive : returnFalse}
            styleProvider={asText ? this.titleStyleProvider : this.embeddedStyleProvider}
            hideTitle={asText}
            fitContentsToDoc={returnTrue}
            hideDecorationTitle={this.props.treeView.outlineMode}
            hideResizeHandles={this.props.treeView.outlineMode}
            focus={this.refocus}
            hideLinkButton={BoolCast(this.props.treeView.props.Document.childHideLinkButton)}
            dontRegisterView={BoolCast(this.props.treeView.props.Document.childDontRegisterViews, this.props.dontRegisterView)}
            ScreenToLocalTransform={this.docTransform}
            renderDepth={this.props.renderDepth + 1}
            rootSelected={returnTrue}
            layerProvider={returnTrue}
            docViewPath={this.props.treeView.props.docViewPath}
            docFilters={returnEmptyFilter}
            docRangeFilters={returnEmptyFilter}
            searchFilterDocs={returnEmptyDoclist}
            ContainingCollectionDoc={this.props.containerCollection}
            ContainingCollectionView={undefined}
            addDocument={this.props.addDocument}
            moveDocument={this.move}
            removeDocument={this.props.removeDoc}
            whenChildContentsActiveChanged={this.props.whenChildContentsActiveChanged}
            addDocTab={this.props.addDocTab}
            pinToPres={this.props.treeView.props.pinToPres}
            disableDocBrushing={this.props.treeView.props.disableDocBrushing}
            bringToFront={returnFalse}
        />;
    }

    // renders the text version of a document as the header.  This is used in the file system mode and in other vanilla tree views.
    @computed get renderTitleAsHeader() {
        return <>
            {this.renderBullet}
            {this.renderTitle}
        </>;
    }

    // renders the document in the header field instead of a text proxy.
    @computed get renderDocumentAsHeader() {
        return <>
            {this.renderBullet}
            {this.renderEmbeddedDocument(true)}
        </>;
    }

    @computed get renderBorder() {
        const sorting = this.doc[`${this.fieldKey}-sortCriteria`];
        return <div className={`treeView-border${this.props.treeView.outlineMode ? "outline" : ""}`}
            style={{ borderColor: sorting === undefined ? undefined : sorting === "up" ? "crimson" : sorting === "down" ? "blue" : "green" }}>
            {!this.treeViewOpen ? (null) : this.renderContent}
        </div>;
    }

    render() {
        TraceMobx();
        const hideTitle = this.doc.treeViewHideHeader || this.props.treeView.outlineMode;
        return this.props.renderedIds.indexOf(this.doc[Id]) !== -1 ? "<" + this.doc.title + ">" : // just print the title of documents we've previously rendered in this hierarchical path to avoid cycles
            <div className={`treeView-container${this.props.isContentActive() ? "-active" : ""}`}
                ref={this.createTreeDropTarget}
                //onPointerDown={e => this.props.isContentActive(true) && SelectionManager.DeselectAll()} // bcz: this breaks entering a text filter in a filterBox since it deselects the filter's target document
                onKeyDown={this.onKeyDown}>
                <li className="collection-child">
                    {hideTitle && this.doc.type !== DocumentType.RTF ?
                        this.renderEmbeddedDocument(false) :
                        this.renderBulletHeader(hideTitle ? this.renderDocumentAsHeader : this.renderTitleAsHeader, this._editTitle)}
                </li>
            </div>;
    }

    public static sortDocs(childDocs: Doc[], criterion: string | undefined) {
        const docs = childDocs.slice();
        if (criterion) {
            const sortAlphaNum = (a: string, b: string): 0 | 1 | -1 => {
                const reN = /[0-9]*$/;
                const aA = a.replace(reN, ""); // get rid of trailing numbers
                const bA = b.replace(reN, "");
                if (aA === bA) {  // if header string matches, then compare numbers numerically
                    const aN = parseInt(a.match(reN)![0], 10);
                    const bN = parseInt(b.match(reN)![0], 10);
                    return aN === bN ? 0 : aN > bN ? 1 : -1;
                } else {
                    return aA > bA ? 1 : -1;
                }
            };
            docs.sort(function (d1, d2): 0 | 1 | -1 {
                const a = (criterion === "up" ? d2 : d1);
                const b = (criterion === "up" ? d1 : d2);
                const first = a[criterion === "Z" ? "zIndex" : "title"];
                const second = b[criterion === "Z" ? "zIndex" : "title"];
                if (typeof first === 'number' && typeof second === 'number') return (first - second) > 0 ? 1 : -1;
                if (typeof first === 'string' && typeof second === 'string') return sortAlphaNum(first, second);
                return criterion ? 1 : -1;
            });
        }
        return docs;
    }

    public static GetChildElements(
        childDocs: Doc[],
        treeView: CollectionTreeView,
        parentTreeView: CollectionTreeView | TreeView | undefined,
        conainerCollection: Doc,
        dataDoc: Doc | undefined,
        parentCollectionDoc: Doc | undefined,
        containerPrevSibling: Doc | undefined,
        add: (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => boolean,
        remove: undefined | ((doc: Doc | Doc[]) => boolean),
        move: DragManager.MoveFunction,
        dropAction: dropActionType,
        addDocTab: (doc: Doc, where: string) => boolean,
        styleProvider: undefined | StyleProviderFunc,
        screenToLocalXf: () => Transform,
        isContentActive: (outsideReaction?: boolean) => boolean,
        panelWidth: () => number,
        renderDepth: number,
        treeViewHideHeaderFields: () => boolean,
        renderedIds: string[],
        onCheckedClick: undefined | (() => ScriptField),
        onChildClick: undefined | (() => ScriptField),
        skipFields: string[] | undefined,
        firstLevel: boolean,
        whenChildContentsActiveChanged: (isActive: boolean) => void,
        dontRegisterView: boolean | undefined,
        observerHeight: (ref: any) => void,
        unobserveHeight: (ref: any) => void
    ) {
        const viewSpecScript = Cast(conainerCollection.viewSpecScript, ScriptField);
        if (viewSpecScript) {
            childDocs = childDocs.filter(d => viewSpecScript.script.run({ doc: d }, console.log).result);
        }

        const docs = TreeView.sortDocs(childDocs, StrCast(conainerCollection.treeViewSortCriterion));
        const rowWidth = () => panelWidth() - treeBulletWidth();
        const treeViewRefs = new Map<Doc, TreeView | undefined>();
        return docs.filter(child => child instanceof Doc).map((child, i) => {
            const pair = Doc.GetLayoutDataDocPair(conainerCollection, dataDoc, child);
            if (!pair.layout || pair.data instanceof Promise) {
                return (null);
            }

            const dentDoc = (editTitle: boolean, newParent: Doc, addAfter: Doc | undefined, parent: TreeView | CollectionTreeView | undefined) => {
                const fieldKey = Doc.LayoutFieldKey(newParent);
                if (remove && fieldKey && Cast(newParent[fieldKey], listSpec(Doc)) !== undefined) {
                    remove(child);
                    FormattedTextBox.SelectOnLoad = child[Id];
                    TreeView._editTitleOnLoad = editTitle ? { id: child[Id], parent } : undefined;
                    Doc.AddDocToList(newParent, fieldKey, child, addAfter, false);
                    newParent.treeViewOpen = true;
                    child.context = treeView.Document;
                }
            };
            const indent = i === 0 ? undefined : (editTitle: boolean) => dentDoc(editTitle, docs[i - 1], undefined, treeViewRefs.get(docs[i - 1]));
            const outdent = parentCollectionDoc?._viewType !== CollectionViewType.Tree ? undefined : ((editTitle: boolean) => dentDoc(editTitle, parentCollectionDoc, containerPrevSibling, parentTreeView instanceof TreeView ? parentTreeView.props.parentTreeView : undefined));
            const addDocument = (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => add(doc, relativeTo ?? docs[i], before !== undefined ? before : false);
            const childLayout = Doc.Layout(pair.layout);
            const rowHeight = () => {
                const aspect = Doc.NativeAspect(childLayout);
                return aspect ? Math.min(childLayout[WidthSym](), rowWidth()) / aspect : childLayout[HeightSym]();
            };
            return <TreeView key={child[Id]} ref={r => treeViewRefs.set(child, r ? r : undefined)}
                document={pair.layout}
                dataDoc={pair.data}
                containerCollection={conainerCollection}
                prevSibling={docs[i]}
                treeView={treeView}
                indentDocument={indent}
                outdentDocument={outdent}
                onCheckedClick={onCheckedClick}
                onChildClick={onChildClick}
                renderDepth={renderDepth}
                removeDoc={StrCast(conainerCollection.freezeChildren).includes("remove") ? undefined : remove}
                addDocument={addDocument}
                styleProvider={styleProvider}
                panelWidth={rowWidth}
                panelHeight={rowHeight}
                dontRegisterView={dontRegisterView}
                moveDocument={move}
                dropAction={dropAction}
                addDocTab={addDocTab}
                ScreenToLocalTransform={screenToLocalXf}
                isContentActive={isContentActive}
                treeViewHideHeaderFields={treeViewHideHeaderFields}
                renderedIds={renderedIds}
                skipFields={skipFields}
                firstLevel={firstLevel}
                whenChildContentsActiveChanged={whenChildContentsActiveChanged}
                parentTreeView={parentTreeView}
                observeHeight={observerHeight}
                unobserveHeight={unobserveHeight}
            />;
        });
    }
}