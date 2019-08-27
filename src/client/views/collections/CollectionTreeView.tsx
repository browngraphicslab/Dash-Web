import { library } from '@fortawesome/fontawesome-svg-core';
import { faAngleRight, faCamera, faExpand, faTrash, faBell, faCaretDown, faCaretRight, faArrowsAltH, faCaretSquareDown, faCaretSquareRight, faTrashAlt, faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, trace, untracked } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, WidthSym, Opt, Field } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { Document, listSpec } from '../../../new_fields/Schema';
import { BoolCast, Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { emptyFunction, Utils } from '../../../Utils';
import { Docs, DocUtils } from '../../documents/Documents';
import { DocumentType } from "../../documents/DocumentTypes";
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager, dropActionType, SetupDrag } from "../../util/DragManager";
import { SelectionManager } from '../../util/SelectionManager';
import { Transform } from '../../util/Transform';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from '../ContextMenu';
import { EditableView } from "../EditableView";
import { MainView } from '../MainView';
import { Templates } from '../Templates';
import { CollectionViewType } from './CollectionBaseView';
import { CollectionDockingView } from './CollectionDockingView';
import { CollectionSchemaPreview } from './CollectionSchemaView';
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionTreeView.scss";
import React = require("react");
import { ComputedField, ScriptField } from '../../../new_fields/ScriptField';
import { KeyValueBox } from '../nodes/KeyValueBox';
import { ContextMenuProps } from '../ContextMenuItem';


export interface TreeViewProps {
    document: Doc;
    dataDoc?: Doc;
    containingCollection: Doc;
    renderDepth: number;
    deleteDoc: (doc: Doc) => boolean;
    moveDocument: DragManager.MoveFunction;
    dropAction: "alias" | "copy" | undefined;
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => void;
    pinToPres: (document: Doc) => void;
    panelWidth: () => number;
    panelHeight: () => number;
    addDocument: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean;
    indentDocument?: () => void;
    ScreenToLocalTransform: () => Transform;
    outerXf: () => { translateX: number, translateY: number };
    treeViewId: string;
    parentKey: string;
    active: () => boolean;
    showHeaderFields: () => boolean;
    preventTreeViewOpen: boolean;
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
 * preventTreeViewOpen : ignores the treeViewOpen flag (for allowing a view to not be slaved to other views of the document)
 * treeViewExpandedView : name of field whose contents are being displayed as the document's subtree
 */
class TreeView extends React.Component<TreeViewProps> {
    static loadId = "";
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _treedropDisposer?: DragManager.DragDropDisposer;
    private _dref = React.createRef<HTMLDivElement>();
    get defaultExpandedView() { return this.childDocs ? this.fieldKey : "fields"; }
    @observable _overrideTreeViewOpen = false; // override of the treeViewOpen field allowing the display state to be independent of the document's state
    @computed get treeViewOpen() { return (BoolCast(this.props.document.treeViewOpen) && !this.props.preventTreeViewOpen) || this._overrideTreeViewOpen; }
    set treeViewOpen(c: boolean) { if (this.props.preventTreeViewOpen) this._overrideTreeViewOpen = c; else this.props.document.treeViewOpen = c; }
    @computed get treeViewExpandedView() { return StrCast(this.props.document.treeViewExpandedView, this.defaultExpandedView); }
    @computed get MAX_EMBED_HEIGHT() { return NumCast(this.props.document.maxEmbedHeight, 300); }
    @computed get dataDoc() { return this.resolvedDataDoc ? this.resolvedDataDoc : this.props.document; }
    @computed get fieldKey() {
        let splits = StrCast(this.props.document.layout).split("fieldKey={\"");
        return splits.length > 1 ? splits[1].split("\"")[0] : "data";
    }
    @computed get childDocs() {
        let layout = this.props.document.layout instanceof Doc ? this.props.document.layout : undefined;
        return (this.props.dataDoc ? Cast(this.props.dataDoc[this.fieldKey], listSpec(Doc)) : undefined) ||
            (layout ? Cast(layout[this.fieldKey], listSpec(Doc)) : undefined) ||
            Cast(this.props.document[this.fieldKey], listSpec(Doc));
    }
    @computed get childLinks() {
        let layout = this.props.document.layout instanceof Doc ? this.props.document.layout : undefined;
        return (this.props.dataDoc ? Cast(this.props.dataDoc.links, listSpec(Doc)) : undefined) ||
            (layout instanceof Doc ? Cast(layout.links, listSpec(Doc)) : undefined) ||
            Cast(this.props.document.links, listSpec(Doc));
    }
    @computed get resolvedDataDoc() {
        if (this.props.dataDoc === undefined && this.props.document.layout instanceof Doc) {
            // if there is no dataDoc (ie, we're not rendering a template layout), but this document
            // has a template layout document, then we will render the template layout but use 
            // this document as the data document for the layout.
            return this.props.document;
        }
        return this.props.dataDoc;
    }
    @computed get boundsOfCollectionDocument() {
        return StrCast(this.props.document.type).indexOf(DocumentType.COL) === -1 ? undefined :
            Doc.ComputeContentBounds(DocListCast(this.props.document.data));
    }

    @undoBatch delete = () => this.props.deleteDoc(this.dataDoc);
    @undoBatch openRight = () => this.props.addDocTab(this.props.document, undefined, "onRight");
    @undoBatch indent = () => this.props.addDocument(this.props.document) && this.delete();
    @undoBatch move = (doc: Doc, target: Doc, addDoc: (doc: Doc) => boolean) => {
        return this.props.document !== target && this.props.deleteDoc(doc) && addDoc(doc);
    }
    @undoBatch @action remove = (document: Document, key: string): boolean => {
        let children = Cast(this.dataDoc[key], listSpec(Doc), []);
        if (children.indexOf(document) !== -1) {
            children.splice(children.indexOf(document), 1);
            return true;
        }
        return false;
    }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this._treedropDisposer && this._treedropDisposer();
        ele && (this._treedropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.treeDrop.bind(this) } }));
    }

    onPointerDown = (e: React.PointerEvent) => e.stopPropagation();
    onPointerEnter = (e: React.PointerEvent): void => {
        this.props.active() && Doc.BrushDoc(this.dataDoc);
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
        let x = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        let inside = x[0] > bounds[0] + 75;
        this._header!.current!.className = "treeViewItem-header";
        if (inside) this._header!.current!.className += " treeViewItem-header-inside";
        else if (before) this._header!.current!.className += " treeViewItem-header-above";
        else if (!before) this._header!.current!.className += " treeViewItem-header-below";
        e.stopPropagation();
    }

    editableView = (key: string, style?: string) => (<EditableView
        oneLine={true}
        display={"inline"}
        editing={this.dataDoc[Id] === TreeView.loadId}
        contents={StrCast(this.props.document[key])}
        height={36}
        fontStyle={style}
        fontSize={12}
        GetValue={() => StrCast(this.props.document[key])}
        SetValue={undoBatch((value: string) => (Doc.GetProto(this.dataDoc)[key] = value) ? true : true)}
        OnFillDown={undoBatch((value: string) => {
            Doc.GetProto(this.dataDoc)[key] = value;
            let doc = this.props.document.detailedLayout instanceof Doc ? Doc.ApplyTemplate(Doc.GetProto(this.props.document.detailedLayout)) : undefined;
            if (!doc) doc = Docs.Create.FreeformDocument([], { title: "", x: 0, y: 0, width: 100, height: 25, templates: new List<string>([Templates.Title.Layout]) });
            TreeView.loadId = doc[Id];
            return this.props.addDocument(doc);
        })}
        OnTab={() => { TreeView.loadId = ""; this.props.indentDocument && this.props.indentDocument(); }}
    />)

    onWorkspaceContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped()) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            if (NumCast(this.props.document.viewType) !== CollectionViewType.Docking) {
                ContextMenu.Instance.addItem({ description: "Pin to Presentation", event: () => this.props.pinToPres(this.props.document), icon: "tv" });
                ContextMenu.Instance.addItem({ description: "Open Tab", event: () => this.props.addDocTab(this.props.document, this.resolvedDataDoc, "inTab"), icon: "folder" });
                ContextMenu.Instance.addItem({ description: "Open Right", event: () => this.props.addDocTab(this.props.document, this.resolvedDataDoc, "onRight"), icon: "caret-square-right" });
                if (DocumentManager.Instance.getDocumentViews(this.dataDoc).length) {
                    ContextMenu.Instance.addItem({ description: "Focus", event: () => DocumentManager.Instance.getDocumentViews(this.dataDoc).map(view => view.props.focus(this.props.document, true)), icon: "camera" });
                }
                ContextMenu.Instance.addItem({ description: "Delete Item", event: () => this.props.deleteDoc(this.props.document), icon: "trash-alt" });
            } else {
                ContextMenu.Instance.addItem({ description: "Open as Workspace", event: () => MainView.Instance.openWorkspace(this.dataDoc), icon: "caret-square-right" });
                ContextMenu.Instance.addItem({ description: "Delete Workspace", event: () => this.props.deleteDoc(this.props.document), icon: "trash-alt" });
            }
            ContextMenu.Instance.addItem({ description: "Open Fields", event: () => { let kvp = Docs.Create.KVPDocument(this.props.document, { width: 300, height: 300 }); this.props.addDocTab(kvp, this.props.dataDoc ? this.props.dataDoc : kvp, "onRight"); }, icon: "layer-group" });
            ContextMenu.Instance.displayMenu(e.pageX > 156 ? e.pageX - 156 : 0, e.pageY - 15);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @undoBatch
    treeDrop = (e: Event, de: DragManager.DropEvent) => {
        let x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        let inside = x[0] > bounds[0] + 75 || (!before && this.treeViewOpen);
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc = de.data.linkSourceDocument;
            let destDoc = this.props.document;
            DocUtils.MakeLink(sourceDoc, destDoc);
            e.stopPropagation();
        }
        if (de.data instanceof DragManager.DocumentDragData) {
            e.stopPropagation();
            if (de.data.draggedDocuments[0] === this.props.document) return true;
            let addDoc = (doc: Doc) => this.props.addDocument(doc, this.resolvedDataDoc, before);
            if (inside) {
                let docList = Cast(this.dataDoc.data, listSpec(Doc));
                if (docList !== undefined) {
                    addDoc = (doc: Doc) => { docList && docList.push(doc); return true; };
                }
            }
            let movedDocs = (de.data.options === this.props.treeViewId ? de.data.draggedDocuments : de.data.droppedDocuments);
            return (de.data.dropAction || de.data.userDropAction) ?
                de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d, this.resolvedDataDoc, before) || added, false)
                : (de.data.moveDocument) ?
                    movedDocs.reduce((added: boolean, d) => de.data.moveDocument(d, this.resolvedDataDoc, addDoc) || added, false)
                    : de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d, this.resolvedDataDoc, before), false);
        }
        return false;
    }

    docTransform = () => {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(this._dref.current!);
        let outerXf = this.props.outerXf();
        let offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        let finalXf = this.props.ScreenToLocalTransform().translate(offset[0], offset[1]);
        return finalXf;
    }
    docWidth = () => {
        let aspect = NumCast(this.props.document.nativeHeight) / NumCast(this.props.document.nativeWidth);
        if (aspect) return Math.min(this.props.document[WidthSym](), Math.min(this.MAX_EMBED_HEIGHT / aspect, this.props.panelWidth() - 5));
        return NumCast(this.props.document.nativeWidth) ? Math.min(this.props.document[WidthSym](), this.props.panelWidth() - 5) : this.props.panelWidth() - 5;
    }
    docHeight = () => {
        let bounds = this.boundsOfCollectionDocument;
        return Math.min(this.MAX_EMBED_HEIGHT, (() => {
            let aspect = NumCast(this.props.document.nativeHeight) / NumCast(this.props.document.nativeWidth);
            if (aspect) return this.docWidth() * aspect;
            if (bounds) return this.docWidth() * (bounds.b - bounds.y) / (bounds.r - bounds.x);
            return NumCast(this.props.document.height) ? NumCast(this.props.document.height) : 50;
        })());
    }

    expandedField = (doc: Doc) => {
        let ids: { [key: string]: string } = {};
        doc && Object.keys(doc).forEach(key => !(key in ids) && doc[key] !== ComputedField.undefined && (ids[key] = key));

        let rows: JSX.Element[] = [];
        for (let key of Object.keys(ids).slice().sort()) {
            let contents = doc[key];
            let contentElement: (JSX.Element | null)[] | JSX.Element = [];

            if (contents instanceof Doc || Cast(contents, listSpec(Doc))) {
                let remDoc = (doc: Doc) => this.remove(doc, key);
                let addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => Doc.AddDocToList(this.dataDoc, key, doc, addBefore, before, false, true);
                contentElement = TreeView.GetChildElements(contents instanceof Doc ? [contents] :
                    DocListCast(contents), this.props.treeViewId, doc, undefined, key, addDoc, remDoc, this.move,
                    this.props.dropAction, this.props.addDocTab, this.props.pinToPres, this.props.ScreenToLocalTransform, this.props.outerXf, this.props.active, this.props.panelWidth, this.props.renderDepth, this.props.showHeaderFields, this.props.preventTreeViewOpen);
            } else {
                contentElement = <EditableView
                    key="editableView"
                    contents={contents !== undefined ? contents.toString() : "null"}
                    height={13}
                    fontSize={12}
                    GetValue={() => Field.toKeyValueString(doc, key)}
                    SetValue={(value: string) => KeyValueBox.SetField(doc, key, value)} />;
            }
            rows.push(<div style={{ display: "flex" }} key={key}>
                <span style={{ fontWeight: "bold" }}>{key + ":"}</span>
                &nbsp;
                {contentElement}
            </div>);
        }
        return rows;
    }

    noOverlays = (doc: Doc) => ({ title: "", caption: "" });

    @computed get renderContent() {
        const expandKey = this.treeViewExpandedView === this.fieldKey ? this.fieldKey : this.treeViewExpandedView === "links" ? "links" : undefined;
        if (expandKey !== undefined) {
            let remDoc = (doc: Doc) => this.remove(doc, expandKey);
            let addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => Doc.AddDocToList(this.dataDoc, expandKey, doc, addBefore, before, false, true);
            let docs = expandKey === "links" ? this.childLinks : this.childDocs;
            return <ul key={expandKey + "more"}>
                {!docs ? (null) :
                    TreeView.GetChildElements(docs as Doc[], this.props.treeViewId, this.props.document.layout as Doc,
                        this.resolvedDataDoc, expandKey, addDoc, remDoc, this.move,
                        this.props.dropAction, this.props.addDocTab, this.props.pinToPres, this.props.ScreenToLocalTransform,
                        this.props.outerXf, this.props.active, this.props.panelWidth, this.props.renderDepth, this.props.showHeaderFields, this.props.preventTreeViewOpen)}
            </ul >;
        } else if (this.treeViewExpandedView === "fields") {
            return <ul><div ref={this._dref} style={{ display: "inline-block" }} key={this.props.document[Id] + this.props.document.title}>
                {this.dataDoc ? this.expandedField(this.dataDoc) : (null)}
            </div></ul>;
        } else {
            let layoutDoc = this.props.document;
            return <div ref={this._dref} style={{ display: "inline-block", height: this.docHeight() }} key={this.props.document[Id] + this.props.document.title}>
                <CollectionSchemaPreview
                    Document={layoutDoc}
                    DataDocument={this.resolvedDataDoc}
                    renderDepth={this.props.renderDepth}
                    showOverlays={this.noOverlays}
                    fitToBox={this.boundsOfCollectionDocument !== undefined}
                    width={this.docWidth}
                    height={this.docHeight}
                    getTransform={this.docTransform}
                    CollectionView={undefined}
                    addDocument={emptyFunction as any}
                    moveDocument={this.props.moveDocument}
                    removeDocument={emptyFunction as any}
                    active={this.props.active}
                    whenActiveChanged={emptyFunction as any}
                    addDocTab={this.props.addDocTab}
                    pinToPres={this.props.pinToPres}
                    setPreviewScript={emptyFunction}>
                </CollectionSchemaPreview>
            </div>;
        }
    }

    @computed
    get renderBullet() {
        return <div className="bullet" title="view inline" onClick={action(() => this.treeViewOpen = !this.treeViewOpen)} style={{ color: StrCast(this.props.document.color, "black"), opacity: 0.4 }}>
            {<FontAwesomeIcon icon={!this.treeViewOpen ? (this.childDocs ? "caret-square-right" : "caret-right") : (this.childDocs ? "caret-square-down" : "caret-down")} />}
        </div>;
    }
    /**
     * Renders the EditableView title element for placement into the tree.
     */
    @computed
    get renderTitle() {
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = SetupDrag(reference, () => this.dataDoc, this.move, this.props.dropAction, this.props.treeViewId, true);

        let headerElements = (
            <span className="collectionTreeView-keyHeader" key={this.treeViewExpandedView}
                onPointerDown={action(() => {
                    if (this.treeViewOpen) {
                        this.props.document.treeViewExpandedView = this.treeViewExpandedView === this.fieldKey ? "fields" :
                            this.treeViewExpandedView === "fields" && this.props.document.layout ? "layout" :
                                this.treeViewExpandedView === "layout" && this.props.document.links ? "links" :
                                    this.childDocs ? this.fieldKey : "fields";
                    }
                    this.treeViewOpen = true;
                })}>
                {this.treeViewExpandedView}
            </span>);
        let openRight = (<div className="treeViewItem-openRight" onPointerDown={this.onPointerDown} onClick={this.openRight}>
            <FontAwesomeIcon title="open in pane on right" icon="angle-right" size="lg" />
        </div>);
        return <>
            <div className="docContainer" title="click to edit title" id={`docContainer-${this.props.parentKey}`} ref={reference} onPointerDown={onItemDown}
                style={{
                    color: this.props.document.isMinimized ? "red" : "black",
                    background: Doc.IsBrushed(this.props.document) ? "#06121212" : "0",
                    outline: BoolCast(this.props.document.workspaceBrush) ? "dashed 1px #06123232" : undefined,
                    pointerEvents: this.props.active() || SelectionManager.GetIsDragging() ? "all" : "none"
                }} >
                {this.editableView("title")}
            </div >
            {this.props.showHeaderFields() ? headerElements : (null)}
            {openRight}
        </>;
    }

    render() {
        return <div className="treeViewItem-container" ref={this.createTreeDropTarget} onContextMenu={this.onWorkspaceContextMenu}>
            <li className="collection-child">
                <div className="treeViewItem-header" ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    {this.renderBullet}
                    {this.renderTitle}
                </div>
                <div className="treeViewItem-border">
                    {!this.treeViewOpen ? (null) : this.renderContent}
                </div>
            </li>
        </div>;
    }
    public static GetChildElements(
        docList: Doc[],
        treeViewId: string,
        containingCollection: Doc,
        dataDoc: Doc | undefined,
        key: string,
        add: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean,
        remove: ((doc: Doc) => boolean),
        move: DragManager.MoveFunction,
        dropAction: dropActionType,
        addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => void,
        pinToPres: (document: Doc) => void,
        screenToLocalXf: () => Transform,
        outerXf: () => { translateX: number, translateY: number },
        active: () => boolean,
        panelWidth: () => number,
        renderDepth: number,
        showHeaderFields: () => boolean,
        preventTreeViewOpen: boolean
    ) {
        let docs = docList.filter(child => !child.excludeFromLibrary && child.opacity !== 0);
        let viewSpecScript = Cast(containingCollection.viewSpecScript, ScriptField);
        if (viewSpecScript) {
            let script = viewSpecScript.script;
            docs = docs.filter(d => {
                let res = script.run({ doc: d });
                if (res.success) {
                    return res.result;
                }
                else {
                    console.log(res.error);
                }
            });
        }

        let ascending = Cast(containingCollection.sortAscending, "boolean", null);
        if (ascending !== undefined) docs.sort(function (a, b): 1 | -1 {
            let descA = ascending ? b : a;
            let descB = ascending ? a : b;
            let first = descA.title;
            let second = descB.title;
            // TODO find better way to sort how to sort..................
            if (typeof first === 'number' && typeof second === 'number') {
                return (first - second) > 0 ? 1 : -1;
            }
            if (typeof first === 'string' && typeof second === 'string') {
                return first > second ? 1 : -1;
            }
            if (typeof first === 'boolean' && typeof second === 'boolean') {
                // if (first === second) { // bugfixing?: otherwise, the list "flickers" because the list is resorted during every load
                //     return Number(descA.x) > Number(descB.x) ? 1 : -1;
                // }
                return first > second ? 1 : -1;
            }
            return ascending ? 1 : -1;
        });

        let rowWidth = () => panelWidth() - 20;
        return docs.map((child, i) => {
            let pair = Doc.GetLayoutDataDocPair(containingCollection, dataDoc, key, child);
            if (!pair.layout || pair.data instanceof Promise) {
                return (null);
            }

            let indent = i === 0 ? undefined : () => {
                if (StrCast(docs[i - 1].layout).indexOf("fieldKey") !== -1) {
                    let fieldKeysub = StrCast(docs[i - 1].layout).split("fieldKey")[1];
                    let fieldKey = fieldKeysub.split("\"")[1];
                    if (fieldKey && Cast(docs[i - 1][fieldKey], listSpec(Doc)) !== undefined) {
                        Doc.AddDocToList(docs[i - 1], fieldKey, child);
                        docs[i - 1].treeViewOpen = true;
                        remove(child);
                    }
                }
            };
            let addDocument = (doc: Doc, relativeTo?: Doc, before?: boolean) => {
                return add(doc, relativeTo ? relativeTo : docs[i], before !== undefined ? before : false);
            };
            let rowHeight = () => {
                let aspect = NumCast(child.nativeWidth, 0) / NumCast(child.nativeHeight, 0);
                return aspect ? Math.min(child[WidthSym](), rowWidth()) / aspect : child[HeightSym]();
            };
            return <TreeView
                document={pair.layout}
                dataDoc={pair.data}
                containingCollection={containingCollection}
                treeViewId={treeViewId}
                key={child[Id]}
                indentDocument={indent}
                renderDepth={renderDepth}
                deleteDoc={remove}
                addDocument={addDocument}
                panelWidth={rowWidth}
                panelHeight={rowHeight}
                moveDocument={move}
                dropAction={dropAction}
                addDocTab={addDocTab}
                pinToPres={pinToPres}
                ScreenToLocalTransform={screenToLocalXf}
                outerXf={outerXf}
                parentKey={key}
                active={active}
                showHeaderFields={showHeaderFields}
                preventTreeViewOpen={preventTreeViewOpen} />;
        });
    }
}

@observer
export class CollectionTreeView extends CollectionSubView(Document) {
    private treedropDisposer?: DragManager.DragDropDisposer;
    private _mainEle?: HTMLDivElement;

    @observable static NotifsCol: Opt<Doc>;

    @computed get resolvedDataDoc() { return BoolCast(this.props.Document.isTemplate) && this.props.DataDoc ? this.props.DataDoc : this.props.Document; }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this.treedropDisposer && this.treedropDisposer();
        if (this._mainEle = ele) {
            this.treedropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    componentWillUnmount() {
        this.treedropDisposer && this.treedropDisposer();
    }

    @action
    remove = (document: Document): boolean => {
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc), []);
        if (children.indexOf(document) !== -1) {
            children.splice(children.indexOf(document), 1);
            return true;
        }
        return false;
    }
    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!e.isPropagationStopped() && this.props.Document.workspaceLibrary) { // excludeFromLibrary means this is the user document
            ContextMenu.Instance.addItem({ description: "Create Workspace", event: () => MainView.Instance.createNewWorkspace(), icon: "plus" });
            ContextMenu.Instance.addItem({ description: "Delete Workspace", event: () => this.remove(this.props.Document), icon: "minus" });
            e.stopPropagation();
            e.preventDefault();
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
        } else {
            let layoutItems: ContextMenuProps[] = [];
            layoutItems.push({ description: this.props.Document.preventTreeViewOpen ? "Persist Treeview State" : "Abandon Treeview State", event: () => this.props.Document.preventTreeViewOpen = !this.props.Document.preventTreeViewOpen, icon: "paint-brush" });
            ContextMenu.Instance.addItem({ description: "Treeview Options ...", subitems: layoutItems, icon: "eye" });
        }
    }
    outerXf = () => Utils.GetScreenTransform(this._mainEle!);
    onTreeDrop = (e: React.DragEvent) => this.onDrop(e, {});
    openNotifsCol = () => {
        if (CollectionTreeView.NotifsCol && CollectionDockingView.Instance) {
            CollectionDockingView.Instance.AddRightSplit(CollectionTreeView.NotifsCol, undefined);
        }
    }

    @computed get renderNotifsButton() {
        const length = CollectionTreeView.NotifsCol ? DocListCast(CollectionTreeView.NotifsCol.data).length : 0;
        const notifsRef = React.createRef<HTMLDivElement>();
        const dragNotifs = action(() => CollectionTreeView.NotifsCol!);
        return <div id="toolbar" key="toolbar">
            <div ref={notifsRef}>
                <button className="toolbar-button round-button" title="Notifs"
                    onClick={this.openNotifsCol} onPointerDown={CollectionTreeView.NotifsCol ? SetupDrag(notifsRef, dragNotifs) : emptyFunction}>
                    <FontAwesomeIcon icon={faBell} size="sm" />
                </button>
                <div className="main-notifs-badge" style={length > 0 ? { "display": "initial" } : { "display": "none" }}>
                    {length}
                </div>
            </div>
        </div >;
    }
    @computed get renderClearButton() {
        return <div id="toolbar" key="toolbar">
            <button className="toolbar-button round-button" title="Notifs"
                onClick={undoBatch(action(() => Doc.GetProto(this.props.Document)[this.props.fieldKey] = undefined))}>
                <FontAwesomeIcon icon={faTrash} size="sm" />
            </button>
        </div >;
    }

    render() {
        Doc.UpdateDocumentExtensionForField(this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey);
        let dropAction = StrCast(this.props.Document.dropAction) as dropActionType;
        let addDoc = (doc: Doc, relativeTo?: Doc, before?: boolean) => Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc, relativeTo, before, false, false, false);
        let moveDoc = (d: Doc, target: Doc, addDoc: (doc: Doc) => boolean) => this.props.moveDocument(d, target, addDoc);
        return !this.childDocs ? (null) : (
            <div id="body" className="collectionTreeView-dropTarget"
                style={{ overflow: "auto", background: StrCast(this.props.Document.backgroundColor, "lightgray") }}
                onContextMenu={this.onContextMenu}
                onWheel={(e: React.WheelEvent) => (e.target as any).scrollHeight > (e.target as any).clientHeight && e.stopPropagation()}
                onDrop={this.onTreeDrop}
                ref={this.createTreeDropTarget}>
                <EditableView
                    contents={this.resolvedDataDoc.title}
                    display={"block"}
                    height={72}
                    GetValue={() => StrCast(this.resolvedDataDoc.title)}
                    SetValue={undoBatch((value: string) => (Doc.GetProto(this.resolvedDataDoc).title = value) ? true : true)}
                    OnFillDown={undoBatch((value: string) => {
                        Doc.GetProto(this.props.Document).title = value;
                        let doc = this.props.Document.detailedLayout instanceof Doc ? Doc.ApplyTemplate(Doc.GetProto(this.props.Document.detailedLayout)) : undefined;
                        if (!doc) doc = Docs.Create.FreeformDocument([], { title: "", x: 0, y: 0, width: 100, height: 25, templates: new List<string>([Templates.Title.Layout]) });
                        TreeView.loadId = doc[Id];
                        Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc, this.childDocs.length ? this.childDocs[0] : undefined, true, false, false, false);
                    })} />
                {this.props.Document.workspaceLibrary ? this.renderNotifsButton : (null)}
                {this.props.Document.allowClear ? this.renderClearButton : (null)}
                <ul className="no-indent" style={{ width: "max-content" }} >
                    {
                        TreeView.GetChildElements(this.childDocs, this.props.Document[Id], this.props.Document, this.props.DataDoc, this.props.fieldKey, addDoc, this.remove,
                            moveDoc, dropAction, this.props.addDocTab, this.props.pinToPres, this.props.ScreenToLocalTransform,
                            this.outerXf, this.props.active, this.props.PanelWidth, this.props.renderDepth, () => this.props.Document.chromeStatus !== "disabled",
                            BoolCast(this.props.Document.preventTreeViewOpen))
                    }
                </ul>
            </div >
        );
    }
}