import { library } from '@fortawesome/fontawesome-svg-core';
import { faAngleRight, faArrowsAltH, faBell, faCamera, faCaretDown, faCaretRight, faCaretSquareDown, faCaretSquareRight, faExpand, faMinus, faPlus, faTrash, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, untracked } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, Field, HeightSym, WidthSym, DataSym, Opt } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { Document, listSpec } from '../../../new_fields/Schema';
import { ComputedField, ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from '../../../new_fields/Types';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { emptyFunction, emptyPath, returnFalse, Utils, returnOne, returnZero, returnTransparent, returnTrue } from '../../../Utils';
import { Docs, DocUtils } from '../../documents/Documents';
import { DocumentType } from "../../documents/DocumentTypes";
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager, dropActionType, SetupDrag } from "../../util/DragManager";
import { makeTemplate } from '../../util/DropConverter';
import { Scripting } from '../../util/Scripting';
import { SelectionManager } from '../../util/SelectionManager';
import { Transform } from '../../util/Transform';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { EditableView } from "../EditableView";
import { MainView } from '../MainView';
import { ContentFittingDocumentView } from '../nodes/ContentFittingDocumentView';
import { ImageBox } from '../nodes/ImageBox';
import { KeyValueBox } from '../nodes/KeyValueBox';
import { ScriptBox } from '../ScriptBox';
import { Templates } from '../Templates';
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionTreeView.scss";
import React = require("react");
import { CollectionViewType } from './CollectionView';
import { RichTextField } from '../../../new_fields/RichTextField';
import { DocumentView } from '../nodes/DocumentView';


export interface TreeViewProps {
    document: Doc;
    dataDoc?: Doc;
    libraryPath: Doc[] | undefined;
    containingCollection: Doc;
    prevSibling?: Doc;
    renderDepth: number;
    deleteDoc: (doc: Doc) => boolean;
    moveDocument: DragManager.MoveFunction;
    dropAction: "alias" | "copy" | undefined;
    addDocTab: (doc: Doc, where: string, libraryPath?: Doc[]) => boolean;
    pinToPres: (document: Doc) => void;
    panelWidth: () => number;
    panelHeight: () => number;
    ChromeHeight: undefined | (() => number);
    addDocument: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean;
    indentDocument?: () => void;
    outdentDocument?: () => void;
    ScreenToLocalTransform: () => Transform;
    backgroundColor?: (doc: Doc) => string | undefined;
    outerXf: () => { translateX: number, translateY: number };
    treeViewId: Doc;
    parentKey: string;
    active: (outsideReaction?: boolean) => boolean;
    treeViewHideHeaderFields: () => boolean;
    treeViewPreventOpen: boolean;
    renderedIds: string[];
    onCheckedClick?: ScriptField;
    ignoreFields?: string[];
}

library.add(faTrashAlt);
library.add(faAngleRight);
library.add(faBell);
library.add(faTrash);
library.add(faCamera);
library.add(faExpand);
library.add(faCaretDown);
library.add(faCaretRight);
library.add(faCaretSquareDown);
library.add(faCaretSquareRight);
library.add(faArrowsAltH);
library.add(faPlus, faMinus);
@observer
/**
 * Renders a treeView of a collection of documents
 * 
 * special fields:
 * treeViewOpen : flag denoting whether the documents sub-tree (contents) is visible or hidden
 * treeViewPreventOpen : ignores the treeViewOpen flag (for allowing a view to not be slaved to other views of the document)
 * treeViewExpandedView : name of field whose contents are being displayed as the document's subtree
 */
class TreeView extends React.Component<TreeViewProps> {
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _treedropDisposer?: DragManager.DragDropDisposer;
    private _dref = React.createRef<HTMLDivElement>();
    private _tref = React.createRef<HTMLDivElement>();

    get displayName() { return "TreeView(" + this.props.document.title + ")"; }  // this makes mobx trace() statements more descriptive

    get defaultExpandedView() { return this.childDocs ? this.fieldKey : StrCast(this.props.document.defaultExpandedView, "fields"); }
    @observable _overrideTreeViewOpen = false; // override of the treeViewOpen field allowing the display state to be independent of the document's state
    set treeViewOpen(c: boolean) { if (this.props.treeViewPreventOpen) this._overrideTreeViewOpen = c; else this.props.document.treeViewOpen = this._overrideTreeViewOpen = c; }
    @computed get treeViewOpen() { return (!this.props.treeViewPreventOpen && BoolCast(this.props.document.treeViewOpen)) || this._overrideTreeViewOpen; }
    @computed get treeViewExpandedView() { return StrCast(this.props.document.treeViewExpandedView, this.defaultExpandedView); }
    @computed get MAX_EMBED_HEIGHT() { return NumCast(this.props.document.maxEmbedHeight, 300); }
    @computed get dataDoc() { return this.templateDataDoc ? this.templateDataDoc : this.props.document; }
    @computed get fieldKey() {
        const splits = StrCast(Doc.LayoutField(this.props.document)).split("fieldKey={\'");
        return splits.length > 1 ? splits[1].split("\'")[0] : "data";
    }
    childDocList(field: string) {
        const layout = Doc.LayoutField(this.props.document) instanceof Doc ? Doc.LayoutField(this.props.document) as Doc : undefined;
        return ((this.props.dataDoc ? Cast(this.props.dataDoc[field], listSpec(Doc)) : undefined) ||
            (layout ? Cast(layout[field], listSpec(Doc)) : undefined) ||
            Cast(this.props.document[field], listSpec(Doc))) as Doc[];
    }
    @computed get childDocs() { return this.childDocList(this.fieldKey); }
    @computed get childLinks() { return this.childDocList("links"); }
    @computed get templateDataDoc() {
        if (this.props.dataDoc === undefined && Doc.LayoutField(this.props.document) !== "string") {
            // if there is no dataDoc (ie, we're not rendering a template layout), but this document has a layout document (not a layout string), 
            // then we render the layout document as a template and use this document as the data context for the template layout.
            return this.props.document;
        }
        return this.props.dataDoc;
    }
    @computed get boundsOfCollectionDocument() {
        return StrCast(this.props.document.type).indexOf(DocumentType.COL) === -1 || !DocListCast(this.props.document[this.fieldKey]).length ? undefined :
            Doc.ComputeContentBounds(DocListCast(this.props.document[this.fieldKey]));
    }

    @undoBatch delete = () => this.props.deleteDoc(this.props.document);
    @undoBatch openRight = () => this.props.addDocTab(this.props.dropAction === "alias" ? Doc.MakeAlias(this.props.document) : this.props.document, "onRight", this.props.libraryPath);
    @undoBatch indent = () => this.props.addDocument(this.props.document) && this.delete();
    @undoBatch move = (doc: Doc, target: Doc | undefined, addDoc: (doc: Doc) => boolean) => {
        return this.props.document !== target && this.props.deleteDoc(doc) && addDoc(doc);
    }
    @undoBatch @action remove = (document: Document, key: string) => {
        return Doc.RemoveDocFromList(this.dataDoc, key, document);
    }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this._treedropDisposer && this._treedropDisposer();
        ele && (this._treedropDisposer = DragManager.MakeDropTarget(ele, this.treeDrop.bind(this)));
    }

    onPointerDown = (e: React.PointerEvent) => e.stopPropagation();
    onPointerEnter = (e: React.PointerEvent): void => {
        this.props.active(true) && Doc.BrushDoc(this.dataDoc);
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {
            this._header!.current!.className = "treeViewItem-header";
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        Doc.UnBrushDoc(this.dataDoc);
        this._header!.current!.className = "treeViewItem-header";
        document.removeEventListener("pointermove", this.onDragMove, true);
    }
    onDragMove = (e: PointerEvent): void => {
        Doc.UnBrushDoc(this.dataDoc);
        const pt = [e.clientX, e.clientY];
        const rect = this._header!.current!.getBoundingClientRect();
        const before = pt[1] < rect.top + rect.height / 2;
        const inside = pt[0] > Math.min(rect.left + 75, rect.left + rect.width * .75) || (!before && this.treeViewOpen && DocListCast(this.dataDoc[this.fieldKey]).length);
        this._header!.current!.className = "treeViewItem-header";
        if (inside) this._header!.current!.className += " treeViewItem-header-inside";
        else if (before) this._header!.current!.className += " treeViewItem-header-above";
        else if (!before) this._header!.current!.className += " treeViewItem-header-below";
        e.stopPropagation();
    }

    editableView = (key: string, style?: string) => (<EditableView
        oneLine={true}
        display={"inline-block"}
        editing={true /*this.dataDoc[Id] === EditableView.loadId*/}
        contents={StrCast(this.props.document[key])}
        height={12}
        fontStyle={style}
        fontSize={12}
        GetValue={() => StrCast(this.props.document[key])}
        SetValue={undoBatch((value: string) => {
            Doc.SetInPlace(this.props.document, key, value, false) || true;
            this.props.document.editTitle = undefined;
        })}
        OnFillDown={undoBatch((value: string) => {
            Doc.SetInPlace(this.props.document, key, value, false);
            const doc = Docs.Create.FreeformDocument([], { title: "-", x: 0, y: 0, _width: 100, _height: 25, templates: new List<string>([Templates.Title.Layout]) });
            //EditableView.loadId = doc[Id];
            this.props.document.editTitle = undefined;
            doc.editTitle = true;
            return this.props.addDocument(doc);
        })}
        onClick={() => {
            SelectionManager.DeselectAll();
            Doc.UserDoc().SelectedDocs = new List([this.props.document]);
            return false;
        }}
        OnTab={undoBatch((shift?: boolean) => {
            EditableView.loadId = this.dataDoc[Id];
            shift ? this.props.outdentDocument?.() : this.props.indentDocument?.();
            setTimeout(() => {  // unsetting/setting brushing for this doc will recreate & refocus this editableView after all other treeview changes have been made to the Dom (which may remove focus from this document).
                Doc.UnBrushDoc(this.props.document);
                Doc.BrushDoc(this.props.document);
                EditableView.loadId = "";
            }, 0);
        })}
    />)

    onWorkspaceContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped()) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view
            const sort = this.props.document[`${this.fieldKey}-sortAscending`];
            if (this.props.document === CurrentUserUtils.UserDocument.recentlyClosed) {
                ContextMenu.Instance.addItem({ description: "Clear All", event: () => Doc.GetProto(CurrentUserUtils.UserDocument.recentlyClosed as Doc).data = new List<Doc>(), icon: "plus" });
            } else if (this.props.document !== CurrentUserUtils.UserDocument.workspaces) {
                ContextMenu.Instance.addItem({ description: "Pin to Presentation", event: () => this.props.pinToPres(this.props.document), icon: "tv" });
                ContextMenu.Instance.addItem({ description: "Open Tab", event: () => this.props.addDocTab(this.props.document, "inTab", this.props.libraryPath), icon: "folder" });
                ContextMenu.Instance.addItem({ description: "Open Right", event: () => this.props.addDocTab(this.props.document, "onRight", this.props.libraryPath), icon: "caret-square-right" });
                if (DocumentManager.Instance.getDocumentViews(this.dataDoc).length) {
                    ContextMenu.Instance.addItem({ description: "Focus", event: () => (view => view && view.props.focus(this.props.document, true))(DocumentManager.Instance.getFirstDocumentView(this.props.document)), icon: "camera" });
                }
                ContextMenu.Instance.addItem({ description: "Delete Item", event: () => this.props.deleteDoc(this.props.document), icon: "trash-alt" });
            } else {
                ContextMenu.Instance.addItem({ description: "Delete Workspace", event: () => this.props.deleteDoc(this.props.document), icon: "trash-alt" });
                ContextMenu.Instance.addItem({ description: "Create New Workspace", event: () => MainView.Instance.createNewWorkspace(), icon: "plus" });
            }
            ContextMenu.Instance.addItem({ description: (sort ? "Sort Descending" : (sort === false ? "Unsort" : "Sort Ascending")), event: () => this.props.document[`${this.fieldKey}-sortAscending`] = (sort ? false : (sort === false ? undefined : true)), icon: "minus" });
            ContextMenu.Instance.addItem({ description: "Toggle Theme Colors", event: () => this.props.document.darkScheme = !this.props.document.darkScheme, icon: "minus" });
            ContextMenu.Instance.addItem({ description: "Open Fields", event: () => { const kvp = Docs.Create.KVPDocument(this.props.document, { _width: 300, _height: 300 }); this.props.addDocTab(kvp, "onRight"); }, icon: "layer-group" });
            ContextMenu.Instance.addItem({ description: "Publish", event: () => DocUtils.Publish(this.props.document, StrCast(this.props.document.title), () => { }, () => { }), icon: "file" });
            ContextMenu.Instance.displayMenu(e.pageX > 156 ? e.pageX - 156 : 0, e.pageY - 15);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @undoBatch
    treeDrop = (e: Event, de: DragManager.DropEvent) => {
        const pt = [de.x, de.y];
        const rect = this._header!.current!.getBoundingClientRect();
        const before = pt[1] < rect.top + rect.height / 2;
        const inside = pt[0] > Math.min(rect.left + 75, rect.left + rect.width * .75) || (!before && this.treeViewOpen && DocListCast(this.dataDoc[this.fieldKey]).length);
        if (de.complete.linkDragData) {
            const sourceDoc = de.complete.linkDragData.linkSourceDocument;
            const destDoc = this.props.document;
            DocUtils.MakeLink({ doc: sourceDoc }, { doc: destDoc }, "tree link");
            e.stopPropagation();
        }
        if (de.complete.docDragData) {
            e.stopPropagation();
            if (de.complete.docDragData.draggedDocuments[0] === this.props.document) return true;
            let addDoc = (doc: Doc) => this.props.addDocument(doc, undefined, before);
            if (inside) {
                addDoc = (doc: Doc) => Doc.AddDocToList(this.dataDoc, this.fieldKey, doc) || addDoc(doc);
            }
            const movedDocs = (de.complete.docDragData.treeViewId === this.props.treeViewId[Id] ? de.complete.docDragData.draggedDocuments : de.complete.docDragData.droppedDocuments);
            return ((de.complete.docDragData.dropAction && (de.complete.docDragData.treeViewId !== this.props.treeViewId[Id])) || de.complete.docDragData.userDropAction) ?
                de.complete.docDragData.droppedDocuments.reduce((added, d) => addDoc(d) || added, false)
                : de.complete.docDragData.moveDocument ?
                    movedDocs.reduce((added, d) => de.complete.docDragData?.moveDocument?.(d, undefined, addDoc) || added, false)
                    : de.complete.docDragData.droppedDocuments.reduce((added, d) => addDoc(d), false);
        }
        return false;
    }

    docTransform = () => {
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._dref.current!);
        const outerXf = this.props.outerXf();
        const offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        const finalXf = this.props.ScreenToLocalTransform().translate(offset[0], offset[1] + (this.props.ChromeHeight && this.props.ChromeHeight() < 0 ? this.props.ChromeHeight() : 0));
        return finalXf;
    }
    getTransform = () => {
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._tref.current!);
        const outerXf = this.props.outerXf();
        const offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        const finalXf = this.props.ScreenToLocalTransform().translate(offset[0], offset[1]);
        return finalXf;
    }
    docWidth = () => {
        const layoutDoc = Doc.Layout(this.props.document);
        const aspect = NumCast(layoutDoc._nativeHeight) / NumCast(layoutDoc._nativeWidth);
        if (aspect) return Math.min(layoutDoc[WidthSym](), Math.min(this.MAX_EMBED_HEIGHT / aspect, this.props.panelWidth() - 20));
        return NumCast(layoutDoc._nativeWidth) ? Math.min(layoutDoc[WidthSym](), this.props.panelWidth() - 20) : this.props.panelWidth() - 20;
    }
    docHeight = () => {
        const layoutDoc = Doc.Layout(this.props.document);
        const bounds = this.boundsOfCollectionDocument;
        return Math.min(this.MAX_EMBED_HEIGHT, (() => {
            const aspect = NumCast(layoutDoc._nativeHeight) / NumCast(layoutDoc._nativeWidth, 1);
            if (aspect) return this.docWidth() * aspect;
            if (bounds) return this.docWidth() * (bounds.b - bounds.y) / (bounds.r - bounds.x);
            return layoutDoc._fitWidth ? (!this.props.document.nativeHeight ? NumCast(this.props.containingCollection._height) :
                Math.min(this.docWidth() * NumCast(layoutDoc.scrollHeight, NumCast(layoutDoc._nativeHeight)) / NumCast(layoutDoc._nativeWidth,
                    NumCast(this.props.containingCollection._height)))) :
                NumCast(layoutDoc._height) ? NumCast(layoutDoc._height) : 50;
        })());
    }

    @computed get expandedField() {
        const ids: { [key: string]: string } = {};
        const doc = this.props.document;
        doc && Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key));

        const rows: JSX.Element[] = [];
        for (const key of Object.keys(ids).slice().sort()) {
            if (this.props.ignoreFields?.includes(key)) continue;
            const contents = doc[key];
            let contentElement: (JSX.Element | null)[] | JSX.Element = [];

            if (contents instanceof Doc || (Cast(contents, listSpec(Doc)) && (Cast(contents, listSpec(Doc))!.length && Cast(contents, listSpec(Doc))![0] instanceof Doc))) {
                const remDoc = (doc: Doc) => this.remove(doc, key);
                const addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => Doc.AddDocToList(this.dataDoc, key, doc, addBefore, before, false, true);
                contentElement = TreeView.GetChildElements(contents instanceof Doc ? [contents] :
                    DocListCast(contents), this.props.treeViewId, doc, undefined, key, this.props.containingCollection, this.props.prevSibling, addDoc, remDoc, this.move,
                    this.props.dropAction, this.props.addDocTab, this.props.pinToPres, this.props.backgroundColor, this.props.ScreenToLocalTransform, this.props.outerXf, this.props.active,
                    this.props.panelWidth, this.props.ChromeHeight, this.props.renderDepth, this.props.treeViewHideHeaderFields, this.props.treeViewPreventOpen,
                    [...this.props.renderedIds, doc[Id]], this.props.libraryPath, this.props.onCheckedClick, this.props.ignoreFields);
            } else {
                contentElement = <EditableView
                    key="editableView"
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
                GetValue={() => ""}
                SetValue={(value: string) => {
                    value.indexOf(":") !== -1 && KeyValueBox.SetField(doc, value.substring(0, value.indexOf(":")), value.substring(value.indexOf(":") + 1, value.length), true);
                    return true;
                }} />
        </div>);
        return rows;
    }

    @computed get renderContent() {
        const expandKey = this.treeViewExpandedView === this.fieldKey ? this.fieldKey : this.treeViewExpandedView === "links" ? "links" : undefined;
        if (expandKey !== undefined) {
            const remDoc = (doc: Doc) => this.remove(doc, expandKey);
            const addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => Doc.AddDocToList(this.dataDoc, expandKey, doc, addBefore, before, false, true);
            const docs = expandKey === "links" ? this.childLinks : this.childDocs;
            return <ul key={expandKey + "more"}>
                {!docs ? (null) :
                    TreeView.GetChildElements(docs, this.props.treeViewId, Doc.Layout(this.props.document),
                        this.templateDataDoc, expandKey, this.props.containingCollection, this.props.prevSibling, addDoc, remDoc, this.move,
                        this.props.dropAction, this.props.addDocTab, this.props.pinToPres, this.props.backgroundColor, this.props.ScreenToLocalTransform,
                        this.props.outerXf, this.props.active, this.props.panelWidth, this.props.ChromeHeight, this.props.renderDepth, this.props.treeViewHideHeaderFields, this.props.treeViewPreventOpen,
                        [...this.props.renderedIds, this.props.document[Id]], this.props.libraryPath, this.props.onCheckedClick, this.props.ignoreFields)}
            </ul >;
        } else if (this.treeViewExpandedView === "fields") {
            return <ul><div ref={this._dref} style={{ display: "inline-block" }} key={this.props.document[Id] + this.props.document.title}>
                {this.expandedField}
            </div></ul>;
        } else {
            const layoutDoc = Doc.Layout(this.props.document);
            return <div ref={this._dref} style={{ display: "inline-block", height: this.docHeight() }} key={this.props.document[Id] + this.props.document.title}>
                <ContentFittingDocumentView
                    Document={layoutDoc}
                    DataDocument={this.templateDataDoc}
                    LibraryPath={emptyPath}
                    renderDepth={this.props.renderDepth + 1}
                    backgroundColor={this.props.backgroundColor}
                    fitToBox={this.boundsOfCollectionDocument !== undefined}
                    PanelWidth={this.docWidth}
                    PanelHeight={this.docHeight}
                    getTransform={this.docTransform}
                    CollectionDoc={this.props.containingCollection}
                    CollectionView={undefined}
                    addDocument={returnFalse}
                    moveDocument={this.props.moveDocument}
                    removeDocument={returnFalse}
                    active={this.props.active}
                    whenActiveChanged={emptyFunction}
                    addDocTab={this.props.addDocTab}
                    pinToPres={this.props.pinToPres} />
            </div>;
        }
    }

    @action
    bulletClick = (e: React.MouseEvent) => {
        if (this.props.onCheckedClick && this.props.document.type !== DocumentType.COL) {
            // this.props.document.treeViewChecked = this.props.document.treeViewChecked === "check" ? "x" : this.props.document.treeViewChecked === "x" ? undefined : "check";
            ScriptCast(this.props.onCheckedClick).script.run({
                this: this.props.document.isTemplateForField && this.props.dataDoc ? this.props.dataDoc : this.props.document,
                heading: this.props.containingCollection.title,
                checked: this.props.document.treeViewChecked === "check" ? "x" : this.props.document.treeViewChecked === "x" ? undefined : "check",
                containingTreeView: this.props.treeViewId,
            }, console.log);
        } else {
            this.treeViewOpen = !this.treeViewOpen;
        }
        e.stopPropagation();
    }

    @computed
    get renderBullet() {
        const checked = this.props.document.type === DocumentType.COL ? undefined : this.props.onCheckedClick ? (this.props.document.treeViewChecked ? this.props.document.treeViewChecked : "unchecked") : undefined;
        return <div className="bullet" title="view inline" onClick={this.bulletClick} style={{ color: StrCast(this.props.document.color, checked === "unchecked" ? "white" : "inherit"), opacity: 0.4 }}>
            {<FontAwesomeIcon icon={checked === "check" ? "check" : (checked === "x" ? "times" : checked === "unchecked" ? "square" : !this.treeViewOpen ? (this.childDocs ? "caret-square-right" : "caret-right") : (this.childDocs ? "caret-square-down" : "caret-down"))} />}
        </div>;
    }
    /**
     * Renders the EditableView title element for placement into the tree.
     */
    @computed
    get renderTitle() {
        const onItemDown = SetupDrag(this._tref, () => this.dataDoc, this.move, this.props.dropAction, this.props.treeViewId[Id], true);
        const editTitle = ScriptField.MakeFunction("this.editTitle=true", { this: Doc.name });

        const headerElements = (
            <span className="collectionTreeView-keyHeader" key={this.treeViewExpandedView}
                onPointerDown={action(() => {
                    if (this.treeViewOpen) {
                        this.props.document.treeViewExpandedView = this.treeViewExpandedView === this.fieldKey ? "fields" :
                            this.treeViewExpandedView === "fields" && Doc.Layout(this.props.document) ? "layout" :
                                this.treeViewExpandedView === "layout" && this.props.document.links ? "links" :
                                    this.childDocs ? this.fieldKey : "fields";
                    }
                    this.treeViewOpen = true;
                })}>
                {this.treeViewExpandedView}
            </span>);
        const openRight = (<div className="treeViewItem-openRight" onPointerDown={this.onPointerDown} onClick={this.openRight}>
            <FontAwesomeIcon title="open in pane on right" icon="angle-right" size="lg" />
        </div>);
        return <>
            <div className="docContainer" ref={this._tref} title="click to edit title" id={`docContainer-${this.props.parentKey}`} onPointerDown={onItemDown}
                style={{
                    background: Doc.IsHighlighted(this.props.document) ? "orange" : Doc.IsBrushed(this.props.document) ? "#06121212" : "0",
                    fontWeight: this.props.document.searchMatch ? "bold" : undefined,
                    outline: BoolCast(this.props.document.workspaceBrush) ? "dashed 1px #06123232" : undefined,
                    pointerEvents: this.props.active() || SelectionManager.GetIsDragging() ? "all" : "none"
                }} >
                {this.props.document.editTitle ?
                    this.editableView("title") :
                    <DocumentView
                        Document={this.props.document}
                        DataDoc={undefined}
                        LibraryPath={this.props.libraryPath || []}
                        addDocument={undefined}
                        addDocTab={this.props.addDocTab}
                        pinToPres={emptyFunction}
                        onClick={editTitle}
                        dropAction={this.props.dropAction}
                        moveDocument={this.props.moveDocument}
                        removeDocument={undefined}
                        ScreenToLocalTransform={this.getTransform}
                        ContentScaling={returnOne}
                        PanelWidth={returnZero}
                        PanelHeight={returnZero}
                        renderDepth={1}
                        focus={emptyFunction}
                        parentActive={returnTrue}
                        whenActiveChanged={emptyFunction}
                        bringToFront={emptyFunction}
                        dontRegisterView={BoolCast(this.props.treeViewId.dontRegisterChildren)}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
                        zoomToScale={emptyFunction}
                        getScale={returnOne}
                    />}
            </div >
            {this.props.treeViewHideHeaderFields() ? (null) : headerElements}
            {openRight}
        </>;
    }

    render() {
        setTimeout(() => runInAction(() => untracked(() => this._overrideTreeViewOpen = this.treeViewOpen)), 0);
        return <div className="treeViewItem-container" ref={this.createTreeDropTarget} onContextMenu={this.onWorkspaceContextMenu}>
            <li className="collection-child">
                <div className="treeViewItem-header" ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    {this.renderBullet}
                    {this.renderTitle}
                </div>
                <div className="treeViewItem-border">
                    {!this.treeViewOpen || this.props.renderedIds.indexOf(this.props.document[Id]) !== -1 ? (null) : this.renderContent}
                </div>
            </li>
        </div>;
    }
    public static GetChildElements(
        childDocs: Doc[],
        treeViewId: Doc,
        containingCollection: Doc,
        dataDoc: Doc | undefined,
        key: string,
        parentCollectionDoc: Doc | undefined,
        parentPrevSibling: Doc | undefined,
        add: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean,
        remove: ((doc: Doc) => boolean),
        move: DragManager.MoveFunction,
        dropAction: dropActionType,
        addDocTab: (doc: Doc, where: string) => boolean,
        pinToPres: (document: Doc) => void,
        backgroundColor: undefined | ((document: Doc) => string | undefined),
        screenToLocalXf: () => Transform,
        outerXf: () => { translateX: number, translateY: number },
        active: (outsideReaction?: boolean) => boolean,
        panelWidth: () => number,
        ChromeHeight: undefined | (() => number),
        renderDepth: number,
        treeViewHideHeaderFields: () => boolean,
        treeViewPreventOpen: boolean,
        renderedIds: string[],
        libraryPath: Doc[] | undefined,
        onCheckedClick: ScriptField | undefined,
        ignoreFields: string[] | undefined
    ) {
        const viewSpecScript = Cast(containingCollection.viewSpecScript, ScriptField);
        if (viewSpecScript) {
            childDocs = childDocs.filter(d => viewSpecScript.script.run({ doc: d }, console.log).result);
        }

        const docs = childDocs.slice();
        const ascending = containingCollection?.[key + "-sortAscending"];
        if (ascending !== undefined) {
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
            docs.sort(function (a, b): 0 | 1 | -1 {
                const descA = ascending ? b : a;
                const descB = ascending ? a : b;
                const first = descA.title;
                const second = descB.title;
                // TODO find better way to sort how to sort..................
                if (typeof first === 'number' && typeof second === 'number') {
                    return (first - second) > 0 ? 1 : -1;
                }
                if (typeof first === 'string' && typeof second === 'string') {
                    return sortAlphaNum(first, second);
                }
                if (typeof first === 'boolean' && typeof second === 'boolean') {
                    // if (first === second) { // bugfixing?: otherwise, the list "flickers" because the list is resorted during every load
                    //     return Number(descA.x) > Number(descB.x) ? 1 : -1;
                    // }
                    return first > second ? 1 : -1;
                }
                return ascending ? 1 : -1;
            });
        }

        const rowWidth = () => panelWidth() - 20;
        return docs.map((child, i) => {
            const pair = Doc.GetLayoutDataDocPair(containingCollection, dataDoc, child);
            if (!pair.layout || pair.data instanceof Promise) {
                return (null);
            }

            const indent = i === 0 ? undefined : () => {
                if (StrCast(docs[i - 1].layout).indexOf('fieldKey') !== -1) {
                    const fieldKeysub = StrCast(docs[i - 1].layout).split('fieldKey')[1];
                    const fieldKey = fieldKeysub.split("\'")[1];
                    if (fieldKey && Cast(docs[i - 1][fieldKey], listSpec(Doc)) !== undefined) {
                        Doc.AddDocToList(docs[i - 1], fieldKey, child);
                        docs[i - 1].treeViewOpen = true;
                        remove(child);
                    }
                }
            };
            const outdent = !parentCollectionDoc ? undefined : () => {
                if (StrCast(parentCollectionDoc.layout).indexOf('fieldKey') !== -1) {
                    const fieldKeysub = StrCast(parentCollectionDoc.layout).split('fieldKey')[1];
                    const fieldKey = fieldKeysub.split("\'")[1];
                    Doc.AddDocToList(parentCollectionDoc, fieldKey, child, parentPrevSibling, false);
                    parentCollectionDoc.treeViewOpen = true;
                    remove(child);
                }
            };
            const addDocument = (doc: Doc, relativeTo?: Doc, before?: boolean) => {
                return add(doc, relativeTo ? relativeTo : docs[i], before !== undefined ? before : false);
            };
            const childLayout = Doc.Layout(pair.layout);
            const rowHeight = () => {
                const aspect = NumCast(childLayout._nativeWidth, 0) / NumCast(childLayout._nativeHeight, 0);
                return aspect ? Math.min(childLayout[WidthSym](), rowWidth()) / aspect : childLayout[HeightSym]();
            };
            return !(child instanceof Doc) ? (null) : <TreeView
                document={pair.layout}
                dataDoc={pair.data}
                libraryPath={libraryPath ? [...libraryPath, containingCollection] : undefined}
                containingCollection={containingCollection}
                prevSibling={docs[i]}
                treeViewId={treeViewId}
                key={child[Id]}
                indentDocument={indent}
                outdentDocument={outdent}
                onCheckedClick={onCheckedClick}
                renderDepth={renderDepth}
                deleteDoc={remove}
                addDocument={addDocument}
                backgroundColor={backgroundColor}
                panelWidth={rowWidth}
                panelHeight={rowHeight}
                ChromeHeight={ChromeHeight}
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
                ignoreFields={ignoreFields} />;
        });
    }
}

@observer
export class CollectionTreeView extends CollectionSubView(Document) {
    private treedropDisposer?: DragManager.DragDropDisposer;
    private _mainEle?: HTMLDivElement;

    @computed get dataDoc() { return this.props.DataDoc || this.props.Document; }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this.treedropDisposer && this.treedropDisposer();
        if (this._mainEle = ele) {
            this.treedropDisposer = DragManager.MakeDropTarget(ele, this.onInternalDrop.bind(this));
        }
    }

    componentWillUnmount() {
        super.componentWillUnmount();
        this.treedropDisposer && this.treedropDisposer();
    }

    @action
    remove = (document: Document): boolean => {
        const children = Cast(this.props.Document[DataSym][this.props.fieldKey], listSpec(Doc), []);
        if (children.indexOf(document) !== -1) {
            children.splice(children.indexOf(document), 1);
            return true;
        }
        return false;
    }
    @action
    addDoc = (doc: Document, relativeTo: Opt<Doc>, before?: boolean): boolean => {
        const doAddDoc = () =>
            Doc.AddDocToList(this.props.Document[DataSym], this.props.fieldKey, doc, relativeTo, before, false, false, false);
        if (this.props.Document.resolvedDataDoc instanceof Promise) {
            this.props.Document.resolvedDataDoc.then(resolved => doAddDoc());
        } else {
            doAddDoc();
        }
        return true;
    }
    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!e.isPropagationStopped() && this.props.Document === CurrentUserUtils.UserDocument.workspaces) {
            ContextMenu.Instance.addItem({ description: "Create Workspace", event: () => MainView.Instance.createNewWorkspace(), icon: "plus" });
            ContextMenu.Instance.addItem({ description: "Delete Workspace", event: () => this.remove(this.props.Document), icon: "minus" });
            e.stopPropagation();
            e.preventDefault();
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
        } else if (!e.isPropagationStopped() && this.props.Document === CurrentUserUtils.UserDocument.recentlyClosed) {
            ContextMenu.Instance.addItem({ description: "Clear All", event: () => CurrentUserUtils.UserDocument.recentlyClosed = new List<Doc>(), icon: "plus" });
            e.stopPropagation();
            e.preventDefault();
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
        } else {
            const layoutItems: ContextMenuProps[] = [];
            layoutItems.push({ description: (this.props.Document.treeViewPreventOpen ? "Persist" : "Abandon") + "Treeview State", event: () => this.props.Document.treeViewPreventOpen = !this.props.Document.treeViewPreventOpen, icon: "paint-brush" });
            layoutItems.push({ description: (this.props.Document.treeViewHideHeaderFields ? "Show" : "Hide") + " Header Fields", event: () => this.props.Document.treeViewHideHeaderFields = !this.props.Document.treeViewHideHeaderFields, icon: "paint-brush" });
            layoutItems.push({ description: (this.props.Document.treeViewHideTitle ? "Show" : "Hide") + " Title", event: () => this.props.Document.treeViewHideTitle = !this.props.Document.treeViewHideTitle, icon: "paint-brush" });
            ContextMenu.Instance.addItem({ description: "Treeview Options ...", subitems: layoutItems, icon: "eye" });
        }
        ContextMenu.Instance.addItem({
            description: "Buxton Layout", icon: "eye", event: () => {
                DocListCast(this.dataDoc[this.props.fieldKey]).map(d => {
                    DocListCast(d.data).map((img, i) => {
                        const caption = (d.captions as any)[i];
                        if (caption) {
                            Doc.GetProto(img).caption = caption;
                        }
                    });
                });
                const { TextDocument, ImageDocument, CarouselDocument, TreeDocument } = Docs.Create;
                const { Document } = this.props;
                const fallbackImg = "http://www.cs.brown.edu/~bcz/face.gif";
                const detailedTemplate = `{ "doc": { "type": "doc", "content": [  { "type": "paragraph", "content": [ { "type": "dashField", "attrs": { "fieldKey": "year" } } ] },  { "type": "paragraph", "content": [ { "type": "dashField", "attrs": { "fieldKey": "company" } } ] }  ] }, "selection":{"type":"text","anchor":1,"head":1},"storedMarks":[] }`;

                const textDoc = TextDocument("", { title: "details", _autoHeight: true });
                const detailView = Docs.Create.StackingDocument([
                    CarouselDocument([], { title: "data", _height: 350, _itemIndex: 0, backgroundColor: "#9b9b9b3F" }),
                    textDoc,
                    TextDocument("", { title: "shortDescription", _autoHeight: true }),
                    TreeDocument([], { title: "narratives", _height: 75, treeViewHideTitle: true })
                ], { _chromeStatus: "disabled", _width: 300, _height: 300, _autoHeight: true, title: "detailView" });
                textDoc.data = new RichTextField(detailedTemplate, "year company");
                detailView.isTemplateDoc = makeTemplate(detailView);

                const heroView = ImageDocument(fallbackImg, { title: "heroView", isTemplateDoc: true, isTemplateForField: "hero", }); // this acts like a template doc and a template field ... a little weird, but seems to work?
                heroView.proto!.layout = ImageBox.LayoutString("hero");
                heroView._showTitle = "title";
                heroView._showTitleHover = "titlehover";

                Doc.AddDocToList(CurrentUserUtils.UserDocument.expandingButtons as Doc, "data",
                    Docs.Create.FontIconDocument({
                        _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100, dropAction: "alias", onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                        dragFactory: heroView, removeDropProperties: new List<string>(["dropAction"]), title: "hero view", icon: "portrait"
                    }));

                Doc.AddDocToList(CurrentUserUtils.UserDocument.expandingButtons as Doc, "data",
                    Docs.Create.FontIconDocument({
                        _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100, dropAction: "alias", onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                        dragFactory: detailView, removeDropProperties: new List<string>(["dropAction"]), title: "detail view", icon: "file-alt"
                    }));

                Document.childLayout = heroView;
                Document.childDetailed = detailView;
                Document._viewType = CollectionViewType.Time;
                Document._forceActive = true;
                Document._pivotField = "company";
                Document.childDropAction = "alias";
            }
        });
        const existingOnClick = ContextMenu.Instance.findByDescription("OnClick...");
        const onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
        onClicks.push({
            description: "Edit onChecked Script", icon: "edit", event: (obj: any) => ScriptBox.EditButtonScript("On Checked Changed ...", this.props.Document,
                "onCheckedClick", obj.x, obj.y, { heading: "boolean", checked: "boolean", treeViewContainer: Doc.name })
        });
        !existingOnClick && ContextMenu.Instance.addItem({ description: "OnClick...", subitems: onClicks, icon: "hand-point-right" });
    }
    outerXf = () => Utils.GetScreenTransform(this._mainEle!);
    onTreeDrop = (e: React.DragEvent) => this.onExternalDrop(e, {});

    @computed get renderClearButton() {
        return <div id="toolbar" key="toolbar">
            <button className="toolbar-button round-button" title="Empty"
                onClick={undoBatch(action(() => Doc.GetProto(this.props.Document)[this.props.fieldKey] = undefined))}>
                <FontAwesomeIcon icon={faTrash} size="sm" />
            </button>
        </div >;
    }

    render() {
        const dropAction = StrCast(this.props.Document.childDropAction) as dropActionType;
        const addDoc = (doc: Doc, relativeTo?: Doc, before?: boolean) => this.addDoc(doc, relativeTo, before);
        const moveDoc = (d: Doc, target: Doc | undefined, addDoc: (doc: Doc) => boolean) => this.props.moveDocument(d, target, addDoc);
        const childDocs = this.props.overrideDocuments ? this.props.overrideDocuments : this.childDocs;
        return !childDocs ? (null) : (
            <div className="collectionTreeView-dropTarget" id="body"
                style={{ background: this.props.backgroundColor?.(this.props.Document), paddingTop: `${NumCast(this.props.Document._yMargin, 20)}px` }}
                onContextMenu={this.onContextMenu}
                onWheel={(e: React.WheelEvent) => this._mainEle && this._mainEle.scrollHeight > this._mainEle.clientHeight && e.stopPropagation()}
                onDrop={this.onTreeDrop}
                ref={this.createTreeDropTarget}>
                {(this.props.Document.treeViewHideTitle ? (null) : <EditableView
                    contents={this.dataDoc.title}
                    editing={false}
                    display={"block"}
                    maxHeight={72}
                    height={"auto"}
                    GetValue={() => StrCast(this.dataDoc.title)}
                    SetValue={undoBatch((value: string) => Doc.SetInPlace(this.dataDoc, "title", value, false) || true)}
                    OnFillDown={undoBatch((value: string) => {
                        Doc.SetInPlace(this.dataDoc, "title", value, false);
                        const doc = Docs.Create.FreeformDocument([], { title: "", x: 0, y: 0, _width: 100, _height: 25, templates: new List<string>([Templates.Title.Layout]) });
                        EditableView.loadId = doc[Id];
                        this.addDoc(doc, childDocs.length ? childDocs[0] : undefined, true);
                    })} />)}
                {this.props.Document.allowClear ? this.renderClearButton : (null)}
                <ul className="no-indent" style={{ width: "max-content" }} >
                    {
                        TreeView.GetChildElements(childDocs, this.props.Document, this.props.Document, this.props.DataDoc, this.props.fieldKey, this.props.ContainingCollectionDoc, undefined, addDoc, this.remove,
                            moveDoc, dropAction, this.props.addDocTab, this.props.pinToPres, this.props.backgroundColor, this.props.ScreenToLocalTransform,
                            this.outerXf, this.props.active, this.props.PanelWidth, this.props.ChromeHeight, this.props.renderDepth, () => BoolCast(this.props.Document.treeViewHideHeaderFields),
                            BoolCast(this.props.Document.treeViewPreventOpen), [], this.props.LibraryPath, ScriptCast(this.props.Document.onCheckedClick), this.props.ignoreFields)
                    }
                </ul>
            </div >
        );
    }
}

Scripting.addGlobal(function readFacetData(layoutDoc: Doc, dataDoc: Doc, dataKey: string, facetHeader: string) {
    const allCollectionDocs = DocListCast(dataDoc[dataKey]);
    const facetValues = Array.from(allCollectionDocs.reduce((set, child) =>
        set.add(Field.toString(child[facetHeader] as Field)), new Set<string>()));

    let nonNumbers = 0;
    facetValues.map(val => {
        const num = Number(val);
        if (Number.isNaN(num)) {
            nonNumbers++;
        }
    });
    const facetValueDocSet = (nonNumbers / facetValues.length > .1 ? facetValues.sort() : facetValues.sort((n1: string, n2: string) => Number(n1) - Number(n2))).map(facetValue =>
        Docs.Create.TextDocument("", {
            title: facetValue.toString(),
            treeViewChecked: ComputedField.MakeFunction("determineCheckedState(layoutDoc, facetHeader, facetValue)",
                { layoutDoc: Doc.name, facetHeader: "string", facetValue: "string" },
                { layoutDoc, facetHeader, facetValue })
        }));
    return new List<Doc>(facetValueDocSet);
});

Scripting.addGlobal(function determineCheckedState(layoutDoc: Doc, facetHeader: string, facetValue: string) {
    const docFilters = Cast(layoutDoc._docFilters, listSpec("string"), []);
    for (let i = 0; i < docFilters.length; i += 3) {
        const [header, value, state] = docFilters.slice(i, i + 3);
        if (header === facetHeader && value === facetValue) {
            return state;
        }
    }
    return undefined;
});