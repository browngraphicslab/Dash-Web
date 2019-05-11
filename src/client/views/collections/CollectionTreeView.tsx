import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faCaretDown, faCaretRight, faTrashAlt, faAngleRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, trace } from "mobx";
import { observer } from "mobx-react";
import { DragManager, SetupDrag, dropActionType } from "../../util/DragManager";
import { EditableView } from "../EditableView";
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionTreeView.scss";
import React = require("react");
import { Document, listSpec } from '../../../new_fields/Schema';
import { Cast, StrCast, BoolCast, FieldValue } from '../../../new_fields/Types';
import { Doc, DocListCast } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/RefField';
import { ContextMenu } from '../ContextMenu';
import { undoBatch } from '../../util/UndoManager';
import { Main } from '../Main';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { CollectionDockingView } from './CollectionDockingView';
import { DocumentManager } from '../../util/DocumentManager';
import { List } from '../../../new_fields/List';


export interface TreeViewProps {
    document: Doc;
    deleteDoc: (doc: Doc) => void;
    moveDocument: DragManager.MoveFunction;
    dropAction: "alias" | "copy" | undefined;
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

    @observable _collapsed: boolean = true;

    @undoBatch delete = () => this.props.deleteDoc(this.props.document);

    @undoBatch openRight = async () => {
        if (this.props.document.dockingConfig) {
            Main.Instance.openWorkspace(this.props.document);
        } else {
            CollectionDockingView.Instance.AddRightSplit(this.props.document);
        }
    };

    get children() {
        return Cast(this.props.document.data, listSpec(Doc), []); // bcz: needed?    .filter(doc => FieldValue(doc));
    }

    onPointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    }

    @action
    remove = (document: Document, key: string) => {
        let children = Cast(this.props.document[key], listSpec(Doc), []);
        if (children) {
            children.splice(children.indexOf(document), 1);
        }
    }

    @action
    move: DragManager.MoveFunction = (document, target, addDoc) => {
        if (this.props.document === target) {
            return true;
        }
        //TODO This should check if it was removed
        this.remove(document, "data");
        return addDoc(document);
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

    /**
     * Renders the EditableView title element for placement into the tree.
     */
    renderTitle() {
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = SetupDrag(reference, () => this.props.document, this.props.moveDocument, this.props.dropAction);
        let editableView = (titleString: string) =>
            (<EditableView
                display={"inline"}
                contents={titleString}
                height={36}
                GetValue={() => StrCast(this.props.document.title)}
                SetValue={(value: string) => {
                    let target = this.props.document.proto ? this.props.document.proto : this.props.document;
                    target.title = value;
                    return true;
                }}
            />);
        let dataDocs = Cast(CollectionDockingView.Instance.props.Document.data, listSpec(Doc), []);
        let openRight = dataDocs && dataDocs.indexOf(this.props.document) !== -1 ? (null) : (
            <div className="treeViewItem-openRight" onPointerDown={this.onPointerDown} onClick={this.openRight}>
                <FontAwesomeIcon icon="angle-right" size="lg" />
                <FontAwesomeIcon icon="angle-right" size="lg" />
            </div>);
        return (
            <div className="docContainer" ref={reference} onPointerDown={onItemDown}
                style={{ background: BoolCast(this.props.document.libraryBrush, false) ? "#06121212" : "0" }}
                onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                {editableView(StrCast(this.props.document.title))}
                {openRight}
                {/* {<div className="delete-button" onClick={this.delete}><FontAwesomeIcon icon="trash-alt" size="xs" /></div>} */}
            </div >);
    }

    onWorkspaceContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Open as Workspace", event: undoBatch(() => Main.Instance.openWorkspace(this.props.document)) });
            ContextMenu.Instance.addItem({ description: "Open Right", event: () => CollectionDockingView.Instance.AddRightSplit(this.props.document) });
            if (DocumentManager.Instance.getDocumentViews(this.props.document).length) {
                ContextMenu.Instance.addItem({ description: "Focus", event: () => DocumentManager.Instance.getDocumentViews(this.props.document).map(view => view.props.focus(this.props.document)) });
            }
            ContextMenu.Instance.addItem({
                description: "Delete", event: undoBatch(() => {
                    this.props.deleteDoc(this.props.document);
                })
            });
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
            e.stopPropagation();
        }
    }

    onPointerEnter = (e: React.PointerEvent): void => { this.props.document.libraryBrush = true; };
    onPointerLeave = (e: React.PointerEvent): void => { this.props.document.libraryBrush = false; };

    render() {
        let bulletType = BulletType.List;
        let contentElement: (JSX.Element | null)[] = [];
        let keys = Array.from(Object.keys(this.props.document));
        if (this.props.document.proto instanceof Doc) {
            keys.push(...Array.from(Object.keys(this.props.document.proto)));
            while (keys.indexOf("proto") !== -1) keys.splice(keys.indexOf("proto"), 1);
        }
        keys.map(key => {
            let docList = DocListCast(this.props.document[key]);
            let doc = Cast(this.props.document[key], Doc);
            if (doc instanceof Doc || docList.length) {
                if (!this._collapsed) {
                    bulletType = BulletType.Collapsible;
                    let spacing = (key === "data") ? 0 : -10;
                    contentElement.push(<ul key={key + "more"}>
                        {(key === "data") ? (null) :
                            <span className="collectionTreeView-keyHeader" style={{ display: "block", marginTop: "7px" }} key={key}>{key}</span>}
                        <div style={{ display: "block", marginTop: `${spacing}px` }}>
                            {TreeView.GetChildElements(doc instanceof Doc ? [doc] : docList, key !== "data", (doc: Doc) => this.remove(doc, key), this.move, this.props.dropAction)}
                        </div>
                    </ul >);
                } else
                    bulletType = BulletType.Collapsed;
            }
        });
        return <div className="treeViewItem-container"
            onContextMenu={this.onWorkspaceContextMenu}>
            <li className="collection-child">
                {this.renderBullet(bulletType)}
                {this.renderTitle()}
                {contentElement}
            </li>
        </div>;
    }
    public static GetChildElements(docs: Doc[], allowMinimized: boolean, remove: ((doc: Doc) => void), move: DragManager.MoveFunction, dropAction: dropActionType) {
        return docs.filter(child => child instanceof Doc && !child.excludeFromLibrary && (allowMinimized || !child.isMinimized)).filter(doc => FieldValue(doc)).map(child =>
            <TreeView document={child as Doc} key={(child as Doc)[Id]} deleteDoc={remove} moveDocument={move} dropAction={dropAction} />);
    }
}

@observer
export class CollectionTreeView extends CollectionSubView(Document) {
    @action
    remove = (document: Document) => {
        let children = Cast(this.props.Document.data, listSpec(Doc), []);
        if (children) {
            children.splice(children.indexOf(document), 1);
        }
    }
    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Create Workspace", event: undoBatch(() => Main.Instance.createNewWorkspace()) });
        }
        if (!ContextMenu.Instance.getItems().some(item => item.description === "Delete")) {
            ContextMenu.Instance.addItem({ description: "Delete", event: undoBatch(() => this.remove(this.props.Document)) });
        }
    }
    render() {
        let dropAction = StrCast(this.props.Document.dropAction, "alias") as dropActionType;
        if (!this.children) {
            return (null);
        }
        let childElements = TreeView.GetChildElements(this.children, false, this.remove, this.props.moveDocument, dropAction);

        return (
            <div id="body" className="collectionTreeView-dropTarget"
                style={{ borderRadius: "inherit" }}
                onContextMenu={this.onContextMenu}
                onWheel={(e: React.WheelEvent) => e.stopPropagation()}
                onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createDropTarget}>
                <div className="coll-title">
                    <EditableView
                        contents={this.props.Document.title}
                        display={"inline"}
                        height={72}
                        GetValue={() => StrCast(this.props.Document.title)}
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