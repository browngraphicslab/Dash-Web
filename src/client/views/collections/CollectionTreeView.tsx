import { observer } from "mobx-react";
import { CollectionViewBase } from "./CollectionViewBase";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import React = require("react")
import { TextField } from "../../../fields/TextField";
import { observable, action } from "mobx";
import "./CollectionTreeView.scss";

export interface TreeViewProps {
    document: Document;
}

@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class TreeView extends React.Component<TreeViewProps> {

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;

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
                    <li className="uncollapsed" key={document.Id} onClick={action(() => this.collapsed = true)} >
                        {title.Data}
                        <ul key={document.Id}>
                            <TreeView
                                document={document}
                            />
                        </ul>
                    </li>
                );
            } else {
                return <li className="collapsed" key={document.Id} onClick={action(() => this.collapsed = false)}>{title.Data}</li>
            }
        }

        // finally, if it's a normal document, then render it as such.
        else {
            return <li key={document.Id}>{title.Data}</li>;
        }
    }

    render() {
        var children = this.props.document.GetT<ListField<Document>>(KeyStore.Data, ListField);

        if (children && children !== "<Waiting>") {
            return (<div>
                {children.Data.map(value => this.renderChild(value))}
            </div>)
            // let results: JSX.Element[] = [];

            // // append a list item for each child in the collection
            // children.Data.forEach((value) => {
            //     results.push(this.renderChild(value));
            // })

            // return results;
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
            <div>
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