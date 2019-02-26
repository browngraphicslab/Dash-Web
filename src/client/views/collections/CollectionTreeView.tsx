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
        switch (type) {
            case BulletType.Collapsed:
                return <div className="bullet">&#9654;</div>
            case BulletType.Collapsible:
                return <div className="bullet">&#9660;</div>
            case BulletType.List:
                return <div className="bullet">&mdash;</div>
        }
    }

    /**
     * Renders a single child document. If this child is a collection, it will call renderTreeView again. Otherwise, it will just append a list element.
     * @param document The document to render.
     */
    renderChild(document: Document) {
        var children = document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        let title = document.GetT<TextField>(KeyStore.Title, TextField);

        // if the title hasn't loaded, immediately return the div
        if (!title || title === "<Waiting>") {
            return <div key={document.Id}></div>;
        }

        // otherwise, check if it's a collection.
        else if (children && children !== "<Waiting>") {
            // if it's not collapsed, then render the full TreeView.
            if (!this.collapsed) {
                return (
                    <li key={document.Id} onClick={action(() => this.collapsed = true)} >
                        {this.renderBullet(BulletType.Collapsible)}
                        {title.Data}
                        <ul key={document.Id}>
                            <TreeView
                                document={document}
                            />
                        </ul>
                    </li>
                );
            } else {
                return <li key={document.Id} onClick={action(() => this.collapsed = false)}>
                    {this.renderBullet(BulletType.Collapsed)}
                    {title.Data}
                </li>
            }
        }

        // finally, if it's a normal document, then render it as such.
        else {
            return <li key={document.Id}>
                {this.renderBullet(BulletType.List)}
                <EditableView contents={title.Data}
                    height={36} GetValue={() => {
                        let title = document.GetT<TextField>(KeyStore.Title, TextField);
                        if (title && title !== "<Waiting>")
                            return title.Data;
                        return "";
                    }} SetValue={(value: string) => {
                        document.SetData(KeyStore.Title, value, TextField);
                        return true;
                    }}></EditableView>
            </li>;
        }
    }

    render() {
        var children = this.props.document.GetT<ListField<Document>>(KeyStore.Data, ListField);

        if (children && children !== "<Waiting>") {
            return (<div>
                {children.Data.map(value => this.renderChild(value))}
            </div>)
        } else {
            return <div></div>;
        }
    }
}


@observer
export class CollectionTreeView extends CollectionViewBase {

    render() {
        let titleStr = "";
        let title = this.props.Document.GetT<TextField>(KeyStore.Title, TextField);
        if (title && title !== "<Waiting>") {
            titleStr = title.Data;
        }
        return (
            <div id="body">
                <h3><EditableView contents={titleStr}
                    height={72} GetValue={() => {
                        let title = this.props.Document.GetT<TextField>(KeyStore.Title, TextField);
                        if (title && title !== "<Waiting>")
                            return title.Data;
                        return "";
                    }} SetValue={(value: string) => {
                        this.props.Document.SetData(KeyStore.Title, value, TextField);
                        return true;
                    }}></EditableView></h3>
                <ul className="no-indent">
                    <TreeView
                        document={this.props.Document}
                    />
                </ul>
            </div>
        );
    }
}