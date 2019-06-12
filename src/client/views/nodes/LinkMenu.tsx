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
import { LinkManager, LinkUtils } from "../../util/LinkManager";
import { number, string } from "prop-types";
import { listSpec } from "../../../new_fields/Schema";
import { Utils } from "../../../Utils";

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

    renderGroup(links: Doc[]) {
        let source = this.props.docView.Document;
        return links.map(link => {
            let destination = LinkUtils.findOppositeAnchor(link, source);
            let doc = FieldValue(Cast(destination, Doc));
            if (doc) {
                return <LinkBox key={doc[Id] + source[Id]} linkDoc={link} linkName={StrCast(destination.title)} pairedDoc={doc} showEditor={action(() => this._editingLink = link)} type={""} />;
            }
        });
    }

    renderLinks = (links: Map<string, Array<Doc>>): Array<JSX.Element> => {
        let linkItems: Array<JSX.Element> = [];

        links.forEach((links, group) => {
            linkItems.push(
                <div key={group} className="link-menu-group">
                    <p className="link-menu-group-name">{group}:</p>
                    <div className="link-menu-group-wrapper">
                        {this.renderGroup(links)}
                    </div>
                </div>
            )
        });

        if (linkItems.length === 0) {
            linkItems.push(<p key="">no links have been created yet</p>);
        }

        return linkItems;
    }

    render() {
        let related: Map<string, Doc[]> = LinkManager.Instance.findRelatedGroupedLinks(this.props.docView.props.Document);
        if (this._editingLink === undefined) {
            return (
                <div id="linkMenu-container">
                    {/* <input id="linkMenu-searchBar" type="text" placeholder="Search..."></input> */}
                    <div id="linkMenu-list">
                        {/* {this.renderLinkItems(linkTo, "linkedTo", "Destination: ")}
                        {this.renderLinkItems(linkFrom, "linkedFrom", "Source: ")} */}
                        {this.renderLinks(related)}
                    </div>
                </div>
            );
        } else {
            return (
                <LinkEditor sourceDoc={this.props.docView.props.Document} linkDoc={this._editingLink} showLinks={action(() => this._editingLink = undefined)}></LinkEditor>
            );
        }

    }
}