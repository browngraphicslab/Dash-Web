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
        this.props.linkDoc.GetTAsync(KeyStore.LinkedFromDocs, Document, field => {
            if (field) {
                field.GetTAsync<ListField<Document>>(KeyStore.LinkedToDocs, ListField, field => {
                    if (field) {
                        field.Data.splice(field.Data.indexOf(this.props.linkDoc));
                    }
                })
            }
        });
        this.props.linkDoc.GetTAsync(KeyStore.LinkedToDocs, Document, field => {
            if (field) {
                field.GetTAsync<ListField<Document>>(KeyStore.LinkedFromDocs, ListField, field => {
                    if (field) {
                        field.Data.splice(field.Data.indexOf(this.props.linkDoc));
                    }
                })
            }
        });
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