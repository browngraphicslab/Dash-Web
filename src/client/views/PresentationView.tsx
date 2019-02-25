import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { KeyStore } from "../../fields/KeyStore";
import { ListField } from "../../fields/ListField";
import React = require("react")
import { TextField } from "../../fields/TextField";
import { observable, action } from "mobx";
import "./CollectionTreeView.scss";

export interface PresViewProps {
    Document: Document;
}

@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class PresentationViewItem extends React.Component<PresViewProps> {

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;

    /**
     * Renders a single child document. It will just append a list element.
     * @param document The document to render.
     */
    renderChild(document: Document) {
        let title = document.GetT<TextField>(KeyStore.Title, TextField);

        // if the title hasn't loaded, immediately return the div
        if (!title || title === "<Waiting>") {
            return <div key={document.Id}></div>;
        }
        // finally, if it's a normal document, then render it as such.
        else {
            return <li key={document.Id}>{title.Data}</li>;
        }
    }

    render() {
        var children = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);

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
export class PresentationView extends React.Component<PresViewProps>  {

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
                    <PresentationViewItem
                        Document={this.props.Document}
                    />
                </ul>
            </div>
        );
    }
}