import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { KeyStore } from "../../fields/KeyStore";
import { ListField } from "../../fields/ListField";
import React = require("react")
import { TextField } from "../../fields/TextField";
import { observable, action } from "mobx";
import { Field, FieldWaiting } from "../../fields/Field";
import "./PresentationView.scss"
import { NumberField } from "../../fields/NumberField";
import "./Main.tsx";
import { DocumentManager } from "../util/DocumentManager";
import { Utils } from "../../Utils";

export interface PresViewProps {
    Document: Document;
}


@observer
/**
 * Component that takes in a document prop and a boolean whether it's collapsed or not.
 */
class PresentationViewItem extends React.Component<PresViewProps> {

    //look at CollectionFreeformView.focusDocument(d)
    @action
    openDoc = (doc: Document) => {
        let docView = DocumentManager.Instance.getDocumentView(doc);
        if (docView) {
            docView.props.focus(docView.props.Document);
        }
    }

    /**
  * Removes a document from the presentation view
  **/
    @action
    public RemoveDoc(doc: Document) {
        const value = this.props.Document.GetData(KeyStore.Data, ListField, new Array<Document>())
        let index = -1;
        for (let i = 0; i < value.length; i++) {
            if (value[i].Id === doc.Id) {
                index = i;
                break;
            }
        }
        if (index !== -1) {
            value.splice(index, 1)
        }
    }

    /**
     * Renders a single child document. It will just append a list element.
     * @param document The document to render.
     */
    renderChild(document: Document) {
        let title = document.Title;

        //to get currently selected presentation doc
        let selected = this.props.Document.GetNumber(KeyStore.SelectedDoc, 0);

        // if the title hasn't loaded, immediately return the div
        if (!title) {
            return <div className="presentationView-item" key={document.Id}></div>;
        }
        // finally, if it's a normal document, then render it as such.
        else {
            const children = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);
            if (children && children.Data[selected] === document) {
                //this doc is selected
                const styles = {
                    background: "gray"
                }
                return <li className="presentationView-item" style={styles} key={Utils.GenerateGuid()}>
                    <div className="presentationView-header" onClick={() => this.openDoc(document)}>{title}</div>
                    <div className="presentation-icon" onClick={() => this.RemoveDoc(document)}>X</div></li>;
            } else {
                return <li className="presentationView-item" key={Utils.GenerateGuid()} >
                    <div className="presentationView-header" onClick={() => this.openDoc(document)}>{title}</div>
                    <div className="presentation-icon" onClick={() => this.RemoveDoc(document)}>X</div></li>;
            }

        }
    }

    render() {
        const children = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);

        if (children) {
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
    closePresentation = action(() => this.props.Document.SetNumber(KeyStore.Width, 0));
    next = () => {
        const current = this.props.Document.GetNumber(KeyStore.SelectedDoc, 0);
        const allDocs = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        if (allDocs && current < allDocs.Data.length + 1) {
            //can move forwards
            this.props.Document.SetNumber(KeyStore.SelectedDoc, current + 1);
            const doc = allDocs.Data[current + 1];
            let docView = DocumentManager.Instance.getDocumentView(doc);
            if (docView) {
                docView.props.focus(docView.props.Document);
            }
        }

    };
    back = () => {
        const current = this.props.Document.GetNumber(KeyStore.SelectedDoc, 0);
        const allDocs = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        if (allDocs && current - 1 >= 0) {
            //can move forwards
            this.props.Document.SetNumber(KeyStore.SelectedDoc, current - 1);
            const doc = allDocs.Data[current - 1];
            let docView = DocumentManager.Instance.getDocumentView(doc);
            if (docView) {
                docView.props.focus(docView.props.Document);
            }
        }

    };

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

        this.props.Document.SetNumber(KeyStore.Width, 300);
    }

    render() {
        let titleStr = this.props.Document.Title;
        let width = this.props.Document.GetNumber(KeyStore.Width, 0);

        //TODO: next and back should be icons
        return (
            <div className="presentationView-cont" style={{ width: width, overflow: "hidden" }}>
                <div className="presentationView-heading">
                    <div className="presentationView-title">{titleStr}</div>
                    <div className='presentation-icon' onClick={this.closePresentation}>X</div></div>
                <div>
                    <div className="presentation-back" onClick={this.back}>back</div>
                    <div className="presentation-next" onClick={this.next}>next</div>

                </div>
                <ul>
                    <PresentationViewItem
                        Document={this.props.Document}
                    />
                </ul>
            </div>
        );
    }
}