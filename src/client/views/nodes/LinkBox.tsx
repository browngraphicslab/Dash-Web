import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faEye, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from "mobx-react";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import './LinkBox.scss';
import React = require("react");
import { Doc } from '../../../new_fields/Doc';
import { Cast, NumCast } from '../../../new_fields/Types';
import { listSpec } from '../../../new_fields/Schema';


library.add(faEye);
library.add(faEdit);
library.add(faTimes);

interface Props {
    linkDoc: Doc;
    linkName: String;
    pairedDoc: Doc;
    type: String;
    showEditor: () => void;
}

@observer
export class LinkBox extends React.Component<Props> {

    @undoBatch
    onViewButtonPressed = async (e: React.PointerEvent): Promise<void> => {
        e.stopPropagation();
        let docView = DocumentManager.Instance.getDocumentView(this.props.pairedDoc);
        if (docView) {
            docView.props.focus(docView.props.Document);
        } else {
            const contextDoc = await Cast(this.props.pairedDoc.annotationOn, Doc);
            if (!contextDoc) {
                CollectionDockingView.Instance.AddRightSplit(Doc.MakeDelegate(this.props.pairedDoc));
            } else {
                const page = NumCast(this.props.pairedDoc.page, undefined);
                const curPage = NumCast(contextDoc.curPage, undefined);
                if (page !== curPage) {
                    contextDoc.curPage = page;
                }
                let contextView = DocumentManager.Instance.getDocumentView(contextDoc);
                if (contextView) {
                    contextView.props.focus(contextDoc);
                } else {
                    CollectionDockingView.Instance.AddRightSplit(contextDoc);
                }
            }
        }
    }

    onEditButtonPressed = (e: React.PointerEvent): void => {
        e.stopPropagation();

        this.props.showEditor();
    }

    onDeleteButtonPressed = async (e: React.PointerEvent): Promise<void> => {
        e.stopPropagation();
        const [linkedFrom, linkedTo] = await Promise.all([Cast(this.props.linkDoc.linkedFrom, Doc), Cast(this.props.linkDoc.linkedTo, Doc)]);
        if (linkedFrom) {
            const linkedToDocs = Cast(linkedFrom.linkedToDocs, listSpec(Doc));
            if (linkedToDocs) {
                linkedToDocs.splice(linkedToDocs.indexOf(this.props.linkDoc));
            }
        }
        if (linkedTo) {
            const linkedFromDocs = Cast(linkedTo.linkedToDocs, listSpec(Doc));
            if (linkedFromDocs) {
                linkedFromDocs.splice(linkedFromDocs.indexOf(this.props.linkDoc));
            }
        }
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
                    <div title="Follow Link" className="button" onPointerDown={this.onViewButtonPressed}>
                        <FontAwesomeIcon className="fa-icon-view" icon="eye" size="sm" /></div>
                    <div title="Edit Link" className="button" onPointerDown={this.onEditButtonPressed}>
                        <FontAwesomeIcon className="fa-icon-edit" icon="edit" size="sm" /></div>
                    <div title="Delete Link" className="button" onPointerDown={this.onDeleteButtonPressed}>
                        <FontAwesomeIcon className="fa-icon-delete" icon="times" size="sm" /></div>
                </div>
            </div>
        );
    }
}