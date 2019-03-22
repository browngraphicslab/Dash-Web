import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faCaretDown, faCaretRight, faTrashAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, trace } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { setupDrag } from "../../util/DragManager";
import { EditableView } from "../EditableView";
import "./CollectionTreeView.scss";
import { CollectionView, COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { CollectionViewBase } from "./CollectionViewBase";
import React = require("react")


export interface TreeViewProps {
    document: Document;
    deleteDoc: (doc: Document) => void;
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

    @action
    remove = (document: Document) => {
        var children = this.props.document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        if (children && children !== FieldWaiting) {
            children.Data.splice(children.Data.indexOf(document), 1);
        }
    }

    renderBullet(type: BulletType) {
        let onClicked = action(() => this._collapsed = !this._collapsed);
        let bullet: IconProp | undefined = undefined;
        switch (type) {
            case BulletType.Collapsed: bullet = "caret-right"; break;
            case BulletType.Collapsible: bullet = "caret-down"; break;
        }
        return <div className="bullet" onClick={onClicked}>{bullet ? <FontAwesomeIcon icon={bullet} /> : ""} </div>
    }

    /**
     * Renders the EditableView title element for placement into the tree.
     */
    renderTitle() {
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = setupDrag(reference, () => this.props.document, (containingCollection: CollectionView) => this.props.deleteDoc(this.props.document));
        let editableView = (titleString: string) =>
            (<EditableView
                display={"inline"}
                contents={titleString}
                height={36}
                GetValue={() => this.props.document.Title}
                SetValue={(value: string) => {
                    this.props.document.SetText(KeyStore.Title, value);
                    return true;
                }}
            />);
        return (
            <div className="docContainer" ref={reference} onPointerDown={onItemDown}>
                {editableView(this.props.document.Title)}
                <div className="delete-button" onClick={this.delete}><FontAwesomeIcon icon="trash-alt" size="xs" /></div>
            </div >)
    }

    render() {
        let bulletType = BulletType.List;
        let childElements: JSX.Element | undefined = undefined;

        var children = this.props.document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        if (children && children !== FieldWaiting) { // add children for a collection
            if (!this._collapsed) {
                bulletType = BulletType.Collapsible;
                childElements = <ul>
                    {children.Data.map(value => <TreeView key={value.Id} document={value} deleteDoc={this.remove} />)}
                </ul>
            }
            else bulletType = BulletType.Collapsed;
        }
        return <div className="treeViewItem-container" >
            <li className="collection-child">
                {this.renderBullet(bulletType)}
                {this.renderTitle()}
                {childElements ? childElements : (null)}
            </li>
        </div>
    }
}

@observer
export class CollectionTreeView extends CollectionViewBase {

    @action
    remove = (document: Document) => {
        var children = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        if (children && children !== FieldWaiting) {
            children.Data.splice(children.Data.indexOf(document), 1);
        }
    }

    render() {
        var children = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        let childrenElement = !children || children === FieldWaiting ? (null) :
            (children.Data.map(value =>
                <TreeView document={value} key={value.Id} deleteDoc={this.remove} />)
            )

        return (
            <div id="body" className="collectionTreeView-dropTarget" onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createDropTarget} style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }}>
                <div className="coll-title">
                    <EditableView
                        contents={this.props.Document.Title}
                        display={"inline"}
                        height={72}
                        GetValue={() => this.props.Document.Title}
                        SetValue={(value: string) => {
                            this.props.Document.SetText(KeyStore.Title, value);
                            return true;
                        }} />
                </div>
                <hr />
                <ul className="no-indent">
                    {childrenElement}
                </ul>
            </div >
        );
    }
}