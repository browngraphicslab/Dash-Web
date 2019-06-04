import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DocumentView } from "./DocumentView";
import { LinkBox } from "./LinkBox";
import { LinkEditor } from "./LinkEditor";
import './LinkMenu.scss';
import React = require("react");
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { Cast, FieldValue, StrCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";

interface Props {
    docView: DocumentView;
    changeFlyout: () => void;
}

@observer
export class LinkMenu extends React.Component<Props> {

    @observable private _editingLink?: Doc;

    renderLinkItems(links: Doc[], key: string, type: string) {
        return links.map(link => {
            let doc = FieldValue(Cast(link[key], Doc));
            if (doc) {
                return <LinkBox key={doc[Id]} linkDoc={link} linkName={StrCast(link.title)} pairedDoc={doc} showEditor={action(() => this._editingLink = link)} type={type} />;
            }
        });
    }

    render() {
        //get list of links from document
        let linkFrom = DocListCast(this.props.docView.props.Document.linkedFromDocs);
        let linkTo = DocListCast(this.props.docView.props.Document.linkedToDocs);
        if (this._editingLink === undefined) {
            return (
                <div id="linkMenu-container">
                    {/* <input id="linkMenu-searchBar" type="text" placeholder="Search..."></input> */}
                    <div id="linkMenu-list">
                        {this.renderLinkItems(linkTo, "linkedTo", "Destination: ")}
                        {this.renderLinkItems(linkFrom, "linkedFrom", "Source: ")}
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