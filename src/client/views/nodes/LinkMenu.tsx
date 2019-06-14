import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DocumentView } from "./DocumentView";
import { LinkBox } from "./LinkBox";
import { LinkEditor } from "./LinkEditor";
import './LinkMenu.scss';
import React = require("react");
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { LinkManager } from "../../util/LinkManager";

interface Props {
    docView: DocumentView;
    changeFlyout: () => void;
}

@observer
export class LinkMenu extends React.Component<Props> {

    @observable private _editingLink?: Doc;

    renderGroup = (group: Doc[], groupType: string): Array<JSX.Element> => {
        let source = this.props.docView.Document;
        return group.map(linkDoc => {
            let destination = LinkManager.Instance.findOppositeAnchor(linkDoc, source);
            return <LinkBox key={destination[Id] + source[Id]} groupType={groupType} linkDoc={linkDoc} sourceDoc={source} destinationDoc={destination} showEditor={action(() => this._editingLink = linkDoc)} />;
        });
    }

    renderAllGroups = (groups: Map<string, Array<Doc>>): Array<JSX.Element> => {
        let linkItems: Array<JSX.Element> = [];
        groups.forEach((group, groupType) => {
            linkItems.push(
                <div key={groupType} className="link-menu-group">
                    <p className="link-menu-group-name">{groupType}:</p>
                    <div className="link-menu-group-wrapper">
                        {this.renderGroup(group, groupType)}
                    </div>
                </div>
            );
        });

        // if source doc has no links push message
        if (linkItems.length === 0) linkItems.push(<p key="">No links have been created yet. Drag the linking button onto another document to create a link.</p>);

        return linkItems;
    }

    render() {
        let sourceDoc = this.props.docView.props.Document;
        let groups: Map<string, Doc[]> = LinkManager.Instance.findRelatedGroupedLinks(sourceDoc);
        if (this._editingLink === undefined) {
            return (
                <div className="linkMenu">
                    {/* <input id="linkMenu-searchBar" type="text" placeholder="Search..."></input> */}
                    <div className="linkMenu-list">
                        {this.renderAllGroups(groups)}
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