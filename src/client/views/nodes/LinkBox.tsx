import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { observer } from "mobx-react";
import './LinkBox.scss'
import { KeyStore } from '../../../fields/KeyStore'
import { props } from "bluebird";
import { DocumentView } from "./DocumentView";
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";

interface Props {
    linkDoc: Document;
    linkName: String;
    // pairedDoc: Document;
}

@observer
export class LinkBox extends React.Component<Props> {

    onViewButtonPressed = (e: React.PointerEvent): void => {
        console.log("view down");
        e.stopPropagation();
    }

    onEditButtonPressed = (e: React.PointerEvent): void => {
        console.log("edit down");
        e.stopPropagation();
    }

    onDeleteButtonPressed = (e: React.PointerEvent): void => {
        console.log("delete down");
        e.stopPropagation();
        let linkToDoc: Document = this.props.linkDoc.GetData(KeyStore.LinkedToDocs, ListField, [])[0];
        let linkFromDoc: Document = this.props.linkDoc.GetData(KeyStore.LinkedFromDocs, ListField, [])[0];

        // let linkToDocFromDocs: Document[] = linkToDoc.GetData(KeyStore.LinkedFromDocs, ListField, []);
        // linkToDocFromDocs.
    }

    render() {

        return (
            <div className="link-container">
                <div className="info-container">
                    <div className="link-name">
                        <p>{this.props.linkName}</p>
                    </div>
                    {/* <div className="doc-name">
                        <p>{this.props.pairedDoc.Title}</p>
                    </div> */}
                </div>

                <div className="button-container">
                    <div className="button" onPointerDown={this.onViewButtonPressed}></div>
                    <div className="button" onPointerDown={this.onEditButtonPressed}></div>
                    <div className="button" onPointerDown={this.onDeleteButtonPressed}></div>
                </div>
            </div>
        )
    }
}