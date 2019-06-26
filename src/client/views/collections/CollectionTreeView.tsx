import { library } from '@fortawesome/fontawesome-svg-core';
import { faAngleRight, faCaretDown, faCaretRight, faCaretSquareDown, faCaretSquareRight, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, WidthSym } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { Document, listSpec } from '../../../new_fields/Schema';
import { BoolCast, Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { emptyFunction, Utils } from '../../../Utils';
import { Docs } from '../../documents/Documents';
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


export interface TreeViewProps {
    document: Doc;
    dataDoc?: Doc;
    containingCollection: Doc;
    renderDepth: number;
    deleteDoc: (doc: Doc) => boolean;
    moveDocument: DragManager.MoveFunction;
    dropAction: "alias" | "copy" | undefined;
    addDocTab: (doc: Doc, dataDoc: Doc, where: string) => void;
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
library.add(faCaretDown);
library.add(faCaretRight);
library.add(faCaretSquareDown);
library.add(faCaretSquareRight);

@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class TreeView extends React.Component<TreeViewProps> {
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _treedropDisposer?: DragManager.DragDropDisposer;
    private _dref = React.createRef<HTMLDivElement>();
    @observable __chosenKey: string = "";
    @computed get _chosenKey() { return this.__chosenKey ? this.__chosenKey : this.fieldKey; }
    @observable _collapsed: boolean = true;

    @computed get fieldKey() {
        let keys = Array.from(Object.keys(this.resolvedDataDoc));
        if (this.resolvedDataDoc.proto instanceof Doc) {
            keys.push(...Array.from(Object.keys(this.resolvedDataDoc.proto)));
            while (keys.indexOf("proto") !== -1) keys.splice(keys.indexOf("proto"), 1);
        }
        let keyList: string[] = [];
        keys.map(key => {
            let docList = Cast(this.resolvedDataDoc[key], listSpec(Doc));
            if (docList && docList.length > 0) {
                keyList.push(key);
            }
        });
        let layout = StrCast(this.props.document.layout);
        if (layout.indexOf("fieldKey={\"") !== -1) {
            return layout.split("fieldKey={\"")[1].split("\"")[0];
        }
        return keyList.length ? keyList[0] : "data";
    }

    @computed get resolvedDataDoc() { return BoolCast(this.props.document.isTemplate) && this.props.dataDoc ? this.props.dataDoc : this.props.document; }

    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this._treedropDisposer && this._treedropDisposer();
        if (ele) {
            this._treedropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.treeDrop.bind(this) } });
        }
    }

    @undoBatch delete = () => this.props.deleteDoc(this.resolvedDataDoc);
    @undoBatch openRight = async () => this.props.addDocTab(this.props.document, this.props.document, "onRight");

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
        let children = Cast(this.resolvedDataDoc[key], listSpec(Doc), []);
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
        let docList = Cast(this.resolvedDataDoc[this.fieldKey], listSpec(Doc));
        let doc = Cast(this.resolvedDataDoc[this.fieldKey], Doc);
        let isDoc = doc instanceof Doc || docList;
        return <div className="bullet" onClick={action(() => this._collapsed = !this._collapsed)}>
            {<FontAwesomeIcon icon={this._collapsed ? (isDoc ? "caret-square-right" : "caret-right") : (isDoc ? "caret-square-down" : "caret-down")} />}
        </div>;
    }

    titleClicked = (e: React.MouseEvent) => {
        if (this._collapsed) return false;
        else {
            this.props.document.embed = !BoolCast(this.props.document.embed);
            return true;
        }
    }
    static loadId = "";
    editableView = (key: string, style?: string) => (<EditableView
        oneLine={true}
        display={"inline"}
        editing={this.resolvedDataDoc[Id] === TreeView.loadId}
        contents={StrCast(this.props.document[key])}
        onClick={this.titleClicked}
        height={36}
        fontStyle={style}
        GetValue={() => StrCast(this.props.document[key])}
        SetValue={(value: string) => (Doc.GetProto(this.resolvedDataDoc)[key] = value) ? true : true}
        OnFillDown={(value: string) => {
            Doc.GetProto(this.resolvedDataDoc)[key] = value;
            let doc = Docs.FreeformDocument([], { title: "", x: 0, y: 0, width: 100, height: 25, templates: new List<string>([Templates.Title.Layout]) });
            TreeView.loadId = doc[Id];
            return this.props.addDocument(doc);
        }}
        OnTab={() => this.props.indentDocument && this.props.indentDocument()}
    />)

    @computed get keyList() {
        let keys = Array.from(Object.keys(this.resolvedDataDoc));
        if (this.resolvedDataDoc.proto instanceof Doc) {
            keys.push(...Array.from(Object.keys(this.resolvedDataDoc.proto)));
            while (keys.indexOf("proto") !== -1) keys.splice(keys.indexOf("proto"), 1);
        }
        let keyList: string[] = keys.reduce((l, key) => Cast(this.resolvedDataDoc[key], listSpec(Doc)) ? [...l, key] : l, [] as string[]);
        keys.map(key => Cast(this.resolvedDataDoc[key], Doc) instanceof Doc && keyList.push(key));
        if (keyList.indexOf(this.fieldKey) !== -1) {
            keyList.splice(keyList.indexOf(this.fieldKey), 1);
        }
        keyList.splice(0, 0, this.fieldKey);
        return keyList;
    }
    /**
     * Renders the EditableView title element for placement into the tree.
     */
    renderTitle() {
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = SetupDrag(reference, () => this.resolvedDataDoc, this.move, this.props.dropAction, this.props.treeViewId, true);

        let headerElements = (
            <span className="collectionTreeView-keyHeader" key={this._chosenKey}
                onPointerDown={action(() => {
                    let ind = this.keyList.indexOf(this._chosenKey);
                    ind = (ind + 1) % this.keyList.length;
                    this.__chosenKey = this.keyList[ind];
                })} >
                {this._chosenKey}
            </span>);
        let dataDocs = CollectionDockingView.Instance ? Cast(CollectionDockingView.Instance.props.Document[this.fieldKey], listSpec(Doc), []) : [];
        let openRight = dataDocs && dataDocs.indexOf(this.resolvedDataDoc) !== -1 ? (null) : (
            <div className="treeViewItem-openRight" onPointerDown={this.onPointerDown} onClick={this.openRight}>
                <FontAwesomeIcon icon="angle-right" size="lg" />
            </div>);
        return <>
            <div className="docContainer" id={`docContainer-${this.props.parentKey}`} ref={reference} onPointerDown={onItemDown}
                style={{
                    background: BoolCast(this.props.document.protoBrush, false) ? "#06123232" : BoolCast(this.props.document.libraryBrush, false) ? "#06121212" : "0",
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
            ContextMenu.Instance.addItem({ description: "Open as Workspace", event: undoBatch(() => MainView.Instance.openWorkspace(this.resolvedDataDoc)) });
            ContextMenu.Instance.addItem({ description: "Open Fields", event: () => { let kvp = Docs.KVPDocument(this.props.document, { width: 300, height: 300 }); this.props.addDocTab(kvp, kvp, "onRight"); }, icon: "layer-group" });
            if (NumCast(this.props.document.viewType) !== CollectionViewType.Docking) {
                ContextMenu.Instance.addItem({ description: "Open Tab", event: () => this.props.addDocTab(this.props.document, this.resolvedDataDoc, "inTab"), icon: "folder" });
                ContextMenu.Instance.addItem({ description: "Open Right", event: () => this.props.addDocTab(this.props.document, this.resolvedDataDoc, "onRight"), icon: "caret-square-right" });
                if (DocumentManager.Instance.getDocumentViews(this.resolvedDataDoc).length) {
                    ContextMenu.Instance.addItem({ description: "Focus", event: () => DocumentManager.Instance.getDocumentViews(this.resolvedDataDoc).map(view => view.props.focus(this.props.document)) });
                }
                ContextMenu.Instance.addItem({ description: "Delete Item", event: undoBatch(() => this.props.deleteDoc(this.props.document)) });
            } else {
                ContextMenu.Instance.addItem({ description: "Delete Workspace", event: undoBatch(() => this.props.deleteDoc(this.props.document)) });
            }
            ContextMenu.Instance.displayMenu(e.pageX > 156 ? e.pageX - 156 : 0, e.pageY - 15);
            e.stopPropagation();
        }
    }
    treeDrop = (e: Event, de: DragManager.DropEvent) => {
        let x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        let inside = x[0] > bounds[0] + 75 || (!before && !this._collapsed);
        if (de.data instanceof DragManager.DocumentDragData) {
            let addDoc = (doc: Doc) => this.props.addDocument(doc, this.resolvedDataDoc, before);
            if (inside) {
                let docList = Cast(this.resolvedDataDoc.data, listSpec(Doc));
                if (docList !== undefined) {
                    addDoc = (doc: Doc) => { docList && docList.push(doc); return true; };
                }
            }
            e.stopPropagation();
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

    render() {
        let contentElement: (JSX.Element | null) = null;
        let docList = Cast(this.resolvedDataDoc[this._chosenKey], listSpec(Doc));
        let remDoc = (doc: Doc) => this.remove(doc, this._chosenKey);
        let addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => Doc.AddDocToList(this.resolvedDataDoc, this._chosenKey, doc, addBefore, before);
        let doc = Cast(this.resolvedDataDoc[this._chosenKey], Doc);
        let docWidth = () => NumCast(this.props.document.nativeWidth) ? Math.min(this.props.document[WidthSym](), this.props.panelWidth() - 5) : this.props.panelWidth() - 5;
        if (!this._collapsed) {
            if (!this.props.document.embed) {
                contentElement = <ul key={this._chosenKey + "more"}>
                    {TreeView.GetChildElements(doc instanceof Doc ? [doc] : DocListCast(docList), this.props.treeViewId, this.props.document, this.props.dataDoc, this._chosenKey, addDoc, remDoc, this.move,
                        this.props.dropAction, this.props.addDocTab, this.props.ScreenToLocalTransform, this.props.outerXf, this.props.active, this.props.panelWidth, this.props.renderDepth)}
                </ul >;
            } else {
                console.log("PW = " + this.props.panelWidth());
                contentElement = <div ref={this._dref} style={{ display: "inline-block", height: this.props.panelHeight() }} key={this.props.document[Id]}>
                    <CollectionSchemaPreview
                        Document={this.props.document}
                        DataDocument={this.resolvedDataDoc}
                        renderDepth={this.props.renderDepth}
                        width={docWidth}
                        height={this.props.panelHeight}
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
        addDocTab: (doc: Doc, dataDoc: Doc, where: string) => void,
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
        if (!e.isPropagationStopped() && this.props.Document.excludeFromLibrary) { // excludeFromLibrary means this is the user document
            ContextMenu.Instance.addItem({ description: "Create Workspace", event: undoBatch(() => MainView.Instance.createNewWorkspace()) });
            ContextMenu.Instance.addItem({ description: "Delete Workspace", event: undoBatch(() => this.remove(this.props.Document)) });
        }
    }

    @computed get resolvedDataDoc() { return BoolCast(this.props.Document.isTemplate) && this.props.DataDoc ? this.props.DataDoc : this.props.Document; }

    outerXf = () => Utils.GetScreenTransform(this._mainEle!);
    onTreeDrop = (e: React.DragEvent) => this.onDrop(e, {});

    render() {
        let dropAction = StrCast(this.props.Document.dropAction) as dropActionType;
        let addDoc = (doc: Doc, relativeTo?: Doc, before?: boolean) => Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc, relativeTo, before);
        let moveDoc = (d: Doc, target: Doc, addDoc: (doc: Doc) => boolean) => this.props.moveDocument(d, target, addDoc);

        return !this.childDocs ? (null) : (
            <div id="body" className="collectionTreeView-dropTarget"
                style={{ overflow: "auto" }}
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
                        let doc = Docs.FreeformDocument([], { title: "", x: 0, y: 0, width: 100, height: 25, templates: new List<string>([Templates.Title.Layout]) });
                        TreeView.loadId = doc[Id];
                        Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc, this.childDocs.length ? this.childDocs[0] : undefined, true);
                    }} />
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