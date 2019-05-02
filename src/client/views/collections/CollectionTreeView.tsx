import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faCaretDown, faCaretRight, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DragManager, SetupDrag } from "../../util/DragManager";
import { EditableView } from "../EditableView";
import { CollectionSubView } from "./CollectionSubView";
import "./CollectionTreeView.scss";
import React = require("react");
import { Document, listSpec } from '../../../new_fields/Schema';
import { Cast, StrCast, BoolCast, FieldValue } from '../../../new_fields/Types';
import { Doc } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/RefField';
import { Utils } from '../../../Utils';
import { JSXElement } from 'babel-types';
import { ContextMenu } from '../ContextMenu';
import { undoBatch } from '../../util/UndoManager';
import { Main } from '../Main';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';


export interface TreeViewProps {
    document: Doc;
    deleteDoc: (doc: Doc) => void;
    moveDocument: DragManager.MoveFunction;
    copyOnDrag: boolean;
}

export enum BulletType {
    Collapsed,
    Collapsible,
    List
}

library.add(faTrashAlt);
library.add(faCaretDown);
library.add(faCaretRight);

@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class TreeView extends React.Component<TreeViewProps> {

    @observable _collapsed: boolean = true;

    delete = () => this.props.deleteDoc(this.props.document);

    get children() {
        return Cast(this.props.document.data, listSpec(Doc), []).filter(doc => FieldValue(doc));
    }

    @action
    remove = (document: Document) => {
        if (this.children) {
            this.children.splice(this.children.indexOf(document), 1);
        }
    }

    @action
    move: DragManager.MoveFunction = (document, target, addDoc) => {
        if (this.props.document === target) {
            return true;
        }
        //TODO This should check if it was removed
        this.remove(document);
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
        let onItemDown = SetupDrag(reference, () => this.props.document, this.props.moveDocument, this.props.copyOnDrag);
        let editableView = (titleString: string) =>
            (<EditableView
                display={"inline"}
                contents={titleString}
                height={36}
                GetValue={() => StrCast(this.props.document.title)}
                SetValue={(value: string) => {
                    this.props.document.title = value;
                    return true;
                }}
            />);
        return (
            <div className="docContainer" ref={reference} onPointerDown={onItemDown}>
                {editableView(StrCast(this.props.document.title))}
                <div className="delete-button" onClick={this.delete}><FontAwesomeIcon icon="trash-alt" size="xs" /></div>
            </div >);
    }

    onWorkspaceContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            if (!ContextMenu.Instance.getItems().some(item => item.description === "Open as Workspace")) {
                ContextMenu.Instance.addItem({ description: "Open as Workspace", event: undoBatch(() => Main.Instance.openWorkspace(this.props.document)) });
            }
        }
    }
    render() {
        let bulletType = BulletType.List;
        let contentElement: JSX.Element | null = (null);
        var children = Cast(this.props.document.data, listSpec(Doc));
        if (children) { // add children for a collection
            if (!this._collapsed) {
                bulletType = BulletType.Collapsible;
                contentElement = <ul>
                    {TreeView.GetChildElements(children, this.remove, this.move, this.props.copyOnDrag)}
                </ul >;
            }
            else bulletType = BulletType.Collapsed;
        }
        return <div className="treeViewItem-container" onContextMenu={this.onWorkspaceContextMenu} >
            <li className="collection-child">
                {this.renderBullet(bulletType)}
                {this.renderTitle()}
                {contentElement}
            </li>
        </div>;
    }
    public static GetChildElements(docs: Doc[], remove: ((doc: Doc) => void), move: DragManager.MoveFunction, copyOnDrag: boolean) {
        return docs.filter(child => !child.excludeFromLibrary).map(child =>
            <TreeView document={child} key={child[Id]} deleteDoc={remove} moveDocument={move} copyOnDrag={copyOnDrag} />);
    }
}

@observer
export class CollectionTreeView extends CollectionSubView(Document) {

    @action
    remove = (document: Document) => {
        const children = this.children;
        if (children) {
            children.splice(children.indexOf(document), 1);
        }
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Create Workspace", event: undoBatch(() => Main.Instance.createNewWorkspace()) });
        }
    }
    render() {
        const children = this.children;
        let copyOnDrag = BoolCast(this.props.Document.copyDraggedItems, false);
        if (!children) {
            return (null);
        }
        let testForLibrary = children && children.length === 1 && children[0] === CurrentUserUtils.UserDocument;
        var subchildren = testForLibrary ? Cast(children[0].data, listSpec(Doc), children) : children;
        let childElements = TreeView.GetChildElements(subchildren, this.remove, this.props.moveDocument, copyOnDrag);

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
                            this.props.Document.title = value;
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