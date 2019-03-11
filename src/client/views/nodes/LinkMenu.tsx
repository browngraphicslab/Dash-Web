import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { observer } from "mobx-react";
import './LinkMenu.scss'
import { KeyStore } from '../../../fields/KeyStore'
import { props } from "bluebird";
import { DocumentView } from "./DocumentView";
import { LinkBox } from "./LinkBox"
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";
import { TextField } from "../../../fields/TextField";
import { FieldWaiting } from "../../../fields/Field";
import { LinkEditor } from "./LinkEditor";

interface Props {
    docView: DocumentView;
    changeFlyout: () => void
}

@observer
export class LinkMenu extends React.Component<Props> {

    @observable private _editingLink?: Document;

    render() {
        //get list of links from document
        let linkFrom: Document[] = this.props.docView.props.Document.GetData(KeyStore.LinkedFromDocs, ListField, []);
        let linkTo: Document[] = this.props.docView.props.Document.GetData(KeyStore.LinkedToDocs, ListField, []);
        if (this._editingLink === undefined) {
            return (

                <div id="menu-container">
                    <input id="search-bar" type="text" placeholder="Search..."></input>
                    <div id="link-list">

                        {linkTo.map(link => {
                            let name = link.GetData(KeyStore.Title, TextField, new String);
                            let doc = link.GetT(KeyStore.LinkedToDocs, Document);
                            if (doc && doc != FieldWaiting) {
                                return <LinkBox linkDoc={link} linkName={name} pairedDoc={doc} showEditor={action(() => this._editingLink = link)} type={"Destination: "} />
                            } else {
                                return <div></div>
                            }

                        })}

                        {linkFrom.map(link => {
                            let name = link.GetData(KeyStore.Title, TextField, new String);
                            let doc = link.GetT(KeyStore.LinkedFromDocs, Document);
                            if (doc && doc != FieldWaiting) {
                                return <LinkBox linkDoc={link} linkName={name} pairedDoc={doc} showEditor={action(() => this._editingLink = link)} type={"Source: "} />
                            } else {
                                return <div></div>
                            }
                        })}
                    </div>

                </div>
            )
        } else {
            return (
                <LinkEditor linkDoc={this._editingLink} showLinks={action(() => this._editingLink = undefined)}></LinkEditor>
            )
        }

    }
}