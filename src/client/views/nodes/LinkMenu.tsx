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

interface Props {
    docView: DocumentView;
}

@observer
export class LinkMenu extends React.Component<Props> {

    render() {
        //get list of links from document
        let linkFrom: Document[] = this.props.docView.props.Document.GetData(KeyStore.LinkedFromDocs, ListField, []);
        let linkTo: Document[] = this.props.docView.props.Document.GetData(KeyStore.LinkedToDocs, ListField, []);

        return (
            <div id="menu-container">
                <input id="search-bar" type="text" placeholder="Search..."></input>
                <div id="link-list">

                    {linkTo.map(link => {
                        let name = link.GetData(KeyStore.Title, TextField, new String);
                        return <LinkBox linkDoc={link} linkName={name} />
                    })}

                    {linkFrom.map(link => {
                        let name = link.GetData(KeyStore.Title, TextField, new String);
                        return <LinkBox linkDoc={link} linkName={name} />
                    })}
                </div>

            </div>
        )
    }
}