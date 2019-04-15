import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { KeyStore } from '../../../fields/KeyStore';
import { ListField } from "../../../fields/ListField";
import { DocumentView } from "./DocumentView";
import { LinkBox } from "./LinkBox";
import { LinkEditor } from "./LinkEditor";
import './LinkMenu.scss';
import React = require("react");

interface Props {
    docView: DocumentView;
    changeFlyout: () => void;
}

@observer
export class LinkMenu extends React.Component<Props> {

    @observable private _editingLink?: Document;

    renderLinkItems(links: Document[], key: Key, type: string) {
        return links.map(link => {
            let doc = link.GetT(key, Document);
            if (doc && doc !== FieldWaiting) {
                return <LinkBox key={doc.Id} linkDoc={link} linkName={link.Title} pairedDoc={doc} showEditor={action(() => this._editingLink = link)} type={type} />;
            }
        });
    }

    render() {
        //get list of links from document
        let linkFrom: Document[] = this.props.docView.props.Document.GetData(KeyStore.LinkedFromDocs, ListField, []);
        let linkTo: Document[] = this.props.docView.props.Document.GetData(KeyStore.LinkedToDocs, ListField, []);
        if (this._editingLink === undefined) {
            return (
                <div id="linkMenu-container">
                    <input id="linkMenu-searchBar" type="text" placeholder="Search..."></input>
                    <div id="linkMenu-list">
                        {this.renderLinkItems(linkTo, KeyStore.LinkedToDocs, "Destination: ")}
                        {this.renderLinkItems(linkFrom, KeyStore.LinkedFromDocs, "Source: ")}
                    </div>
                </div>
            );
        } else {
            return (
                <LinkEditor linkDoc={this._editingLink} showLinks={action(() => this._editingLink = undefined)}></LinkEditor>
            );
        }

    }
}