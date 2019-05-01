import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faEye, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { KeyStore } from '../../../fields/KeyStore';
import { ListField } from "../../../fields/ListField";
import { NumberField } from "../../../fields/NumberField";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import './LinkBox.scss';
import React = require("react");


library.add(faEye);
library.add(faEdit);
library.add(faTimes);

interface Props {
    linkDoc: Document;
    linkName: String;
    pairedDoc: Document;
    type: String;
    showEditor: () => void;
}

@observer
export class LinkBox extends React.Component<Props> {

    @undoBatch
    onViewButtonPressed = (e: React.PointerEvent): void => {
        e.stopPropagation();
        let docView = DocumentManager.Instance.getDocumentView(this.props.pairedDoc);
        if (docView) {
            docView.props.focus(docView.props.Document);
        } else {
            this.props.pairedDoc.GetAsync(KeyStore.AnnotationOn, (contextDoc: any) => {
                if (!contextDoc) {
                    CollectionDockingView.Instance.AddRightSplit(this.props.pairedDoc.MakeDelegate());
                } else if (contextDoc instanceof Document) {
                    this.props.pairedDoc.GetTAsync(KeyStore.Page, NumberField).then((pfield: any) => {
                        contextDoc.GetTAsync(KeyStore.CurPage, NumberField).then((cfield: any) => {
                            if (pfield !== cfield) {
                                contextDoc.SetNumber(KeyStore.CurPage, pfield.Data);
                            }
                            let contextView = DocumentManager.Instance.getDocumentView(contextDoc);
                            if (contextView) {
                                contextDoc.SetText(KeyStore.PanTransformType, "Ease");
                                contextView.props.focus(contextDoc);
                            } else {
                                CollectionDockingView.Instance.AddRightSplit(contextDoc);
                            }
                        });
                    });
                }
            });
        }
    }

    onEditButtonPressed = (e: React.PointerEvent): void => {
        console.log("edit down");
        e.stopPropagation();

        this.props.showEditor();
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
                });
            }
        });
        this.props.linkDoc.GetTAsync(KeyStore.LinkedToDocs, Document, field => {
            if (field) {
                field.GetTAsync<ListField<Document>>(KeyStore.LinkedFromDocs, ListField, field => {
                    if (field) {
                        field.Data.splice(field.Data.indexOf(this.props.linkDoc));
                    }
                });
            }
        });
    }

    render() {

        return (
            //<LinkEditor linkBox={this} linkDoc={this.props.linkDoc} />
            <div className="link-container">
                <div className="info-container" onPointerDown={this.onViewButtonPressed}>
                    <div className="link-name">
                        <p>{this.props.linkName}</p>
                    </div>
                    <div className="doc-name">
                        <p>{this.props.type}{this.props.pairedDoc.Title}</p>
                    </div>
                </div>

                <div className="button-container">
                    {/* <div title="Follow Link" className="button" onPointerDown={this.onViewButtonPressed}>
                        <FontAwesomeIcon className="fa-icon-view" icon="eye" size="sm" /></div> */}
                    <div title="Edit Link" className="button" onPointerDown={this.onEditButtonPressed}>
                        <FontAwesomeIcon className="fa-icon-edit" icon="edit" size="sm" /></div>
                    <div title="Delete Link" className="button" onPointerDown={this.onDeleteButtonPressed}>
                        <FontAwesomeIcon className="fa-icon-delete" icon="times" size="sm" /></div>
                </div>
            </div>
        );
    }
}