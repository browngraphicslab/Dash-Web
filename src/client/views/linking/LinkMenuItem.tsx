import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowRight, faChevronDown, faChevronUp, faEdit, faEye, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable } from 'mobx';
import { observer } from "mobx-react";
import { Doc } from '../../../new_fields/Doc';
import { Cast, StrCast } from '../../../new_fields/Types';
import { DragManager } from '../../util/DragManager';
import { LinkManager } from '../../util/LinkManager';
import { ContextMenu } from '../ContextMenu';
import { LinkFollowBox } from './LinkFollowBox';
import './LinkMenuItem.scss';
import React = require("react");
import { DocumentManager } from '../../util/DocumentManager';
library.add(faEye, faEdit, faTimes, faArrowRight, faChevronDown, faChevronUp);


interface LinkMenuItemProps {
    groupType: string;
    linkDoc: Doc;
    sourceDoc: Doc;
    destinationDoc: Doc;
    showEditor: (linkDoc: Doc) => void;
    addDocTab: (document: Doc, where: string) => boolean;
}

@observer
export class LinkMenuItem extends React.Component<LinkMenuItemProps> {
    private _drag = React.createRef<HTMLDivElement>();
    private _downX = 0;
    private _downY = 0;
    private _eleClone: any;
    @observable private _showMore: boolean = false;
    @action toggleShowMore(e: React.PointerEvent) { e.stopPropagation(); this._showMore = !this._showMore; }

    onEdit = (e: React.PointerEvent): void => {
        e.stopPropagation();
        this.props.showEditor(this.props.linkDoc);
        //SelectionManager.DeselectAll();
    }

    renderMetadata = (): JSX.Element => {
        const index = StrCast(this.props.linkDoc.title).toUpperCase() === this.props.groupType.toUpperCase() ? 0 : -1;
        const mdDoc = index > -1 ? this.props.linkDoc : undefined;

        let mdRows: Array<JSX.Element> = [];
        if (mdDoc) {
            const keys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);//groupMetadataKeys.get(this.props.groupType);
            mdRows = keys.map(key => <div key={key} className="link-metadata-row"><b>{key}</b>: {StrCast(mdDoc[key])}</div>);
        }

        return (<div className="link-metadata">{mdRows}</div>);
    }

    onLinkButtonDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        this._eleClone = this._drag.current!.cloneNode(true);
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
        if (this._drag.current !== null && Math.abs((e.clientX - this._downX) * (e.clientX - this._downX) + (e.clientY - this._downY) * (e.clientY - this._downY)) > 5) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);

            this._eleClone.style.transform = `translate(${e.x}px, ${e.y}px)`;
            DragManager.StartLinkTargetsDrag(this._eleClone, e.x, e.y, this.props.sourceDoc, [this.props.linkDoc]);
        }
        e.stopPropagation();
    }

    onContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        ContextMenu.Instance.addItem({ description: "Follow Default Link", event: () => this.followDefault(), icon: "arrow-right" });
        ContextMenu.Instance.displayMenu(e.clientX, e.clientY);
    }

    @action.bound
    async followDefault() {
        DocumentManager.Instance.FollowLink(this.props.linkDoc, this.props.sourceDoc, doc => this.props.addDocTab(doc, "onRight"), false);
    }

    render() {
        const keys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);//groupMetadataKeys.get(this.props.groupType);
        const canExpand = keys ? keys.length > 0 : false;

        return (
            <div className="linkMenu-item">
                <div className={canExpand ? "linkMenu-item-content expand-three" : "linkMenu-item-content expand-two"}>
                    <div ref={this._drag} className="linkMenu-name" title="drag to view target. click to customize." onPointerDown={this.onLinkButtonDown}>
                        <p >{StrCast(this.props.destinationDoc.title)}</p>
                        <div className="linkMenu-item-buttons">
                            {canExpand ? <div title="Show more" className="button" onPointerDown={e => this.toggleShowMore(e)}>
                                <FontAwesomeIcon className="fa-icon" icon={this._showMore ? "chevron-up" : "chevron-down"} size="sm" /></div> : <></>}
                            <div title="Edit link" className="button" onPointerDown={this.onEdit}><FontAwesomeIcon className="fa-icon" icon="edit" size="sm" /></div>
                            <div title="Follow link" className="button" onClick={this.followDefault} onContextMenu={this.onContextMenu}>
                                <FontAwesomeIcon className="fa-icon" icon="arrow-right" size="sm" />
                            </div>
                        </div>
                    </div>
                    {this._showMore ? this.renderMetadata() : <></>}
                </div>

            </div >
        );
    }
}