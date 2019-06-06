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
import { LinkManager } from "./LinkManager";

interface Props {
    docView: DocumentView;
    changeFlyout: () => void;
}

@observer
export class LinkMenu extends React.Component<Props> {

    @observable private _editingLink?: Doc;

    // renderLinkItems(links: Doc[], key: string, type: string) {
    //     return links.map(link => {
    //         let doc = FieldValue(Cast(link[key], Doc));
    //         if (doc) {
    //             return <LinkBox key={doc[Id]} linkDoc={link} linkName={StrCast(link.title)} pairedDoc={doc} showEditor={action(() => this._editingLink = link)} type={type} />;
    //         }
    //     });
    // }

    renderLinkGroup(links: Doc[]) {
        console.log("render link group");
        let source = this.props.docView.Document;
        console.log("num links", links.length, typeof links);
        return links.map(link => {
            let destination = (link["linkedTo"] === source) ? link["linkedFrom"] : link["linkedTo"];
            let doc = FieldValue(Cast(destination, Doc));
            if (doc) {
                console.log(doc[Id] + source[Id], "source is", source[Id]);
                return <LinkBox key={doc[Id] + source[Id]} linkDoc={link} linkName={StrCast(link.title)} pairedDoc={doc} showEditor={action(() => this._editingLink = link)} type={""} />;
            }
        });
    }

    renderLinkItems(links: Map<string, Array<Doc>>) {
        console.log("render link items");

        let linkItems: Array<JSX.Element> = [];

        links.forEach((links, group) => {
            console.log("category is ", group);
            linkItems.push(
                <div key={group} className="link-menu-group">
                    <p className="link-menu-group-name">{group}:</p>
                    <div className="link-menu-group-wrapper">
                        {this.renderLinkGroup(links)}
                    </div>
                </div>
            )
        });

        return linkItems;
    }

    render() {
        //get list of links from document
        // let linkFrom = DocListCast(this.props.docView.props.Document.linkedFromDocs);
        // let linkTo = DocListCast(this.props.docView.props.Document.linkedToDocs);
        let related = LinkManager.Instance.findRelatedGroupedLinks(this.props.docView.props.Document);
        if (this._editingLink === undefined) {
            return (
                <div id="linkMenu-container">
                    {/* <input id="linkMenu-searchBar" type="text" placeholder="Search..."></input> */}
                    <div id="linkMenu-list">
                        {/* {this.renderLinkItems(linkTo, "linkedTo", "Destination: ")}
                        {this.renderLinkItems(linkFrom, "linkedFrom", "Source: ")} */}
                        {this.renderLinkItems(related)}
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