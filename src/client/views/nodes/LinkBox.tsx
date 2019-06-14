import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faEye, faTimes, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from "mobx-react";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import './LinkBox.scss';
import React = require("react");
import { Doc } from '../../../new_fields/Doc';
import { StrCast } from '../../../new_fields/Types';


library.add(faEye);
library.add(faEdit);
library.add(faTimes);
library.add(faArrowRight);

interface Props {
    linkDoc: Doc;
    sourceDoc: Doc;
    destinationDoc: Doc;
    showEditor: () => void;
}

@observer
export class LinkBox extends React.Component<Props> {

    @undoBatch
    onFollowLink = async (e: React.PointerEvent): Promise<void> => {
        e.stopPropagation();
        DocumentManager.Instance.jumpToDocument(this.props.destinationDoc, e.altKey);
    }

    onEdit = (e: React.PointerEvent): void => {
        e.stopPropagation();
        this.props.showEditor();
    }

    render() {
        return (
            <div className="link-menu-item">
                <div className="link-menu-item-content">
                    <div className="link-name">
                        <p>{StrCast(this.props.destinationDoc.title)}</p>
                    </div>
                </div>

                <div className="link-menu-item-buttons">
                    <div title="Edit link" className="button" onPointerDown={this.onEdit}><FontAwesomeIcon className="fa-icon" icon="edit" size="sm" /></div>
                    <div title="Follow link" className="button" onPointerDown={this.onFollowLink}><FontAwesomeIcon className="fa-icon" icon="arrow-right" size="sm" /></div>
                </div>
            </div>
        );
    }
}