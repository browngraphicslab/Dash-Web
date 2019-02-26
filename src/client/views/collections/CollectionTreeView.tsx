import { observer } from "mobx-react";
import { CollectionViewBase } from "./CollectionViewBase";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import React = require("react")
import { TextField } from "../../../fields/TextField";
import { observable, action } from "mobx";
import "./CollectionTreeView.scss";
import { setupDrag } from "../../util/DragManager";
import { FieldWaiting } from "../../../fields/Field";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";

export interface TreeViewProps {
    document: Document;
}

@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class TreeView extends React.Component<TreeViewProps> {

    @observable
    collapsed: boolean = false;

    /**
     * Renders a single child document. If this child is a collection, it will call renderTreeView again. Otherwise, it will just append a list element.
     * @param childDocument The document to render.
     */
    renderChild(childDocument: Document) {
        let reference = React.createRef<HTMLDivElement>();

        var children = childDocument.GetT<ListField<Document>>(KeyStore.Data, ListField);
        let title = childDocument.GetT<TextField>(KeyStore.Title, TextField);
        let onItemDown = setupDrag(reference, childDocument);

        if (title && title != FieldWaiting) {
            let subView = !children || this.collapsed || children === FieldWaiting ? (null) :
                <ul>
                    <TreeView document={childDocument} />
                </ul>;
            return <div className="treeViewItem-container" onPointerDown={onItemDown} ref={reference}>
                <li className={!children ? "leaf" : this.collapsed ? "collapsed" : "uncollapsed"}
                    onClick={action(() => this.collapsed = !this.collapsed)} >
                    {title.Data}
                    {subView}
                </li>
            </div>
        }
        return (null);
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
            <div className="collectionTreeView-dropTarget" onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createDropTarget} style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }} >
                <h3>{titleStr}</h3>
                <ul className="no-indent">
                    <TreeView
                        document={this.props.Document}
                    />
                </ul>
            </div>
        );
    }
}