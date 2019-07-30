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
import { Docs, DocUtils, DocumentType } from '../../documents/Documents';
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
import { LinkManager } from '../../util/LinkManager';
import { ComputedField } from '../../../new_fields/ScriptField';
import { KeyValueBox } from '../nodes/KeyValueBox';


export interface TreeViewProps {
    document: Doc;
    dataDoc?: Doc;
    containingCollection: Doc;
    renderDepth: number;
    deleteDoc: (doc: Doc) => boolean;
    moveDocument: DragManager.MoveFunction;
    dropAction: "alias" | "copy" | undefined;
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => void;
    panelWidth: () => number;
    panelHeight: () => number;
    addDocument: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean;
    indentDocument?: () => void;
    ScreenToLocalTransform: () => Transform;
    outerXf: () => { translateX: number, translateY: number };
    treeViewId: string;
    parentKey: string;
    active: () => boolean;
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
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class TreeView extends React.Component<TreeViewProps> {
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _treedropDisposer?: DragManager.DragDropDisposer;
    private _dref = React.createRef<HTMLDivElement>();
    @computed get treeViewExpandedView() { return StrCast(this.props.document.treeViewExpandedView, "data"); }
    @computed get MAX_EMBED_HEIGHT() { return NumCast(this.props.document.maxEmbedHeight, 300); }
    @observable _collapsed: boolean = true;

    @computed get fieldKey() {
        let target = this.props.document;
        let keys = Array.from(Object.keys(target));  // bcz: Argh -- make untracked to avoid this rerunning whenever 'libraryBrush' is set
        if (target.proto instanceof Doc) {
            let arr = Array.from(Object.keys(target.proto));// bcz: Argh -- make untracked to avoid this rerunning whenever 'libraryBrush' is set
            keys.push(...arr);
            while (keys.indexOf("proto") !== -1) keys.splice(keys.indexOf("proto"), 1);
        }
        let keyList: string[] = [];
        keys.map(key => {
            let docList = Cast(this.dataDoc[key], listSpec(Doc));
            if (docList && docList.length > 0) {
                keyList.push(key);
            }
        });
        let layout = StrCast(this.props.document.layout);
        if (layout.indexOf("fieldKey={\"") !== -1 && layout.indexOf("fieldExt=") === -1) {
            return layout.split("fieldKey={\"")[1].split("\"")[0];
        }
        return keyList.length ? keyList[0] : "data";
    }

    @computed get dataDoc() { return this.resolvedDataDoc ? this.resolvedDataDoc : this.props.document; }
    @computed get resolvedDataDoc() {
        if (this.props.dataDoc === undefined && this.props.document.layout instanceof Doc) {
            // if there is no dataDoc (ie, we're not rendering a template layout), but this document
            // has a template layout document, then we will render the template layout but use 
            // this document as the data document for the layout.
            return this.props.document;
        }
        return this.props.dataDoc ? this.props.dataDoc : undefined;
    }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this._treedropDisposer && this._treedropDisposer();
        if (ele) {
            this._treedropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.treeDrop.bind(this) } });
        }
    }

    @undoBatch delete = () => this.props.deleteDoc(this.dataDoc);
    @undoBatch openRight = async () => this.props.addDocTab(this.props.document, undefined, "onRight");

    onPointerDown = (e: React.PointerEvent) => e.stopPropagation();
    onPointerEnter = (e: React.PointerEvent): void => {
        this.props.active() && (this.props.document.libraryBrush = true);
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {
            this._header!.current!.className = "treeViewItem-header";
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        this.props.document.libraryBrush = false;
        this._header!.current!.className = "treeViewItem-header";
        document.removeEventListener("pointermove", this.onDragMove, true);
    }
    onDragMove = (e: PointerEvent): void => {
        this.props.document.libraryBrush = false;
        let x = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        let inside = x[0] > bounds[0] + 75 || (!before && !this._collapsed);
        this._header!.current!.className = "treeViewItem-header";
        if (inside) this._header!.current!.className += " treeViewItem-header-inside";
        else if (before) this._header!.current!.className += " treeViewItem-header-above";
        else if (!before) this._header!.current!.className += " treeViewItem-header-below";
        e.stopPropagation();
    }

    @action
    remove = (document: Document, key: string): boolean => {
        let children = Cast(this.dataDoc[key], listSpec(Doc), []);
        if (children.indexOf(document) !== -1) {
            children.splice(children.indexOf(document), 1);
            return true;
        }
        return false;
    }

    @action
    move: DragManager.MoveFunction = (doc: Doc, target: Doc, addDoc) => {
        return this.props.document !== target && this.props.deleteDoc(doc) && addDoc(doc);
    }
    @action
    indent = () => this.props.addDocument(this.props.document) && this.delete()

    renderBullet() {
        let docList = Cast(this.dataDoc[this.fieldKey], listSpec(Doc));
        let doc = Cast(this.dataDoc[this.fieldKey], Doc);
        let isDoc = doc instanceof Doc || docList;
        let c;
        return <div className="bullet" onClick={action(() => this._collapsed = !this._collapsed)} style={{ color: StrCast(this.props.document.color, "black"), opacity: 0.4 }}>
            {<FontAwesomeIcon icon={this._collapsed ? (isDoc ? "caret-square-right" : "caret-right") : (isDoc ? "caret-square-down" : "caret-down")} />}
        </div>;
    }

    static loadId = "";
    editableView = (key: string, style?: string) => (<EditableView
        oneLine={true}
        display={"inline"}
        editing={this.dataDoc[Id] === TreeView.loadId}
        contents={StrCast(this.props.document[key])}
        height={36}
        fontStyle={style}
        fontSize={12}
        GetValue={() => StrCast(this.props.document[key])}
        SetValue={(value: string) => (Doc.GetProto(this.dataDoc)[key] = value) ? true : true}
        OnFillDown={(value: string) => {
            Doc.GetProto(this.dataDoc)[key] = value;
            let doc = this.props.document.detailedLayout instanceof Doc ? Doc.ApplyTemplate(Doc.GetProto(this.props.document.detailedLayout)) : undefined;
            if (!doc) doc = Docs.Create.FreeformDocument([], { title: "", x: 0, y: 0, width: 100, height: 25, templates: new List<string>([Templates.Title.Layout]) });
            TreeView.loadId = doc[Id];
            return this.props.addDocument(doc);
        }}
        OnTab={() => this.props.indentDocument && this.props.indentDocument()}
    />)

    /**
     * Renders the EditableView title element for placement into the tree.
     */
    renderTitle() {
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = SetupDrag(reference, () => this.dataDoc, this.move, this.props.dropAction, this.props.treeViewId, true);

        let headerElements = (
            <span className="collectionTreeView-keyHeader" key={this.treeViewExpandedView}
                onPointerDown={action(() => {
                    this.props.document.treeViewExpandedView = this.treeViewExpandedView === "data" ? "fields" :
                        this.treeViewExpandedView === "fields" && this.props.document.layout ? "layout" : "data";
                    this._collapsed = false;
                })}>
                {this.treeViewExpandedView}
            </span>);
        let dataDocs = CollectionDockingView.Instance ? Cast(CollectionDockingView.Instance.props.Document[this.fieldKey], listSpec(Doc), []) : [];
        let openRight = dataDocs && dataDocs.indexOf(this.dataDoc) !== -1 ? (null) : (
            <div className="treeViewItem-openRight" onPointerDown={this.onPointerDown} onClick={this.openRight}>
                <FontAwesomeIcon icon="angle-right" size="lg" />
            </div>);
        return <>
            <div className="docContainer" id={`docContainer-${this.props.parentKey}`} ref={reference} onPointerDown={onItemDown}
                style={{
                    background: BoolCast(this.props.document.libraryBrush) ? "#06121212" : "0",
                    outline: BoolCast(this.props.document.workspaceBrush) ? "dashed 1px #06123232" : undefined,
                    pointerEvents: this.props.active() || SelectionManager.GetIsDragging() ? "all" : "none"
                }}
            >
                {this.editableView("title")}
                {/* {<div className="delete-button" onClick={this.delete}><FontAwesomeIcon icon="trash-alt" size="xs" /></div>} */}
            </div >
            {headerElements}
            {openRight}
        </>;
    }

    onWorkspaceContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped()) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            if (NumCast(this.props.document.viewType) !== CollectionViewType.Docking) {
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
        let inside = x[0] > bounds[0] + 75 || (!before && !this._collapsed);
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

    renderLinks = () => {
        let ele: JSX.Element[] = [];
        let remDoc = (doc: Doc) => this.remove(doc, this.fieldKey);
        let addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => Doc.AddDocToList(this.props.document, this.fieldKey, doc, addBefore, before);
        let groups = LinkManager.Instance.getRelatedGroupedLinks(this.props.document);
        groups.forEach((groupLinkDocs, groupType) => {
            // let destLinks = groupLinkDocs.map(d => LinkManager.Instance.getOppositeAnchor(d, this.props.document));
            let destLinks: Doc[] = [];
            groupLinkDocs.forEach((doc) => {
                let opp = LinkManager.Instance.getOppositeAnchor(doc, this.props.document);
                if (opp) {
                    destLinks.push(opp);
                }
            });
            ele.push(
                <div key={"treeviewlink-" + groupType + "subtitle"}>
                    <div className="collectionTreeView-subtitle">{groupType}:</div>
                    {
                        TreeView.GetChildElements(destLinks, this.props.treeViewId, this.props.document, this.props.dataDoc, "treeviewlink-" + groupType, addDoc, remDoc, this.move,
                            this.props.dropAction, this.props.addDocTab, this.props.ScreenToLocalTransform, this.props.outerXf, this.props.active, this.props.panelWidth, this.props.renderDepth)
                    }
                </div>
            );
        });
        return ele;
    }

    @computed get boundsOfCollectionDocument() {
        if (StrCast(this.props.document.type).indexOf(DocumentType.COL) === -1) return undefined;
        let layoutDoc = this.props.document;
        return Doc.ComputeContentBounds(DocListCast(layoutDoc.data));
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

    noOverlays = (doc: Doc) => ({ title: "", caption: "" });

    expandedField = (doc?: Doc) => {
        if (!doc) return <div />;
        let realDoc = doc;

        let ids: { [key: string]: string } = {};
        Object.keys(doc).forEach(key => {
            if (!(key in ids) && realDoc[key] !== ComputedField.undefined) {
                ids[key] = key;
            }
        });

        let rows: JSX.Element[] = [];
        for (let key of Object.keys(ids).sort()) {
            let contents = realDoc[key] ? realDoc[key] : undefined;
            let contentElement: JSX.Element[] | JSX.Element = [];

            if (contents instanceof Doc || Cast(contents, listSpec(Doc))) {
                let docList = contents;
                let remDoc = (doc: Doc) => this.remove(doc, key);
                let addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => Doc.AddDocToList(this.dataDoc, key, doc, addBefore, before);
                contentElement = key === "links" ? this.renderLinks() :
                    TreeView.GetChildElements(docList instanceof Doc ? [docList] : DocListCast(docList), this.props.treeViewId, realDoc, undefined, key, addDoc, remDoc, this.move,
                        this.props.dropAction, this.props.addDocTab, this.props.ScreenToLocalTransform, this.props.outerXf, this.props.active, this.props.panelWidth, this.props.renderDepth);
            } else {
                contentElement = <EditableView
                    key="editableView"
                    contents={contents ? contents.toString() : "null"}
                    height={13}
                    fontSize={12}
                    GetValue={() => Field.toKeyValueString(realDoc, key)}
                    SetValue={(value: string) => KeyValueBox.SetField(realDoc, key, value)} />;
            }
            rows.push(<div style={{ display: "flex" }} key={key}>
                <span style={{ fontWeight: "bold" }}>{key + ":"}</span>
                &nbsp;
                {contentElement}
            </div>);
        }
        return rows;
    }

    render() {
        let contentElement: (JSX.Element | null) = null;
        let docList = Cast(this.dataDoc[this.fieldKey], listSpec(Doc));
        let remDoc = (doc: Doc) => this.remove(doc, this.fieldKey);
        let addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => Doc.AddDocToList(this.dataDoc, this.fieldKey, doc, addBefore, before);

        if (!this._collapsed) {
            if (this.treeViewExpandedView === "data") {
                let doc = Cast(this.props.document[this.fieldKey], Doc);
                contentElement = <ul key={this.fieldKey + "more"}>
                    {this.fieldKey === "links" ? this.renderLinks() :
                        TreeView.GetChildElements(doc instanceof Doc ? [doc] : DocListCast(docList), this.props.treeViewId, this.props.document, this.resolvedDataDoc, this.fieldKey, addDoc, remDoc, this.move,
                            this.props.dropAction, this.props.addDocTab, this.props.ScreenToLocalTransform, this.props.outerXf, this.props.active, this.props.panelWidth, this.props.renderDepth)}
                </ul >;
            } else if (this.treeViewExpandedView === "fields") {
                contentElement = <ul><div ref={this._dref} style={{ display: "inline-block" }} key={this.props.document[Id] + this.props.document.title}>
                    {this.expandedField(this.dataDoc)}
                </div></ul>;
            } else {
                let layoutDoc = this.props.document;
                contentElement = <div ref={this._dref} style={{ display: "inline-block", height: this.docHeight() }} key={this.props.document[Id] + this.props.document.title}>
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
                        setPreviewScript={emptyFunction}>
                    </CollectionSchemaPreview>
                </div>;
            }
        }
        return <div className="treeViewItem-container" ref={this.createTreeDropTarget} onContextMenu={this.onWorkspaceContextMenu}>
            <li className="collection-child">
                <div className="treeViewItem-header" ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    {this.renderBullet()}
                    {this.renderTitle()}
                </div>
                <div className="treeViewItem-border">
                    {contentElement}
                </div>
            </li>
        </div>;
    }
    public static GetChildElements(
        docs: Doc[],
        treeViewId: string,
        containingCollection: Doc,
        dataDoc: Doc | undefined,
        key: string,
        add: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean,
        remove: ((doc: Doc) => boolean),
        move: DragManager.MoveFunction,
        dropAction: dropActionType,
        addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string) => void,
        screenToLocalXf: () => Transform,
        outerXf: () => { translateX: number, translateY: number },
        active: () => boolean,
        panelWidth: () => number,
        renderDepth: number
    ) {
        let docList = docs.filter(child => !child.excludeFromLibrary);
        let rowWidth = () => panelWidth() - 20;
        return docList.map((child, i) => {
            let indent = i === 0 ? undefined : () => {
                if (StrCast(docList[i - 1].layout).indexOf("CollectionView") !== -1) {
                    let fieldKeysub = StrCast(docList[i - 1].layout).split("fieldKey")[1];
                    let fieldKey = fieldKeysub.split("\"")[1];
                    Doc.AddDocToList(docList[i - 1], fieldKey, child);
                    remove(child);
                }
            };
            let addDocument = (doc: Doc, relativeTo?: Doc, before?: boolean) => {
                return add(doc, relativeTo ? relativeTo : docList[i], before !== undefined ? before : false);
            };
            let rowHeight = () => {
                let aspect = NumCast(child.nativeWidth, 0) / NumCast(child.nativeHeight, 0);
                return aspect ? Math.min(child[WidthSym](), rowWidth()) / aspect : child[HeightSym]();
            };
            return <TreeView
                document={child}
                dataDoc={dataDoc}
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
                ScreenToLocalTransform={screenToLocalXf}
                outerXf={outerXf}
                parentKey={key}
                active={active} />;
        });
    }
}

@observer
export class CollectionTreeView extends CollectionSubView(Document) {
    private treedropDisposer?: DragManager.DragDropDisposer;
    private _mainEle?: HTMLDivElement;

    @computed get chromeCollapsed() { return this.props.chromeCollapsed; }

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
        }
    }

    @computed get resolvedDataDoc() { return BoolCast(this.props.Document.isTemplate) && this.props.DataDoc ? this.props.DataDoc : this.props.Document; }

    outerXf = () => Utils.GetScreenTransform(this._mainEle!);
    onTreeDrop = (e: React.DragEvent) => this.onDrop(e, {});


    @observable static NotifsCol: Opt<Doc>;

    openNotifsCol = () => {
        if (CollectionTreeView.NotifsCol && CollectionDockingView.Instance) {
            CollectionDockingView.Instance.AddRightSplit(CollectionTreeView.NotifsCol, undefined);
        }
    }
    @computed get notifsButton() {
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
    @computed get clearButton() {
        return <div id="toolbar" key="toolbar">
            <div >
                <button className="toolbar-button round-button" title="Notifs"
                    onClick={undoBatch(action(() => Doc.GetProto(this.props.Document)[this.props.fieldKey] = undefined))}>
                    <FontAwesomeIcon icon={faTrash} size="sm" />
                </button>
            </div>
        </div >;
    }


    render() {
        Doc.UpdateDocumentExtensionForField(this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey);
        let dropAction = StrCast(this.props.Document.dropAction) as dropActionType;
        let addDoc = (doc: Doc, relativeTo?: Doc, before?: boolean) => Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc, relativeTo, before);
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
                    SetValue={(value: string) => (Doc.GetProto(this.resolvedDataDoc).title = value) ? true : true}
                    OnFillDown={(value: string) => {
                        Doc.GetProto(this.props.Document).title = value;
                        let doc = this.props.Document.detailedLayout instanceof Doc ? Doc.ApplyTemplate(Doc.GetProto(this.props.Document.detailedLayout)) : undefined;
                        if (!doc) doc = Docs.Create.FreeformDocument([], { title: "", x: 0, y: 0, width: 100, height: 25, templates: new List<string>([Templates.Title.Layout]) });
                        TreeView.loadId = doc[Id];
                        Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc, this.childDocs.length ? this.childDocs[0] : undefined, true);
                    }} />
                {this.props.Document.workspaceLibrary ? this.notifsButton : (null)}
                {this.props.Document.allowClear ? this.clearButton : (null)}
                <ul className="no-indent" style={{ width: "max-content" }} >
                    {
                        TreeView.GetChildElements(this.childDocs, this.props.Document[Id], this.props.Document, this.props.DataDoc, this.props.fieldKey, addDoc, this.remove,
                            moveDoc, dropAction, this.props.addDocTab, this.props.ScreenToLocalTransform, this.outerXf, this.props.active, this.props.PanelWidth, this.props.renderDepth)
                    }
                </ul>
            </div >
        );
    }
}