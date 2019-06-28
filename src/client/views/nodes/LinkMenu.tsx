import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DocumentView } from "./DocumentView";
import { LinkEditor } from "./LinkEditor";
import './LinkMenu.scss';
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { LinkManager } from "../../util/LinkManager";
import { LinkMenuGroup } from "./LinkMenuGroup";
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

library.add(faTrash);
import { Cast, FieldValue, StrCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { DocTypes } from "../../documents/Documents";

interface Props {
    docView: DocumentView;
    changeFlyout: () => void;
}

@observer
export class LinkMenu extends React.Component<Props> {

    @observable private _editingLink?: Doc;

    @action
    componentWillReceiveProps() {
        this._editingLink = undefined;
    }

    clearAllLinks = () => {
        LinkManager.Instance.deleteAllLinksOnAnchor(this.props.docView.props.Document);
    }

    renderAllGroups = (groups: Map<string, Array<Doc>>): Array<JSX.Element> => {
        let linkItems: Array<JSX.Element> = [];
        groups.forEach((group, groupType) => {
            linkItems.push(
                <LinkMenuGroup key={groupType} sourceDoc={this.props.docView.props.Document} group={group} groupType={groupType} showEditor={action((linkDoc: Doc) => this._editingLink = linkDoc)} />
            );
        });
        return linkItems;
    }

    render() {
        let sourceDoc = this.props.docView.props.Document;
        let groups: Map<string, Doc[]> = LinkManager.Instance.getRelatedGroupedLinks(sourceDoc);

        let content: JSX.Element;
        if (Array.from(groups.keys()).length) {
            content = (<>
                <div className="linkMenu-list">
                    {this.renderAllGroups(groups)}
                </div>
                <div className="linkMenu-settings">
                    <button className="linkEditor-button linkEditor-clearButton" onClick={() => this.clearAllLinks()} title="Delete all links"><FontAwesomeIcon icon="trash" size="sm" /></button>
                </div>
            </>);
        } else {
            content = <p key="">No links have been created yet. Drag the linking button onto another document to create a link.</p>;
        }


        if (this._editingLink === undefined) {
            return (
                <div className="linkMenu">
                    {/* <input id="linkMenu-searchBar" type="text" placeholder="Search..."></input> */}
                    {content}
                </div>
            );
        } else {
            return (
                <LinkEditor sourceDoc={this.props.docView.props.Document} linkDoc={this._editingLink} showLinks={action(() => this._editingLink = undefined)}></LinkEditor>
            );
        }
    }
}