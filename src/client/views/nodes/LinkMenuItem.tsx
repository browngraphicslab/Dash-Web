import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faEye, faTimes, faArrowRight, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from "mobx-react";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import './LinkMenu.scss';
import React = require("react");
import { Doc } from '../../../new_fields/Doc';
import { StrCast, Cast } from '../../../new_fields/Types';
import { observable, action } from 'mobx';
import { LinkManager } from '../../util/LinkManager';
import { DragLinkAsDocument } from '../../util/DragManager';
import { CollectionDockingView } from '../collections/CollectionDockingView';
library.add(faEye, faEdit, faTimes, faArrowRight, faChevronDown, faChevronUp);


interface LinkMenuItemProps {
    groupType: string;
    linkDoc: Doc;
    sourceDoc: Doc;
    destinationDoc: Doc;
    showEditor: (linkDoc: Doc) => void;
}

@observer
export class LinkMenuItem extends React.Component<LinkMenuItemProps> {
    private _drag = React.createRef<HTMLDivElement>();
    @observable private _showMore: boolean = false;
    @action toggleShowMore() { this._showMore = !this._showMore; }

    @undoBatch
    onFollowLink = async (e: React.PointerEvent): Promise<void> => {
        e.stopPropagation();
        if (DocumentManager.Instance.getDocumentView(this.props.destinationDoc)) {
            DocumentManager.Instance.jumpToDocument(this.props.destinationDoc, e.altKey);
        } else {
            CollectionDockingView.Instance.AddRightSplit(this.props.destinationDoc, undefined);
        }
    }

    onEdit = (e: React.PointerEvent): void => {
        e.stopPropagation();
        this.props.showEditor(this.props.linkDoc);
    }

    renderMetadata = (): JSX.Element => {
        let groups = LinkManager.Instance.getAnchorGroups(this.props.linkDoc, this.props.sourceDoc);
        let index = groups.findIndex(groupDoc => StrCast(groupDoc.type).toUpperCase() === this.props.groupType.toUpperCase());
        let groupDoc = index > -1 ? groups[index] : undefined;

        let mdRows: Array<JSX.Element> = [];
        if (groupDoc) {
            let mdDoc = Cast(groupDoc.metadata, Doc, new Doc);
            let keys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);//groupMetadataKeys.get(this.props.groupType);
            mdRows = keys.map(key => {
                return (<div key={key} className="link-metadata-row"><b>{key}</b>: {StrCast(mdDoc[key])}</div>);
            });
        }

        return (<div className="link-metadata">{mdRows}</div>);
    }

    onLinkButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.addEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        document.addEventListener("pointerup", this.onLinkButtonUp);
    }

    onLinkButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        e.stopPropagation();
    }

    onLinkButtonMoved = async (e: PointerEvent) => {
        if (this._drag.current !== null && (e.movementX > 1 || e.movementY > 1)) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);

            DragLinkAsDocument(this._drag.current, e.x, e.y, this.props.linkDoc, this.props.sourceDoc);
        }
        e.stopPropagation();
    }

    render() {

        let keys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);//groupMetadataKeys.get(this.props.groupType);
        let canExpand = keys ? keys.length > 0 : false;

        return (
            <div className="linkMenu-item">
                <div className={canExpand ? "linkMenu-item-content expand-three" : "linkMenu-item-content expand-two"}>
                    <div className="link-name">
                        <p ref={this._drag} onPointerDown={this.onLinkButtonDown}>{StrCast(this.props.destinationDoc.title)}</p>
                        <div className="linkMenu-item-buttons">
                            {canExpand ? <div title="Show more" className="button" onPointerDown={() => this.toggleShowMore()}>
                                <FontAwesomeIcon className="fa-icon" icon={this._showMore ? "chevron-up" : "chevron-down"} size="sm" /></div> : <></>}
                            <div title="Edit link" className="button" onPointerDown={this.onEdit}><FontAwesomeIcon className="fa-icon" icon="edit" size="sm" /></div>
                            <div title="Follow link" className="button" onPointerDown={this.onFollowLink}><FontAwesomeIcon className="fa-icon" icon="arrow-right" size="sm" /></div>
                        </div>
                    </div>
                    {this._showMore ? this.renderMetadata() : <></>}
                </div>

            </div >
        );
    }
}