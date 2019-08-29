import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faEye, faTimes, faArrowRight, faChevronDown, faChevronUp, faGlobeAsia } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from "mobx-react";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import './LinkMenu.scss';
import React = require("react");
import { Doc, DocListCastAsync, WidthSym } from '../../../new_fields/Doc';
import { StrCast, Cast, FieldValue, NumCast } from '../../../new_fields/Types';
import { observable, action, computed } from 'mobx';
import { LinkManager } from '../../util/LinkManager';
import { DragLinkAsDocument } from '../../util/DragManager';
import { CollectionDockingView } from '../collections/CollectionDockingView';
import { SelectionManager } from '../../util/SelectionManager';
import { CollectionViewType } from '../collections/CollectionBaseView';
import { DocumentView } from '../nodes/DocumentView';
import { SearchUtil } from '../../util/SearchUtil';
import { LinkFollowBox } from './LinkFollowBox';
import { ContextMenu } from '../ContextMenu';
import { MainView } from '../MainView';
import { Docs } from '../../documents/Documents';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
library.add(faEye, faEdit, faTimes, faArrowRight, faChevronDown, faChevronUp);


interface LinkMenuItemProps {
    groupType: string;
    linkDoc: Doc;
    sourceDoc: Doc;
    destinationDoc: Doc;
    showEditor: (linkDoc: Doc) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
}

@observer
export class LinkMenuItem extends React.Component<LinkMenuItemProps> {
    private _drag = React.createRef<HTMLDivElement>();
    @observable private _showMore: boolean = false;
    @action toggleShowMore() { this._showMore = !this._showMore; }

    onEdit = (e: React.PointerEvent): void => {
        e.stopPropagation();
        this.props.showEditor(this.props.linkDoc);
        SelectionManager.DeselectAll();
    }

    renderMetadata = (): JSX.Element => {
        let groups = LinkManager.Instance.getAnchorGroups(this.props.linkDoc, this.props.sourceDoc);
        let index = groups.findIndex(groupDoc => StrCast(groupDoc.type).toUpperCase() === this.props.groupType.toUpperCase());
        let groupDoc = index > -1 ? groups[index] : undefined;

        let mdRows: Array<JSX.Element> = [];
        if (groupDoc) {
            let mdDoc = Cast(groupDoc.metadata, Doc, null);
            if (mdDoc) {
                let keys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);//groupMetadataKeys.get(this.props.groupType);
                mdRows = keys.map(key => {
                    return (<div key={key} className="link-metadata-row"><b>{key}</b>: {StrCast(mdDoc[key])}</div>);
                });
            }
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

    onContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        ContextMenu.Instance.addItem({ description: "Open in Link Follower", event: () => this.openLinkFollower(), icon: "link" });
        ContextMenu.Instance.addItem({ description: "Follow Default Link", event: () => this.followDefault(), icon: "arrow-right" });
        ContextMenu.Instance.displayMenu(e.clientX, e.clientY);
    }

    @action.bound
    async followDefault() {
        if (LinkFollowBox.Instance !== undefined) {
            LinkFollowBox.Instance.props.Document.isMinimized = false;
            LinkFollowBox.Instance.setLinkDocs(this.props.linkDoc, this.props.sourceDoc, this.props.destinationDoc);
            LinkFollowBox.Instance.defaultLinkBehavior();
        }
    }

    @action.bound
    async openLinkFollower() {
        if (LinkFollowBox.Instance !== undefined) {
            LinkFollowBox.Instance.props.Document.isMinimized = false;
            MainView.Instance.toggleLinkFollowBox(false);
            LinkFollowBox.Instance.setLinkDocs(this.props.linkDoc, this.props.sourceDoc, this.props.destinationDoc);
        }
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
                            <div title="Follow link" className="button" onClick={this.followDefault} onContextMenu={this.onContextMenu}><FontAwesomeIcon className="fa-icon" icon="arrow-right" size="sm" /></div>
                        </div>
                    </div>
                    {this._showMore ? this.renderMetadata() : <></>}
                </div>

            </div >
        );
    }
}