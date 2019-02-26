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


    // TODO this will eventually come with functions for what to attach to them
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
     * Renders a single child document. If this child is a collection, it will call renderTreeView again. Otherwise, it will just append a list element.
     * @param childDocument The document to render.
     */
    renderChild(childDocument: Document) {
        let reference = React.createRef<HTMLDivElement>();
        var children = childDocument.GetT<ListField<Document>>(KeyStore.Data, ListField);
        let title = childDocument.GetT<TextField>(KeyStore.Title, TextField);
        let onItemDown = setupDrag(reference, () => childDocument);

        // if the title hasn't loaded, immediately return the div
        if (!title || title === "<Waiting>") {
            return <div key={childDocument.Id}></div>;
        }

        // set up the title element, which will be rendered the same way for everyone
        let titleElement = <EditableView contents={title.Data}
            height={36} GetValue={() => {
                let title = childDocument.GetT<TextField>(KeyStore.Title, TextField);
                if (title && title !== "<Waiting>")
                    return title.Data;
                return "";
            }} SetValue={(value: string) => {
                childDocument.SetData(KeyStore.Title, value, TextField);
                return true;
            }} />

        // otherwise, check if it's a collection.
        if (children && children !== "<Waiting>") {
            // if it's not collapsed, then render the full TreeView.
            var subView = null;

            if (!this.collapsed) {
                subView =
                    <li key={childDocument.Id} >
                        {this.renderBullet(BulletType.Collapsible)}
                        {titleElement}
                        <ul key={childDocument.Id}>
                            <TreeView document={childDocument} />
                        </ul>
                    </li>
            } else {
                subView = <li key={childDocument.Id}>
                    {this.renderBullet(BulletType.Collapsed)}
                    {titleElement}
                </li>
            }

            return <div className="treeViewItem-container" onPointerDown={onItemDown} ref={reference}>
                {subView}
            </div>
        }

        // finally, if it's a normal document, then render it as such.
        else {
            return <li key={childDocument.Id}>
                {this.renderBullet(BulletType.List)}
                {titleElement}
            </li>;
        }
    }

    render() {
        var children = this.props.document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        return !children || children === FieldWaiting ? (null) :
            (children.Data.map(value =>
                <div key={value.Id}>
                    {this.renderChild(value)}
                </div>)
            )
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
                    <TreeView
                        document={this.props.Document}
                    />
                </ul>
            </div >
        );
    }
}