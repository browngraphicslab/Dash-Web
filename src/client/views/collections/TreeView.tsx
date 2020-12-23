import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { TREE_BULLET_WIDTH } from '../globalCssVariables.scss';
import { DataSym, Doc, DocListCast, DocListCastOrNull, Field, HeightSym, Opt, WidthSym } from '../../../fields/Doc';
import { Id } from '../../../fields/FieldSymbols';
import { List } from '../../../fields/List';
import { RichTextField } from '../../../fields/RichTextField';
import { listSpec } from '../../../fields/Schema';
import { ComputedField, ScriptField } from '../../../fields/ScriptField';
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from '../../../fields/Types';
import { TraceMobx } from '../../../fields/util';
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnEmptyString, returnFalse, returnTrue, returnZero, simulateMouseClick, Utils } from '../../../Utils';
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
import { DocumentView, DocumentViewProps, StyleProviderFunc } from '../nodes/DocumentView';
import { FieldViewProps } from '../nodes/FieldView';
import { FormattedTextBox } from '../nodes/formattedText/FormattedTextBox';
import { RichTextMenu } from '../nodes/formattedText/RichTextMenu';
import { KeyValueBox } from '../nodes/KeyValueBox';
import { StyleProp, testDocProps } from '../StyleProvider';
import { CollectionTreeView } from './CollectionTreeView';
import { CollectionView, CollectionViewType } from './CollectionView';
import "./TreeView.scss";
import React = require("react");

export interface TreeViewProps {
    document: Doc;
    dataDoc?: Doc;
    containingCollection: Doc;
    prevSibling?: Doc;
    renderDepth: number;
    removeDoc: ((doc: Doc | Doc[]) => boolean) | undefined;
    moveDocument: DragManager.MoveFunction;
    dropAction: dropActionType;
    addDocTab: (doc: Doc, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    panelWidth: () => number;
    panelHeight: () => number;
    addDocument: (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => boolean;
    indentDocument?: () => void;
    outdentDocument?: () => void;
    ScreenToLocalTransform: () => Transform;
    dontRegisterView?: boolean;
    styleProvider?: StyleProviderFunc | undefined;
    outerXf: () => { translateX: number, translateY: number };
    treeView: CollectionTreeView;
    parentKey: string;
    active: (outsideReaction?: boolean) => boolean;
    treeViewHideHeaderFields: () => boolean;
    treeViewPreventOpen: boolean;
    renderedIds: string[]; // list of document ids rendered used to avoid unending expansion of items in a cycle
    onCheckedClick?: () => ScriptField;
    onChildClick?: () => ScriptField;
    skipFields?: string[];
    firstLevel: boolean;
    whenActiveChanged: (isActive: boolean) => void;
}

const treeBulletWidth = function () { return Number(TREE_BULLET_WIDTH.replace("px", "")); };

@observer
/**
 * Renders a treeView of a collection of documents
 * 
 * special fields:
 * treeViewOpen : flag denoting whether the documents sub-tree (contents) is visible or hidden
 * treeViewPreventOpen : ignores the treeViewOpen flag (for allowing a view to not be slaved to other views of the document)
 * treeViewExpandedView : name of field whose contents are being displayed as the document's subtree
 */
export class TreeView extends React.Component<TreeViewProps> {
    private _editTitleScript: (() => ScriptField) | undefined;
    private _openScript: (() => ScriptField) | undefined;
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _treedropDisposer?: DragManager.DragDropDisposer;
    private _tref = React.createRef<HTMLDivElement>();
    private _docRef = React.createRef<DocumentView>();
    private _uniqueId = Utils.GenerateGuid();
    private _editMaxWidth: number | string = 0;


    @observable _dref: DocumentView | undefined | null;
    @computed get doc() { TraceMobx(); return this.props.document; }
    get noviceMode() { return BoolCast(Doc.UserDoc().noviceMode, false); }
    get displayName() { return "TreeView(" + this.props.document.title + ")"; }  // this makes mobx trace() statements more descriptive
    get treeViewLockExpandedView() { return this.doc.treeViewLockExpandedView; }
    get defaultExpandedView() { return StrCast(this.doc.treeViewDefaultExpandedView, this.noviceMode || this.outlineMode ? "layout" : "fields"); }
    get treeViewDefaultExpandedView() { return this.treeViewLockExpandedView ? this.defaultExpandedView : (this.childDocs ? this.fieldKey : this.defaultExpandedView); }
    @observable _overrideTreeViewOpen = false; // override of the treeViewOpen field allowing the display state to be independent of the document's state
    set treeViewOpen(c: boolean) {
        if (this.props.treeViewPreventOpen) this._overrideTreeViewOpen = c;
        else this.doc.treeViewOpen = this._overrideTreeViewOpen = c;
    }
    @computed get outlineMode() { return this.props.treeView.doc.treeViewOutlineMode; }
    @computed get treeViewOpen() { return (!this.props.treeViewPreventOpen && !this.doc.treeViewPreventOpen && BoolCast(this.doc.treeViewOpen)) || this._overrideTreeViewOpen; }
    @computed get treeViewExpandedView() { return StrCast(this.doc.treeViewExpandedView, this.treeViewDefaultExpandedView); }
    @computed get MAX_EMBED_HEIGHT() { return NumCast(this.props.containingCollection.maxEmbedHeight, 200); }
    @computed get dataDoc() { return this.doc[DataSym]; }
    @computed get layoutDoc() { return Doc.Layout(this.doc); }
    @computed get fieldKey() { TraceMobx(); const splits = StrCast(Doc.LayoutField(this.doc)).split("fieldKey={\'"); return splits.length > 1 ? splits[1].split("\'")[0] : "data"; }
    childDocList(field: string) {
        const layout = Doc.LayoutField(this.doc) instanceof Doc ? Doc.LayoutField(this.doc) as Doc : undefined;
        return ((this.props.dataDoc ? DocListCastOrNull(this.props.dataDoc[field]) : undefined) || // if there's a data doc for an expanded template, use it's data field
            (layout ? DocListCastOrNull(layout[field]) : undefined) || // else if there's a layout doc, display it's fields
            DocListCastOrNull(this.doc[field])); // otherwise use the document's data field
    }
    @computed get childDocs() { TraceMobx(); return this.childDocList(this.fieldKey); }
    @computed get childLinks() { return this.childDocList("links"); }
    @computed get childAnnos() { return this.childDocList(this.fieldKey + "-annotations"); }
    @computed get isCollectionDoc() {
        return !StrCast(this.props.document.type).includes(DocumentType.COL) || !DocListCast(this.props.document[this.fieldKey]).length ? false : true;
    }

    @undoBatch openRight = () => this.props.addDocTab(this.doc, "add:right");
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
    @undoBatch @action removeDoc = (doc: Doc | Doc[]) => this.remove(doc, Doc.LayoutFieldKey(this.doc));

    constructor(props: any) {
        super(props);
        const titleScript = ScriptField.MakeScript(`{setInPlace(self, 'editTitle', '${this._uniqueId}'); documentView.select();} `, { documentView: "any" });
        const openScript = ScriptField.MakeScript(`openOnRight(self)`);
        const treeOpenScript = ScriptField.MakeScript(`self.treeViewOpen = !self.treeViewOpen`);
        this._editTitleScript = !Doc.IsSystem(this.props.document) ? titleScript && (() => titleScript) : treeOpenScript && (() => treeOpenScript);
        this._openScript = !Doc.IsSystem(this.props.document) ? openScript && (() => openScript) : undefined;
        if (Doc.GetT(this.props.document, "editTitle", "string", true) === "*") Doc.SetInPlace(this.props.document, "editTitle", this._uniqueId, false);
    }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this._treedropDisposer?.();
        ele && (this._treedropDisposer = DragManager.MakeDropTarget(ele, this.treeDrop.bind(this), undefined, this.preTreeDrop.bind(this)), this.doc);
    }

    componentWillUnmount() {
        document.removeEventListener("pointermove", this.onDragMove, true);
        document.removeEventListener("pointermove", this.onDragUp, true);
    }

    onDragUp = (e: PointerEvent) => {
        document.removeEventListener("pointerup", this.onDragUp, true);
        document.removeEventListener("pointermove", this.onDragMove, true);
    }
    onPointerEnter = (e: React.PointerEvent): void => {
        this.props.active(true) && Doc.BrushDoc(this.dataDoc);
        if (e.buttons === 1 && SnappingManager.GetIsDragging()) {
            this._header!.current!.className = "treeView-header";
            document.removeEventListener("pointermove", this.onDragMove, true);
            document.addEventListener("pointermove", this.onDragMove, true);
            document.removeEventListener("pointerup", this.onDragUp, true);
            document.addEventListener("pointerup", this.onDragUp, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        Doc.UnBrushDoc(this.dataDoc);
        if (this._header?.current?.className !== "treeView-header-editing") {
            this._header!.current!.className = "treeView-header";
        }
        document.removeEventListener("pointerup", this.onDragUp, true);
        document.removeEventListener("pointermove", this.onDragMove, true);
    }
    onDragMove = (e: PointerEvent): void => {
        Doc.UnBrushDoc(this.dataDoc);
        const pt = [e.clientX, e.clientY];
        const rect = this._header!.current!.getBoundingClientRect();
        const before = pt[1] < rect.top + rect.height / 2;
        const inside = pt[0] > Math.min(rect.left + 75, rect.left + rect.width * .75) || (!before && this.treeViewOpen && this.childDocList.length);
        this._header!.current!.className = "treeView-header";
        if (inside) this._header!.current!.className += " treeView-header-inside";
        else if (before) this._header!.current!.className += " treeView-header-above";
        else if (!before) this._header!.current!.className += " treeView-header-below";
        e.stopPropagation();
    }

    public static makeTextBullet() {
        const bullet = Docs.Create.TextDocument("-text-", {
            layout: CollectionView.LayoutString("data"),
            title: "-title-", "sidebarColor": "transparent", "sidebarViewType": CollectionViewType.Freeform,
            _viewType: CollectionViewType.Tree, hideLinkButton: true, _showSidebar: true, treeViewOutlineMode: true,
            x: 0, y: 0, _xMargin: 0, _yMargin: 0, _autoHeight: true, _singleLine: true, _backgroundColor: "transparent", _width: 1000, _height: 10
        });
        Doc.GetProto(bullet).title = ComputedField.MakeFunction('self.text?.Text');
        Doc.GetProto(bullet).data = new List<Doc>([]);
        Doc.SetInPlace(bullet, "editTitle", "*", false);
        FormattedTextBox.SelectOnLoad = bullet[Id];
        return bullet;
    }

    makeTextCollection = () => {
        Doc.SetInPlace(this.doc, "editTitle", undefined, false);
        const bullet = TreeView.makeTextBullet();
        const added = this.props.addDocument(bullet);
        bullet.context = this.props.treeView.Document;
        return added;
    }

    editableView = (key: string, style?: string) => (<EditableView
        oneLine={true}
        display={"inline-block"}
        editing={true}
        contents={StrCast(this.doc[key])}
        height={12}
        sizeToContent={true}
        fontStyle={style}
        fontSize={12}
        GetValue={() => StrCast(this.doc[key])}
        SetValue={undoBatch((value: string, shiftKey: boolean, enterKey: boolean) => {
            Doc.SetInPlace(this.doc, key, value, false);
            if (this.outlineMode && enterKey) {
                this.makeTextCollection();
            } else {
                Doc.SetInPlace(this.doc, "editTitle", undefined, false);
            }
        })}
        onClick={() => {
            SelectionManager.DeselectAll();
            return false;
        }}
        OnEmpty={undoBatch(() => this.props.treeView.doc.treeViewOutlineMode && this.props.removeDoc?.(this.doc))}
        OnTab={undoBatch((shift?: boolean) => {
            shift ? this.props.outdentDocument?.() : this.props.indentDocument?.();
            setTimeout(() => Doc.SetInPlace(this.doc, "editTitle", `${this.props.treeView._uniqueId}`, false), 0);
        })}
    />)

    preTreeDrop = (e: Event, de: DragManager.DropEvent, targetAction: dropActionType) => {
        const dragData = de.complete.docDragData;
        dragData && (dragData.dropAction = this.props.treeView.props.Document === dragData.treeViewDoc ? "same" : dragData.dropAction);
    }

    @undoBatch
    treeDrop = (e: Event, de: DragManager.DropEvent) => {
        const pt = [de.x, de.y];
        const rect = this._header!.current!.getBoundingClientRect();
        const before = pt[1] < rect.top + rect.height / 2;
        const inside = pt[0] > Math.min(rect.left + 75, rect.left + rect.width * .75) || (!before && this.treeViewOpen && this.childDocList.length);
        if (de.complete.linkDragData) {
            const sourceDoc = de.complete.linkDragData.linkSourceDocument;
            const destDoc = this.doc;
            DocUtils.MakeLink({ doc: sourceDoc }, { doc: destDoc }, "tree link", "");
            e.stopPropagation();
        }
        const docDragData = de.complete.docDragData;
        if (docDragData) {
            e.stopPropagation();
            if (docDragData.draggedDocuments[0] === this.doc) return true;
            const parentAddDoc = (doc: Doc | Doc[]) => this.props.addDocument(doc, undefined, before);
            let addDoc = parentAddDoc;
            if (inside) {
                const localAdd = (doc: Doc) => {
                    const added = Doc.AddDocToList(this.dataDoc, this.fieldKey, doc);
                    added && (doc.context = this.doc.context);
                    return added;
                };
                addDoc = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce(
                    (flg: boolean, doc) => flg && localAdd(doc), true) || parentAddDoc(doc);
            }
            const move = (!docDragData.dropAction || docDragData.dropAction === "move" || docDragData.dropAction === "same") && docDragData.moveDocument;
            return docDragData.droppedDocuments.reduce((added, d) => (move ? docDragData.moveDocument?.(d, undefined, addDoc) : addDoc(d)) || added, false);
        }
        return false;
    }

    refTransform = (ref: HTMLDivElement | undefined | null) => {
        if (!ref) return this.props.ScreenToLocalTransform();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(ref);
        const outerXf = this.props.outerXf();
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
                    NumCast(this.props.containingCollection._height)
                    :
                    Math.min(this.docWidth() * NumCast(layoutDoc.scrollHeight, Doc.NativeHeight(layoutDoc)) / (Doc.NativeWidth(layoutDoc) || NumCast(this.props.containingCollection._height))
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
                    this.props.treeView, doc, undefined, key, this.props.containingCollection, this.props.prevSibling, addDoc, remDoc, this.move,
                    this.props.dropAction, this.props.addDocTab, this.props.pinToPres, this.titleStyleProvider, this.props.ScreenToLocalTransform, this.props.outerXf, this.props.active,
                    this.props.panelWidth, this.props.renderDepth, this.props.treeViewHideHeaderFields, this.props.treeViewPreventOpen,
                    [...this.props.renderedIds, doc[Id]], this.props.onCheckedClick, this.props.onChildClick, this.props.skipFields, false, this.props.whenActiveChanged, this.props.dontRegisterView);
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
        if (["links", "annotations", this.fieldKey].includes(expandKey)) {
            const remDoc = (doc: Doc | Doc[]) => this.remove(doc, expandKey);
            const localAdd = (doc: Doc, addBefore?: Doc, before?: boolean) => {
                // if there's a sort ordering specified that can be modified on drop (eg, zorder can be modified, alphabetical can't),
                // then the modification would be done here
                const ordering = StrCast(this.doc[this.fieldKey + "-sortCriteria"]);
                if (ordering === "zorder") {
                    const docs = TreeView.sortDocs(this.childDocs || ([] as Doc[]), ordering);
                    doc.zIndex = addBefore ? (before ? NumCast(addBefore.zIndex) - 0.5 : NumCast(addBefore.zIndex) + 0.5) : 1000;
                    docs.push(doc);
                    docs.sort((a, b) => NumCast(a.zIndex) > NumCast(b.zIndex) ? 1 : -1);
                    docs.forEach((d, i) => d.zIndex = i);
                }
                const added = Doc.AddDocToList(this.dataDoc, expandKey, doc, addBefore, before, false, true);
                added && (doc.context = this.doc.context);
                return added;
            };
            const addDoc = (doc: Doc | Doc[], addBefore?: Doc, before?: boolean) => (doc instanceof Doc ? [doc] : doc).reduce((flg, doc) => flg && localAdd(doc, addBefore, before), true);
            const docs = expandKey === "links" ? this.childLinks : expandKey === "annotations" ? this.childAnnos : this.childDocs;
            const sortKey = `${this.fieldKey}-sortCriteria`;
            return <ul key={expandKey + "more"} className={this.doc.treeViewHideTitle ? "no-indent" : ""} onClick={(e) => {
                !this.outlineMode && (this.doc[sortKey] =
                    (this.doc[sortKey] === "ascending" ? "descending" :
                        (this.doc[sortKey] === "descending" ? "zorder" :
                            (this.doc[sortKey] === "zorder" ? undefined :
                                "ascending"))));
                e.stopPropagation();
            }}>
                {!docs ? (null) :
                    TreeView.GetChildElements(docs, this.props.treeView, this.layoutDoc,
                        this.dataDoc, expandKey, this.props.containingCollection, this.props.prevSibling, addDoc, remDoc, this.move,
                        StrCast(this.doc.childDropAction, this.props.dropAction) as dropActionType, this.props.addDocTab, this.props.pinToPres, this.titleStyleProvider, this.props.ScreenToLocalTransform,
                        this.props.outerXf, this.props.active, this.props.panelWidth, this.props.renderDepth, this.props.treeViewHideHeaderFields, this.props.treeViewPreventOpen,
                        [...this.props.renderedIds, this.doc[Id]], this.props.onCheckedClick, this.props.onChildClick, this.props.skipFields, false, this.props.whenActiveChanged, this.props.dontRegisterView)}
            </ul >;
        } else if (this.treeViewExpandedView === "fields") {
            return <ul key={this.doc[Id] + this.doc.title}>
                <div style={{ display: "inline-block" }} >
                    {this.expandedField}
                </div>
            </ul>;
        }
        return <ul>{this.renderEmbeddedDocument(false)}</ul>;
    }

    get onCheckedClick() { return this.doc.type === DocumentType.COL ? undefined : this.props.onCheckedClick?.() ?? ScriptCast(this.doc.onCheckedClick); }

    @action
    bulletClick = (e: React.MouseEvent) => {
        if (this.onCheckedClick) {
            this.onCheckedClick?.script.run({
                this: this.doc.isTemplateForField && this.props.dataDoc ? this.props.dataDoc : this.doc,
                heading: this.props.containingCollection.title,
                checked: this.doc.treeViewChecked === "check" ? "x" : this.doc.treeViewChecked === "x" ? undefined : "check",
                containingTreeView: this.props.treeView.props.Document,
            }, console.log);
        } else {
            this.treeViewOpen = !this.treeViewOpen;
        }
        e.stopPropagation();
    }

    @computed get renderBullet() {
        TraceMobx();
        const iconType = Doc.toIcon(this.doc);
        const checked = this.onCheckedClick ? (this.doc.treeViewChecked ?? "unchecked") : undefined;
        return <div className={`bullet${this.outlineMode ? "-outline" : ""}`} key={"bullet"}
            title={this.childDocs?.length ? `click to see ${this.childDocs?.length} items` : "view fields"}
            onClick={this.bulletClick}
            style={this.outlineMode ? { opacity: this.titleStyleProvider?.(this.doc, this.props.treeView.props, StyleProp.Opacity) } : {
                color: StrCast(this.doc.color, checked === "unchecked" ? "white" : "inherit"),
                opacity: checked === "unchecked" ? undefined : 0.4
            }}>
            {this.outlineMode ?
                !(this.doc.text as RichTextField)?.Text ? (null) :
                    <FontAwesomeIcon size="sm" icon={[this.childDocs?.length && !this.treeViewOpen ? "fas" : "far", "circle"]} /> :
                <div className="treeView-bulletIcons" >
                    <div className={`treeView-${this.onCheckedClick ? "checkIcon" : "expandIcon"}`}>
                        <FontAwesomeIcon size="sm" icon={
                            checked === "check" ? "check" :
                                (checked === "x" ? "times" : checked === "unchecked" ? "square" :
                                    !this.treeViewOpen ? "caret-right" :
                                        "caret-down")} />
                    </div>
                    {this.onCheckedClick ? (null) : <FontAwesomeIcon icon={iconType} />}
                </div>
            }
        </div>;
    }

    @computed get showTitleEditorControl() { return ["*", this._uniqueId, this.props.treeView._uniqueId].includes(Doc.GetT(this.doc, "editTitle", "string", true) || ""); }
    @computed get headerElements() {
        return (Doc.IsSystem(this.doc) && Doc.UserDoc().noviceMode) || this.props.treeViewHideHeaderFields() ? (null) :
            <>
                <FontAwesomeIcon key="bars" icon="bars" size="sm" onClick={e => { this.showContextMenu(e); e.stopPropagation(); }} />
                <span className="collectionTreeView-keyHeader" key={this.treeViewExpandedView}
                    onPointerDown={action(() => {
                        if (this.treeViewOpen) {
                            this.doc.treeViewExpandedView = this.treeViewLockExpandedView ? this.doc.treeViewExpandedView :
                                this.treeViewExpandedView === this.fieldKey ? (Doc.UserDoc().noviceMode || this.outlineMode ? "layout" : "fields") :
                                    this.treeViewExpandedView === "fields" && this.layoutDoc ? "layout" :
                                        this.treeViewExpandedView === "layout" && DocListCast(this.doc.links).length ? "links" :
                                            (this.treeViewExpandedView === "links" || this.treeViewExpandedView === "layout") && DocListCast(this.doc[this.fieldKey + "-annotations"]).length ? "annotations" :
                                                this.childDocs ? this.fieldKey : (Doc.UserDoc().noviceMode || this.outlineMode ? "layout" : "fields");
                        }
                        this.treeViewOpen = true;
                    })}>
                    {this.treeViewExpandedView}
                </span>
            </>;
    }

    showContextMenu = (e: React.MouseEvent) => simulateMouseClick(this._docRef.current?.ContentDiv, e.clientX, e.clientY + 30, e.screenX, e.screenY + 30);
    contextMenuItems = () => Doc.IsSystem(this.doc) ? [] : [{ script: ScriptField.MakeFunction(`openOnRight(self)`)!, label: "Open" }, { script: ScriptField.MakeFunction(`DocFocus(self)`)!, label: "Focus" }];
    truncateTitleWidth = () => NumCast(this.props.treeView.props.Document.treeViewTruncateTitleWidth, this.props.panelWidth());
    onChildClick = () => this.props.onChildClick?.() ?? (this._editTitleScript?.() || ScriptCast(this.doc.treeChildClick));
    onChildDoubleClick = () => (!this.outlineMode && this._openScript?.()) || ScriptCast(this.doc.treeChildDoubleClick);

    refocus = () => this.props.treeView.props.focus(this.props.treeView.props.Document);
    ignoreEvent = (e: any) => {
        if (this.props.active(true)) {
            e.stopPropagation();
            e.preventDefault();
        }
    }
    titleStyleProvider = (doc: (Doc | undefined), props: Opt<DocumentViewProps | FieldViewProps>, property: string): any => {
        if (!doc || doc !== this.doc) return this.props?.treeView?.props.styleProvider?.(doc, props, property); // properties are inherited from the CollectionTreeView, not the hierarchical parent in the treeView

        switch (property.split(":")[0]) {
            case StyleProp.Opacity: return this.outlineMode ? undefined : 1;
            case StyleProp.BackgroundColor: return StrCast(doc._backgroundColor, StrCast(doc.backgroundColor));
            case StyleProp.DocContents: return testDocProps(props) && !props?.treeViewDoc ? (null) :
                <div className="treeView-label" style={{    // just render a title for a tree view label (identified by treeViewDoc being set in 'props')
                    maxWidth: props?.PanelWidth() || undefined,
                    background: props?.styleProvider?.(doc, props, StyleProp.BackgroundColor),
                }}>
                    {StrCast(doc?.title)}
                </div>;
            case StyleProp.Decorations: return (null);
        }
    }
    embeddedStyleProvider = (doc: (Doc | undefined), props: Opt<DocumentViewProps | FieldViewProps>, property: string): any => {
        if (property.startsWith(StyleProp.Decorations)) return (null);
        return this.props?.treeView?.props.styleProvider?.(doc, props, property); // properties are inherited from the CollectionTreeView, not the hierarchical parent in the treeView
    }
    onKeyDown = (e: React.KeyboardEvent) => {
        if (this.doc.treeViewHideHeader || this.outlineMode) {
            e.stopPropagation();
            e.preventDefault();
            switch (e.key) {
                case "Tab": setTimeout(() => RichTextMenu.Instance.TextView?.EditorView?.focus(), 150);
                    return UndoManager.RunInBatch(() => e.shiftKey ? this.props.outdentDocument?.() : this.props.indentDocument?.(), "tab");
                case "Backspace": return !(this.doc.text as RichTextField)?.Text && this.props.removeDoc?.(this.doc);
                case "Enter": return UndoManager.RunInBatch(this.makeTextCollection, "bullet");
            }
        }
    }

    /**
     * Renders the EditableView title element for placement into the tree.
     */
    @computed
    get renderTitle() {
        TraceMobx();
        const view = this.showTitleEditorControl ? this.editableView("title") :
            <DocumentView key="title"
                ref={this._docRef}
                Document={this.doc}
                DataDoc={undefined}
                styleProvider={this.titleStyleProvider}
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
                NativeHeight={returnZero}
                NativeWidth={returnZero}
                PanelWidth={this.truncateTitleWidth}
                PanelHeight={() => 18}
                contextMenuItems={this.contextMenuItems}
                renderDepth={1}
                focus={returnTrue}
                parentActive={returnTrue}
                whenActiveChanged={this.props.whenActiveChanged}
                bringToFront={emptyFunction}
                dontRegisterView={BoolCast(this.props.treeView.props.Document.dontRegisterChildViews)}
                docFilters={returnEmptyFilter}
                docRangeFilters={returnEmptyFilter}
                searchFilterDocs={returnEmptyDoclist}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={this.props.treeView.props.Document}
            />;
        return <>
            <div className={`docContainer${Doc.IsSystem(this.props.document) ? "-system" : ""}`} ref={this._tref} title="click to edit title. Double Click or Drag to Open"
                style={{
                    fontWeight: Doc.IsSearchMatch(this.doc) !== undefined ? "bold" : undefined,
                    textDecoration: Doc.GetT(this.doc, "title", "string", true) ? "underline" : undefined,
                    outline: this.doc === CurrentUserUtils.ActiveDashboard ? "dashed 1px #06123232" : undefined,
                    pointerEvents: !this.props.active() && !SnappingManager.GetIsDragging() ? "none" : undefined
                }} >
                {view}
            </div >
            {/* hide and lock buttons */}
            {this.props.styleProvider?.(this.doc, this.props.treeView.props, StyleProp.Decorations)} 
            {this.headerElements}
        </>;
    }

    renderBulletHeader = (contents: JSX.Element) => {
        return <>
            <div className={`treeView-header` + (this._editMaxWidth ? "-editing" : "")} key="titleheader"
                ref={this._header}
                style={{ maxWidth: this._editMaxWidth }}
                onClick={this.ignoreEvent}
                onPointerDown={this.ignoreEvent}
                onPointerEnter={this.onPointerEnter}
                onPointerLeave={this.onPointerLeave}>
                {contents}
            </div>
            {this.renderBorder}
        </>;
    }

    // renders the text version of a document as the header (e.g., useful for Slide views where the "")
    @computed get renderTitleAsHeader() {
        return <>
            {this.renderBullet}
            {this.renderTitle}
        </>;
    }

    renderEmbeddedDocument = (asText: boolean) => {
        const panelWidth = asText || StrCast(Doc.LayoutField(this.layoutDoc)).includes("FormattedTextBox") ? this.rtfWidth : this.expandPanelWidth;
        const panelHeight = asText ? this.rtfOutlineHeight : StrCast(Doc.LayoutField(this.layoutDoc)).includes("FormattedTextBox") ? this.rtfHeight : this.expandPanelHeight;
        return <DocumentView key={this.doc[Id]} ref={action((r: DocumentView | null) => this._dref = r)}
            Document={this.doc}
            DataDoc={undefined}
            PanelWidth={panelWidth}
            PanelHeight={panelHeight}
            NativeWidth={!asText && this.layoutDoc.type === DocumentType.RTF ? this.rtfWidth : undefined}
            NativeHeight={!asText && this.layoutDoc.type === DocumentType.RTF ? this.rtfHeight : undefined}
            fitContentsToDoc={true}
            hideTitle={asText}
            LayoutTemplateString={asText ? FormattedTextBox.LayoutString("text") : undefined}
            focus={asText ? this.refocus : returnFalse}
            dontRegisterView={asText ? undefined : this.props.dontRegisterView}
            ScreenToLocalTransform={this.docTransform}
            renderDepth={this.props.renderDepth + 1}
            rootSelected={returnTrue}
            styleProvider={asText ? this.titleStyleProvider : this.embeddedStyleProvider}
            docFilters={returnEmptyFilter}
            docRangeFilters={returnEmptyFilter}
            searchFilterDocs={returnEmptyDoclist}
            ContainingCollectionDoc={this.props.containingCollection}
            ContainingCollectionView={undefined}
            addDocument={this.props.addDocument}
            moveDocument={this.move}
            removeDocument={this.props.removeDoc}
            parentActive={this.props.active}
            whenActiveChanged={this.props.whenActiveChanged}
            addDocTab={this.props.addDocTab}
            pinToPres={this.props.pinToPres}
            bringToFront={returnFalse}
        />;
    }

    @computed get renderDocumentAsHeader() {
        return <>
            {this.renderBullet}
            {this.renderEmbeddedDocument(true)}
        </>;
    }

    @computed get renderBorder() {
        const sorting = this.doc[`${this.fieldKey}-sortCriteria`];
        return <div className={`treeView-border${this.outlineMode ? "outline" : ""}`}
            style={{ borderColor: sorting === undefined ? undefined : sorting === "ascending" ? "crimson" : sorting === "descending" ? "blue" : "green" }}>
            {!this.treeViewOpen ? (null) : this.renderContent}
        </div>;
    }

    render() {
        TraceMobx();
        if (this.props.renderedIds.indexOf(this.doc[Id]) !== -1) return "<" + this.doc.title + ">";
        if (this.showTitleEditorControl) { // find containing CollectionTreeView and set our maximum width so the containing tree view won't have to scroll
            let par: any = this._header?.current;
            while (par && par.className !== "collectionTreeView-dropTarget") par = par.parentNode;
            if (par) {
                const par_rect = (par as HTMLElement).getBoundingClientRect();
                const my_recct = this._docRef.current?.ContentDiv?.getBoundingClientRect();
                this._editMaxWidth = Math.max(100, par_rect.right - (my_recct?.left || 0));
            }
        }
        else this._editMaxWidth = "";

        const hideTitle = this.doc.treeViewHideHeader || this.outlineMode;
        return <div className={`treeView-container${this._dref?.contentsActive() ? "-active" : ""}`}
            ref={this.createTreeDropTarget}
            onPointerDown={e => this.props.active(true) && SelectionManager.DeselectAll()}
            onKeyDown={this.onKeyDown}>
            <li className="collection-child">
                {hideTitle && this.doc.type !== DocumentType.RTF ?
                    this.renderEmbeddedDocument(false) :
                    this.renderBulletHeader(hideTitle ? this.renderDocumentAsHeader : this.renderTitleAsHeader)}
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
                const a = (criterion === "ascending" ? d2 : d1);
                const b = (criterion === "ascending" ? d1 : d2);
                const first = a[criterion === "zorder" ? "zIndex" : "title"];
                const second = b[criterion === "zorder" ? "zIndex" : "title"];
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
        containingCollection: Doc,
        dataDoc: Doc | undefined,
        key: string,
        parentCollectionDoc: Doc | undefined,
        parentPrevSibling: Doc | undefined,
        add: (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => boolean,
        remove: ((doc: Doc | Doc[]) => boolean),
        move: DragManager.MoveFunction,
        dropAction: dropActionType,
        addDocTab: (doc: Doc, where: string) => boolean,
        pinToPres: (document: Doc) => void,
        styleProvider: undefined | StyleProviderFunc,
        screenToLocalXf: () => Transform,
        outerXf: () => { translateX: number, translateY: number },
        active: (outsideReaction?: boolean) => boolean,
        panelWidth: () => number,
        renderDepth: number,
        treeViewHideHeaderFields: () => boolean,
        treeViewPreventOpen: boolean,
        renderedIds: string[],
        onCheckedClick: undefined | (() => ScriptField),
        onChildClick: undefined | (() => ScriptField),
        skipFields: string[] | undefined,
        firstLevel: boolean,
        whenActiveChanged: (isActive: boolean) => void,
        dontRegisterView: boolean | undefined) {
        const viewSpecScript = Cast(containingCollection.viewSpecScript, ScriptField);
        if (viewSpecScript) {
            childDocs = childDocs.filter(d => viewSpecScript.script.run({ doc: d }, console.log).result);
        }

        const docs = TreeView.sortDocs(childDocs, StrCast(containingCollection?.[key + "-sortCriteria"]));

        const rowWidth = () => panelWidth() - treeBulletWidth();
        return docs.filter(child => child instanceof Doc).map((child, i) => {
            const pair = Doc.GetLayoutDataDocPair(containingCollection, dataDoc, child);
            if (!pair.layout || pair.data instanceof Promise) {
                return (null);
            }

            const indent = i === 0 ? undefined : () => {
                if (remove && StrCast(docs[i - 1].layout).indexOf('fieldKey') !== -1) {
                    const fieldKeysub = StrCast(docs[i - 1].layout).split('fieldKey')[1];
                    const fieldKey = fieldKeysub.split("\'")[1];
                    if (fieldKey && Cast(docs[i - 1][fieldKey], listSpec(Doc)) !== undefined) {
                        remove(child);
                        FormattedTextBox.SelectOnLoad = child[Id];
                        Doc.AddDocToList(docs[i - 1], fieldKey, child);
                        docs[i - 1].treeViewOpen = true;
                        child.context = treeView.Document;
                    }
                }
            };
            const outdent = !parentCollectionDoc ? undefined : () => {
                if (parentCollectionDoc._viewType === CollectionViewType.Tree && remove && StrCast(parentCollectionDoc.layout).indexOf('fieldKey') !== -1) {
                    const fieldKeysub = StrCast(parentCollectionDoc.layout).split('fieldKey')[1];
                    const fieldKey = fieldKeysub.split("\'")[1];
                    remove(child);
                    FormattedTextBox.SelectOnLoad = child[Id];
                    Doc.AddDocToList(parentCollectionDoc, fieldKey, child, parentPrevSibling, false);
                    parentCollectionDoc.treeViewOpen = true;
                    child.context = treeView.Document;
                }
            };
            const addDocument = (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => add(doc, relativeTo ?? docs[i], before !== undefined ? before : false);
            const childLayout = Doc.Layout(pair.layout);
            const rowHeight = () => {
                const aspect = Doc.NativeAspect(childLayout);
                return aspect ? Math.min(childLayout[WidthSym](), rowWidth()) / aspect : childLayout[HeightSym]();
            };
            return <TreeView key={child[Id]}
                document={pair.layout}
                dataDoc={pair.data}
                containingCollection={containingCollection}
                prevSibling={docs[i]}
                treeView={treeView}
                indentDocument={indent}
                outdentDocument={!parentCollectionDoc ? undefined : outdent}
                onCheckedClick={onCheckedClick}
                onChildClick={onChildClick}
                renderDepth={renderDepth}
                removeDoc={StrCast(containingCollection.freezeChildren).includes("remove") ? undefined : remove}
                addDocument={addDocument}
                styleProvider={styleProvider}
                panelWidth={rowWidth}
                panelHeight={rowHeight}
                dontRegisterView={dontRegisterView}
                moveDocument={move}
                dropAction={dropAction}
                addDocTab={addDocTab}
                pinToPres={pinToPres}
                ScreenToLocalTransform={screenToLocalXf}
                outerXf={outerXf}
                parentKey={key}
                active={active}
                treeViewHideHeaderFields={treeViewHideHeaderFields}
                treeViewPreventOpen={treeViewPreventOpen}
                renderedIds={renderedIds}
                skipFields={skipFields}
                firstLevel={firstLevel}
                whenActiveChanged={whenActiveChanged} />;
        });
    }
}