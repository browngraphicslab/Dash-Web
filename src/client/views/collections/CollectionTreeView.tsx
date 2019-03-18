import { observer } from "mobx-react";
import { CollectionViewBase } from "./CollectionViewBase";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import React = require("react")
import { TextField } from "../../../fields/TextField";
import { observable, action } from "mobx";
import "./CollectionTreeView.scss";
import { EditableView } from "../EditableView";
import { setupDrag } from "../../util/DragManager";
import { FieldWaiting } from "../../../fields/Field";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";

import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashAlt, faCaretRight, faCaretDown } from '@fortawesome/free-solid-svg-icons';

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

    @observable
    collapsed: boolean = false;

    delete = () => {
        this.props.deleteDoc(this.props.document);
    }


    @action
    remove = (document: Document) => {
        var children = this.props.document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        if (children && children !== FieldWaiting) {
            children.Data.splice(children.Data.indexOf(document), 1);
        }
    }

    renderBullet(type: BulletType) {
        let onClicked = action(() => this.collapsed = !this.collapsed);

        switch (type) {
            case BulletType.Collapsed:
                return <div className="bullet" onClick={onClicked}><FontAwesomeIcon icon="caret-right" /></div>
            case BulletType.Collapsible:
                return <div className="bullet" onClick={onClicked}><FontAwesomeIcon icon="caret-down" /></div>
            case BulletType.List:
                return <div className="bullet"></div>
        }
    }

    /**
     * Renders the EditableView title element for placement into the tree.
     */
    renderTitle() {
        let title = this.props.document.GetT<TextField>(KeyStore.Title, TextField);

        // if the title hasn't loaded, immediately return the div
        if (!title || title === "<Waiting>") {
            return <div key={this.props.document.Id}></div>;
        }

        return <div className="docContainer"> <EditableView
            display={"inline"}
            contents={title.Data}
            height={36} GetValue={() => {
                let title = this.props.document.GetT<TextField>(KeyStore.Title, TextField);
                if (title && title !== "<Waiting>")
                    return title.Data;
                return "";
            }} SetValue={(value: string) => {
                this.props.document.SetData(KeyStore.Title, value, TextField);
                return true;
            }} />
            <div className="delete-button" onClick={this.delete}><FontAwesomeIcon icon="trash-alt" size="xs" /></div>
        </div >
    }

    render() {
        var children = this.props.document.GetT<ListField<Document>>(KeyStore.Data, ListField);

        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = setupDrag(reference, () => this.props.document);
        let titleElement = this.renderTitle();

        // check if this document is a collection
        if (children && children !== FieldWaiting) {
            let subView;

            // if uncollapsed, then add the children elements
            if (!this.collapsed) {
                // render all children elements
                let childrenElement = (children.Data.map(value =>
                    <TreeView document={value} deleteDoc={this.remove} />)
                )
                subView =
                    <li className="collection-child" key={this.props.document.Id} >
                        {this.renderBullet(BulletType.Collapsible)}
                        {titleElement}
                        <ul key={this.props.document.Id}>
                            {childrenElement}
                        </ul>
                    </li>
            } else {
                subView = <li className="collection-child" key={this.props.document.Id}>
                    {this.renderBullet(BulletType.Collapsed)}
                    {titleElement}
                </li>
            }

            return <div className="treeViewItem-container" onPointerDown={onItemDown} ref={reference}>
                {subView}
            </div>
        }

        // otherwise this is a normal leaf node
        else {
            return <li key={this.props.document.Id}>
                {this.renderBullet(BulletType.List)}
                {titleElement}
            </li>;
        }
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
        let titleStr = "";
        let title = this.props.Document.GetT<TextField>(KeyStore.Title, TextField);
        if (title && title !== FieldWaiting) {
            titleStr = title.Data;
        }

        var children = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        let childrenElement = !children || children === FieldWaiting ? (null) :
            (children.Data.map(value =>
                <TreeView document={value} key={value.Id} deleteDoc={this.remove} />)
            )

        return (
            <div id="body" className="collectionTreeView-dropTarget" onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createDropTarget} style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }}>
                <div className="coll-title">
                    <EditableView contents={titleStr}
                        display={"inline"}
                        height={72} GetValue={() => {
                            return this.props.Document.Title;
                        }} SetValue={(value: string) => {
                            this.props.Document.SetData(KeyStore.Title, value, TextField);
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