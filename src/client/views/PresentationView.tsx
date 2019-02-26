import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { KeyStore } from "../../fields/KeyStore";
import { ListField } from "../../fields/ListField";
import React = require("react")
import { TextField } from "../../fields/TextField";
import { observable, action } from "mobx";
import { Field } from "../../fields/Field";
import { Documents } from '../documents/Documents';

export interface PresViewProps {
    Document: Document;
}

@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class PresentationViewItem extends React.Component<PresViewProps> {


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
    public static Instance: PresentationView;

    //observable means render is re-called every time variable is changed
    @observable
    collapsed: boolean = false;

    private ref: React.RefObject<HTMLDivElement>;

    //initilize class variables
    constructor(props: PresViewProps) {
        super(props);
        this.ref = React.createRef()
        PresentationView.Instance = this;
    }

    /**
     * Adds a document to the presentation view
     **/
    @action
    public PinDoc(doc: Document) {
        //add this new doc to props.Document
        if (this.props.Document.Get(KeyStore.Data) instanceof Field) {
            const value = this.props.Document.GetData(KeyStore.Data, ListField, new Array<Document>())
            value.push(doc);
        } else {
            this.props.Document.SetData(KeyStore.Data, [doc], ListField);
        }

        //TODO: open presentation view if not already open
        this.collapsed = false;
    }

    /**
     * Removes a document from the presentation view
     **/
    @action
    public RemoveDoc(doc: Document) {
        const value = this.props.Document.GetData(KeyStore.Data, ListField, new Array<Document>())
        let index = -1;
        for (let i = 0; i < value.length; i++) {
            if (value[i].Id == doc.Id) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            value.splice(index, 1)

            //TODO: do i need below lines??
            // SelectionManager.DeselectAll()
            // ContextMenu.Instance.clearItems()
            return true;
        }
        return false
    }

    render() {
        let titleStr = "Title";
        let title = this.props.Document.GetT<TextField>(KeyStore.Title, TextField);
        if (title && title !== "<Waiting>") {
            titleStr = title.Data;
        }
        let width = this.collapsed ? 100 : 300;
        return (
            <div background-color="lightblue" max-width={width}>
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