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

export interface TreeViewProps {
    document: Document;
}

export enum BulletType {
    Collapsed,
    Collapsible,
    List
}

@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class TreeView extends React.Component<TreeViewProps> {

    @observable
    collapsed: boolean = false;

    renderBullet(type: BulletType) {
        let onClicked = action(() => this.collapsed = !this.collapsed);

        switch (type) {
            case BulletType.Collapsed:
                return <div className="bullet" onClick={onClicked}>&#9654;</div>
            case BulletType.Collapsible:
                return <div className="bullet" onClick={onClicked}>&#9660;</div>
            case BulletType.List:
                return <div className="bullet">&mdash;</div>
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

        return <EditableView contents={title.Data}
            height={36} GetValue={() => {
                let title = this.props.document.GetT<TextField>(KeyStore.Title, TextField);
                if (title && title !== "<Waiting>")
                    return title.Data;
                return "";
            }} SetValue={(value: string) => {
                this.props.document.SetData(KeyStore.Title, value, TextField);
                return true;
            }} />
    }

    render() {
        var children = this.props.document.GetT<ListField<Document>>(KeyStore.Data, ListField);

        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = setupDrag(reference, () => this.props.document);
        let titleElement = this.renderTitle();

        // check if this document is a collection
        if (children && children !== FieldWaiting) {
            var subView = null;

            // render all children elements
            let childrenElement = (children.Data.map(value =>
                <TreeView document={value} />)
            )

            // if uncollapsed, then add the children elements
            if (!this.collapsed) {
                subView =
                    <li key={this.props.document.Id} >
                        {this.renderBullet(BulletType.Collapsible)}
                        {titleElement}
                        <ul key={this.props.document.Id}>
                            {childrenElement}
                        </ul>
                    </li>
            } else {
                subView = <li key={this.props.document.Id}>
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

    render() {
        let titleStr = "";
        let title = this.props.Document.GetT<TextField>(KeyStore.Title, TextField);
        if (title && title !== FieldWaiting) {
            titleStr = title.Data;
        }

        var children = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        let childrenElement = !children || children === FieldWaiting ? (null) :
            (children.Data.map(value =>
                <TreeView document={value} />)
            )

        return (
            <div id="body" className="collectionTreeView-dropTarget" onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createDropTarget} style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }}>
                <h3>
                    <EditableView contents={titleStr}
                        height={72} GetValue={() => {
                            let title = this.props.Document.GetT<TextField>(KeyStore.Title, TextField);
                            if (title && title !== "<Waiting>")
                                return title.Data;
                            return "";
                        }} SetValue={(value: string) => {
                            this.props.Document.SetData(KeyStore.Title, value, TextField);
                            return true;
                        }} />
                </h3>
                <ul className="no-indent">
                    {childrenElement}
                </ul>
            </div >
        );
    }
}