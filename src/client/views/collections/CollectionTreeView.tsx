import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faAngleRight, faCaretDown, faCaretRight, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, trace, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, WidthSym, HeightSym } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { Document, listSpec } from '../../../new_fields/Schema';
import { BoolCast, Cast, NumCast, StrCast, PromiseValue } from '../../../new_fields/Types';
import { Docs } from '../../documents/Documents';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager, dropActionType, SetupDrag } from "../../util/DragManager";
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from '../ContextMenu';
import { EditableView } from "../EditableView";
import { MainView } from '../MainView';
import { CollectionViewType } from './CollectionBaseView';
import { CollectionDockingView } from './CollectionDockingView';
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import "./CollectionTreeView.scss";
import React = require("react");
import { Transform } from '../../util/Transform';
import { SelectionManager } from '../../util/SelectionManager';
import { emptyFunction, returnFalse, Utils, returnOne, returnZero } from '../../../Utils';
import { List } from '../../../new_fields/List';
import { Templates } from '../Templates';
import { DocumentView, DocumentViewProps } from '../nodes/DocumentView';
import { number } from 'prop-types';
import ReactTable from 'react-table';
import { MainOverlayTextBox } from '../MainOverlayTextBox';


export interface TreeViewProps {
    document: Doc;
    deleteDoc: (doc: Doc) => void;
    moveDocument: DragManager.MoveFunction;
    dropAction: "alias" | "copy" | undefined;
    addDocTab: (doc: Doc, where: string) => void;
    panelWidth: () => number;
    panelHeight: () => number;
    addDocument: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean;
    indentDocument?: () => void;
    ScreenToLocalTransform: () => Transform;
    outerXf: () => number[];
    treeViewId: string;
    parentKey: string;
    active: () => boolean;
}

export enum BulletType {
    Collapsed,
    Collapsible,
    List
}

library.add(faTrashAlt);
library.add(faAngleRight);
library.add(faCaretDown);
library.add(faCaretRight);

@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class TreeView extends React.Component<TreeViewProps> {
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private treedropDisposer?: DragManager.DragDropDisposer;
    private _mainEle?: HTMLDivElement;
    protected createTreeDropTarget = (ele: HTMLDivElement) => {
        this.treedropDisposer && this.treedropDisposer();
        if (ele) {
            this.treedropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.treeDrop.bind(this) } });
        }
        this._mainEle = ele;
    }

    @observable _isOver: boolean = false;
    @observable _collapsed: boolean = true;

    @undoBatch delete = () => this.props.deleteDoc(this.props.document);
    @undoBatch openRight = async () => this.props.addDocTab(this.props.document, "openRight");

    @action onMouseEnter = () => { this._isOver = true; };
    @action onMouseLeave = () => { this._isOver = false; };

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
        let inside = x[0] > bounds[0] + 75 || (!before && this._bulletType === BulletType.Collapsible);
        this._header!.current!.className = "treeViewItem-header";
        if (inside && this._bulletType !== BulletType.List) this._header!.current!.className += " treeViewItem-header-inside";
        else if (before) this._header!.current!.className += " treeViewItem-header-above";
        else if (!before) this._header!.current!.className += " treeViewItem-header-below";
        e.stopPropagation();
    }
    onPointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    }

    @action
    remove = (document: Document, key: string) => {
        let children = Cast(this.props.document[key], listSpec(Doc), []);
        children.indexOf(document) !== -1 && children.splice(children.indexOf(document), 1);
    }

    @action
    move: DragManager.MoveFunction = (document: Doc, target: Doc, addDoc) => {
        if (this.props.document !== target) {
            //TODO This should check if it was removed
            this.props.deleteDoc(document);
            return addDoc(document);
        }
        return true;
    }
    @action
    indent = () => {
        this.props.addDocument(this.props.document);
        this.delete();
    }


    renderBullet(type: BulletType) {
        let onClicked = action(() => this._collapsed = !this._collapsed);
        let bullet: IconProp | undefined = undefined;
        switch (type) {
            case BulletType.Collapsed: bullet = "caret-right"; break;
            case BulletType.Collapsible: bullet = "caret-down"; break;
        }
        return <div className="bullet" onClick={onClicked}>{bullet ? <FontAwesomeIcon icon={bullet} /> : ""} </div>;
    }
    static loadId = "";
    editableView = (key: string, style?: string) =>
        (<EditableView
            oneLine={true}
            display={"inline"}
            editing={this.props.document[Id] === TreeView.loadId}
            contents={StrCast(this.props.document[key])}
            height={36}
            fontStyle={style}
            GetValue={() => StrCast(this.props.document[key])}
            OnFillDown={(value: string) => {
                Doc.GetProto(this.props.document)[key] = value;
                let doc = Docs.FreeformDocument([], { title: "", x: 0, y: 0, width: 100, height: 25 });
                TreeView.loadId = doc[Id];
                doc.templates = new List<string>([Templates.Title.Layout]);
                this.props.addDocument(doc);
                return true;
            }}
            OnTab={() => this.props.indentDocument && this.props.indentDocument()}
            SetValue={(value: string) => {
                Doc.GetProto(this.props.document)[key] = value;
                return true;
            }}
        />)

    /**
     * Renders the EditableView title element for placement into the tree.
     */
    renderTitle() {
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = SetupDrag(reference, () => this.props.document, this.move, this.props.dropAction, this.props.treeViewId, true);

        let keyList: string[] = [];
        let keys = Array.from(Object.keys(this.props.document));
        if (this.props.document.proto instanceof Doc) {
            keys.push(...Array.from(Object.keys(this.props.document.proto)));
            while (keys.indexOf("proto") !== -1) keys.splice(keys.indexOf("proto"), 1);
        }
        if (keys.indexOf("data") !== -1) {
            keys.splice(keys.indexOf("data"), 1);
            keys.splice(0, 0, "data");
        }
        keys.map(key => {
            let docList = Cast(this.props.document[key], listSpec(Doc));
            let doc = Cast(this.props.document[key], Doc);
            if (doc instanceof Doc || (docList && (DocListCast(docList).length > 0 || key === "data"))) {
                keyList.push(key);
            }
        });
        let headerElements = this._bulletType === BulletType.List ? (null) : [this._chosenKey].map(key =>
            <span className="collectionTreeView-keyHeader" key={key} onPointerDown={action(() => { this._chosenKey = key; this.props.document.embed = !BoolCast(this.props.document.embed, false) })}
                style={{ background: key === this._chosenKey ? "lightgray" : undefined }}>
                {key}
            </span>);
        let dataDocs = CollectionDockingView.Instance ? Cast(CollectionDockingView.Instance.props.Document.data, listSpec(Doc), []) : [];
        let openRight = dataDocs && dataDocs.indexOf(this.props.document) !== -1 ? (null) : (
            <div className="treeViewItem-openRight" onPointerDown={this.onPointerDown} onClick={this.openRight}>
                <FontAwesomeIcon icon="angle-right" size="lg" />
                {/* <FontAwesomeIcon icon="angle-right" size="lg" /> */}
            </div>);
        return <>
            <div className="docContainer" id={`docContainer-${this.props.parentKey}`} ref={reference} onPointerDown={onItemDown} onMouseEnter={this.onMouseEnter} onMouseLeave={this.onMouseLeave}
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
            ContextMenu.Instance.addItem({ description: "Open as Workspace", event: undoBatch(() => MainView.Instance.openWorkspace(this.props.document)) });
            ContextMenu.Instance.addItem({ description: "Open Fields", event: () => this.props.addDocTab(Docs.KVPDocument(this.props.document, { width: 300, height: 300 }), "onRight"), icon: "layer-group" });
            if (NumCast(this.props.document.viewType) !== CollectionViewType.Docking) {
                ContextMenu.Instance.addItem({ description: "Open Tab", event: () => this.props.addDocTab(this.props.document, "inTab"), icon: "folder" });
                ContextMenu.Instance.addItem({ description: "Open Right", event: () => this.props.addDocTab(this.props.document, "onRight"), icon: "caret-square-right" });
                if (DocumentManager.Instance.getDocumentViews(this.props.document).length) {
                    ContextMenu.Instance.addItem({ description: "Focus", event: () => DocumentManager.Instance.getDocumentViews(this.props.document).map(view => view.props.focus(this.props.document)) });
                }
                ContextMenu.Instance.addItem({ description: "Delete Item", event: undoBatch(() => this.props.deleteDoc(this.props.document)) });
            } else {
                ContextMenu.Instance.addItem({ description: "Delete Workspace", event: undoBatch(() => this.props.deleteDoc(this.props.document)) });
            }
            ContextMenu.Instance.displayMenu(e.pageX - 156, e.pageY - 15);
            e.stopPropagation();
        }
    }
    treeDrop = (e: Event, de: DragManager.DropEvent) => {
        let x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        let inside = x[0] > bounds[0] + 75 || (!before && this._bulletType === BulletType.Collapsible);
        if (de.data instanceof DragManager.DocumentDragData) {
            let addDoc = (doc: Doc) => this.props.addDocument(doc, this.props.document, before);
            if (inside) {
                let docList = Cast(this.props.document.data, listSpec(Doc));
                if (docList !== undefined) {
                    addDoc = (doc: Doc) => { docList && docList.push(doc); return true; };
                }
            }
            let added = false;
            if (de.data.dropAction || de.data.userDropAction) {
                added = de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d, this.props.document, before) || added, false);
            } else if (de.data.moveDocument) {
                let movedDocs = de.data.options === this.props.treeViewId ? de.data.draggedDocuments : de.data.droppedDocuments;
                added = movedDocs.reduce((added: boolean, d) =>
                    de.data.moveDocument(d, this.props.document, addDoc) || added, false);
            } else {
                added = de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDocument(d, this.props.document, before), false);
            }
            e.stopPropagation();
            return added;
        }
        return false;
    }

    public static AddDocToList(target: Doc, key: string, doc: Doc, relativeTo?: Doc, before?: boolean) {
        let list = Cast(target[key], listSpec(Doc));
        if (list) {
            let ind = relativeTo ? list.indexOf(relativeTo) : -1;
            if (ind === -1) list.push(doc);
            else list.splice(before ? ind : ind + 1, 0, doc);
        }
        return true;
    }

    docTransform = () => {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(this._dref.current!);
        let outerXf = this.props.outerXf();
        let offset = this.props.ScreenToLocalTransform().transformDirection(outerXf[0] - translateX, outerXf[1] - translateY);
        let finalXf = this.props.ScreenToLocalTransform().translate(offset[0], offset[1]);
        return finalXf;
    }
    @observable _chosenKey: string = "data";
    _bulletType: BulletType = BulletType.List;

    _dref = React.createRef<HTMLDivElement>();
    render() {
        let bulletType = BulletType.List;
        let contentElement: (JSX.Element | null)[] = [];
        [this._chosenKey].map(key => {
            let docList = Cast(this.props.document[key], listSpec(Doc));
            let remDoc = (doc: Doc) => this.remove(doc, key);
            let addDoc = (doc: Doc, addBefore?: Doc, before?: boolean) => TreeView.AddDocToList(this.props.document, key, doc, addBefore, before);
            let doc = Cast(this.props.document[key], Doc);
            if (doc instanceof Doc || (docList && (DocListCast(docList).length > 0 || key === "data"))) {
                if (!this._collapsed) {
                    bulletType = BulletType.Collapsible;
                    if (this.props.document.embed) {
                        contentElement.push(
                            <div ref={this._dref} style={{ width: "max-content", display: "unset" }} key={this.props.document[Id]}>
                                <DocumentView Document={this.props.document}
                                    ContainingCollectionView={undefined}
                                    ScreenToLocalTransform={this.docTransform}
                                    isTopMost={false}
                                    useActualDimensions={true}
                                    ContentScaling={returnOne}
                                    PanelWidth={this.props.document[WidthSym]}
                                    PanelHeight={this.props.document[HeightSym]}
                                    focus={emptyFunction}
                                    selectOnLoad={false}
                                    parentActive={returnFalse}
                                    whenActiveChanged={emptyFunction}
                                    bringToFront={emptyFunction}
                                    addDocTab={this.props.addDocTab}
                                /></div>);
                    } else
                        contentElement.push(<ul key={key + "more"}>
                            <div style={{ display: "block" }}>
                                {TreeView.GetChildElements(doc instanceof Doc ? [doc] : DocListCast(docList), this.props.treeViewId, key, addDoc, remDoc, this.move,
                                    this.props.dropAction, this.props.addDocTab, this.props.ScreenToLocalTransform, this.props.outerXf, this.props.active, this.props.panelWidth, this.props.panelHeight)}
                            </div>
                        </ul >);
                } else {
                    bulletType = BulletType.Collapsed;
                }
            }
        });
        this._bulletType = bulletType;
        return <div className="treeViewItem-container"
            ref={this.createTreeDropTarget}
            onContextMenu={this.onWorkspaceContextMenu}>
            <li className="collection-child">
                <div className="treeViewItem-header" ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    {this.renderBullet(bulletType)}
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
        key: string,
        add: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean,
        remove: ((doc: Doc) => void),
        move: DragManager.MoveFunction,
        dropAction: dropActionType,
        addDocTab: (doc: Doc, where: string) => void,
        screenToLocalXf: () => Transform,
        outerXf: () => number[],
        active: () => boolean,
        panelWidth: () => number,
        panelHeight: () => number
    ) {
        let docList = docs.filter(child => !child.excludeFromLibrary && (key !== "data" || !child.isMinimized));
        return docList.map((child, i) => {
            let indent = i === 0 ? undefined : () => {
                if (StrCast(docList[i - 1].layout).indexOf("CollectionView") !== -1) {
                    let fieldKeysub = StrCast(docList[i - 1].layout).split("fieldKey")[1];
                    let fieldKey = fieldKeysub.split("\"")[1];
                    TreeView.AddDocToList(docList[i - 1], fieldKey, child);
                    remove(child);
                }
            }
            return <TreeView
                document={child}
                treeViewId={treeViewId}
                key={child[Id]}
                indentDocument={indent}
                deleteDoc={remove}
                addDocument={add}
                panelWidth={panelWidth}
                panelHeight={panelHeight}
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
        if (this.treedropDisposer) {
            this.treedropDisposer();
        }
        if (ele) {
            this.treedropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
        this._mainEle = ele;
    }

    @action
    remove = (document: Document) => {
        let children = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc), []);
        children.indexOf(document) !== -1 && children.splice(children.indexOf(document), 1);
    }
    onContextMenu = (e: React.MouseEvent): void => {
        // need to test if propagation has stopped because GoldenLayout forces a parallel react hierarchy to be created for its top-level layout
        if (!e.isPropagationStopped() && this.props.Document.excludeFromLibrary) { // excludeFromLibrary means this is the user document
            ContextMenu.Instance.addItem({ description: "Create Workspace", event: undoBatch(() => MainView.Instance.createNewWorkspace()) });
            ContextMenu.Instance.addItem({ description: "Delete Workspace", event: undoBatch(() => this.remove(this.props.Document)) });
        }
    }

    outerXf = () => {
        let outerXf = Utils.GetScreenTransform(this._mainEle!);
        return [outerXf.translateX, outerXf.translateY];
    }
    onTreeDrop = (e: React.DragEvent) => {
        this.onDrop(e, {});
    }
    render() {
        let dropAction = StrCast(this.props.Document.dropAction) as dropActionType;
        if (!this.childDocs) {
            return (null);
        }
        let addDoc = (doc: Doc, relativeTo?: Doc, before?: boolean) => TreeView.AddDocToList(this.props.Document, this.props.fieldKey, doc, relativeTo, before);
        let moveDoc = (d: Doc, target: Doc, addDoc: (doc: Doc) => boolean) => this.props.moveDocument(d, target, addDoc);
        let childElements = TreeView.GetChildElements(this.childDocs, this.props.Document[Id], this.props.fieldKey, addDoc, this.remove,
            moveDoc, dropAction, this.props.addDocTab, this.props.ScreenToLocalTransform, this.outerXf, this.props.active, this.props.PanelWidth, () => 25);

        return (
            <div id="body" className="collectionTreeView-dropTarget"
                style={{ borderRadius: "inherit" }}
                onContextMenu={this.onContextMenu}
                onWheel={(e: React.WheelEvent) => this.props.isSelected() && e.stopPropagation()}
                onDrop={this.onTreeDrop}
                ref={this.createTreeDropTarget}>
                <div className="coll-title">
                    <EditableView
                        contents={this.props.Document.title}
                        display={"inline"}
                        height={72}
                        GetValue={() => StrCast(this.props.Document.title)}
                        OnFillDown={(value: string) => {
                            let target = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
                            target.title = value;
                            let doc = Docs.FreeformDocument([], { title: "", x: 0, y: 0, width: 100, height: 25 });
                            TreeView.loadId = doc[Id];
                            doc.templates = new List<string>([Templates.Title.Layout]);
                            this.props.addDocument(doc);
                        }}
                        SetValue={(value: string) => {
                            let target = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
                            target.title = value;
                            return true;
                        }} />
                </div>
                <ul className="no-indent">
                    {childElements}
                </ul>
            </div >
        );
    }
}