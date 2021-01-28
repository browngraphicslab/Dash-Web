import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip } from '@material-ui/core';
import { action, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import { Doc, DocListCast } from '../../../fields/Doc';
import { Cast, StrCast } from '../../../fields/Types';
import { WebField } from '../../../fields/URLField';
import { emptyFunction, setupMoveUpEvents } from '../../../Utils';
import { DocumentType } from '../../documents/DocumentTypes';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager } from '../../util/DragManager';
import { Hypothesis } from '../../util/HypothesisUtils';
import { LinkManager } from '../../util/LinkManager';
import { undoBatch } from '../../util/UndoManager';
import { DocumentLinksButton } from '../nodes/DocumentLinksButton';
import { DocumentView, DocumentViewSharedProps } from '../nodes/DocumentView';
import { LinkDocPreview } from '../nodes/LinkDocPreview';
import './LinkMenuItem.scss';
import React = require("react");


interface LinkMenuItemProps {
    groupType: string;
    linkDoc: Doc;
    docView: DocumentView;
    sourceDoc: Doc;
    destinationDoc: Doc;
    showEditor: (linkDoc: Doc) => void;
    docprops: DocumentViewSharedProps;
    menuRef: React.Ref<HTMLDivElement>;
}

// drag links and drop link targets (aliasing them if needed)
export async function StartLinkTargetsDrag(dragEle: HTMLElement, docView: DocumentView, downX: number, downY: number, sourceDoc: Doc, specificLinks?: Doc[]) {
    const draggedDocs = (specificLinks ? specificLinks : DocListCast(sourceDoc.links)).map(link => LinkManager.getOppositeAnchor(link, sourceDoc)).filter(l => l) as Doc[];

    if (draggedDocs.length) {
        const moddrag: Doc[] = [];
        for (const draggedDoc of draggedDocs) {
            const doc = await Cast(draggedDoc.annotationOn, Doc);
            if (doc) moddrag.push(doc);
        }

        const dragData = new DragManager.DocumentDragData(moddrag.length ? moddrag : draggedDocs);
        dragData.moveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean): boolean => {
            docView.props.removeDocument?.(doc);
            addDocument(doc);
            return true;
        };
        const containingView = docView.props.ContainingCollectionView;
        const finishDrag = (e: DragManager.DragCompleteEvent) =>
            e.docDragData && (e.docDragData.droppedDocuments =
                dragData.draggedDocuments.reduce((droppedDocs, d) => {
                    const dvs = DocumentManager.Instance.getDocumentViews(d).filter(dv => dv.props.ContainingCollectionView === containingView);
                    if (dvs.length) {
                        dvs.forEach(dv => droppedDocs.push(dv.props.Document));
                    } else {
                        droppedDocs.push(Doc.MakeAlias(d));
                    }
                    return droppedDocs;
                }, [] as Doc[]));

        DragManager.StartDrag([dragEle], dragData, downX, downY, undefined, finishDrag);
    }
}


@observer
export class LinkMenuItem extends React.Component<LinkMenuItemProps> {
    private _drag = React.createRef<HTMLDivElement>();
    private _downX = 0;
    private _downY = 0;
    private _eleClone: any;

    _editRef = React.createRef<HTMLDivElement>();
    _buttonRef = React.createRef<HTMLDivElement>();

    @observable private _showMore: boolean = false;
    @action toggleShowMore(e: React.PointerEvent) { e.stopPropagation(); this._showMore = !this._showMore; }

    onEdit = (e: React.PointerEvent): void => {
        LinkManager.currentLink = this.props.linkDoc;
        setupMoveUpEvents(this, e, this.editMoved, emptyFunction, () => this.props.showEditor(this.props.linkDoc));
    }

    editMoved = (e: PointerEvent) => {
        const dragData = new DragManager.DocumentDragData([this.props.linkDoc]);
        DragManager.StartDocumentDrag([this._editRef.current!], dragData, e.x, e.y);
        return true;
    }

    @action
    onLinkButtonDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        this._eleClone = this._drag.current!.cloneNode(true);
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.addEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        document.addEventListener("pointerup", this.onLinkButtonUp);

        if (this._buttonRef && !!!this._buttonRef.current?.contains(e.target as any)) {
            LinkDocPreview.LinkInfo = undefined;
        }
    }

    onLinkButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        LinkManager.FollowLink(this.props.linkDoc, this.props.sourceDoc, this.props.docView.props, false);

        e.stopPropagation();
    }

    onLinkButtonMoved = async (e: PointerEvent) => {
        if (this._drag.current !== null && Math.abs((e.clientX - this._downX) * (e.clientX - this._downX) + (e.clientY - this._downY) * (e.clientY - this._downY)) > 5) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);

            this._eleClone.style.transform = `translate(${e.x}px, ${e.y}px)`;
            StartLinkTargetsDrag(this._eleClone, this.props.docView, e.x, e.y, this.props.sourceDoc, [this.props.linkDoc]);
        }
        e.stopPropagation();
    }

    @undoBatch
    @action
    deleteLink = (e: React.PointerEvent): void => {
        this.props.linkDoc.linksToAnnotation && Hypothesis.deleteLink(this.props.linkDoc, this.props.sourceDoc, this.props.destinationDoc);
        LinkManager.Instance.deleteLink(this.props.linkDoc);
        e.stopPropagation();

        runInAction(() => {
            LinkDocPreview.LinkInfo = undefined;
            DocumentLinksButton.EditLink = undefined;
        });
    }

    @undoBatch
    @action
    autoMove = (e: React.PointerEvent) => {
        e.stopPropagation();
        this.props.linkDoc.linkAutoMove = !this.props.linkDoc.linkAutoMove;
    }

    @undoBatch
    @action
    showLink = (e: React.PointerEvent) => {
        e.stopPropagation();
        this.props.linkDoc.linkDisplay = !this.props.linkDoc.linkDisplay;
    }

    @undoBatch
    @action
    showAnchor = (e: React.PointerEvent) => {
        e.stopPropagation();
        this.props.linkDoc.hidden = !this.props.linkDoc.hidden;
    }

    render() {
        const destinationIcon = Doc.toIcon(this.props.destinationDoc) as any as IconProp;

        const title = StrCast(this.props.destinationDoc.title).length > 18 ?
            StrCast(this.props.destinationDoc.title).substr(0, 14) + "..." : this.props.destinationDoc.title;

        //  ...
        // from anika to bob: here's where the text that is specifically linked would show up (linkDoc.storedText)
        // ...
        const source = this.props.sourceDoc.type === DocumentType.RTF ? this.props.linkDoc.storedText ?
            StrCast(this.props.linkDoc.storedText).length > 17 ?
                StrCast(this.props.linkDoc.storedText).substr(0, 18)
                : this.props.linkDoc.storedText : undefined : undefined;

        return (
            <div className="linkMenu-item">
                <div className={"linkMenu-item-content expand-two"}>

                    <div ref={this._drag} className="linkMenu-name" //title="drag to view target. click to customize."
                        onPointerLeave={action(() => LinkDocPreview.LinkInfo = undefined)}
                        onPointerEnter={action(e => this.props.linkDoc && (LinkDocPreview.LinkInfo = {
                            docprops: this.props.docprops,
                            linkSrc: this.props.sourceDoc,
                            linkDoc: this.props.linkDoc,
                            Location: [e.clientX, e.clientY + 20]
                        }))}
                        onPointerDown={this.onLinkButtonDown}>

                        <div className="linkMenu-text">
                            {source ? <p className="linkMenu-source-title"> <b>Source: {source}</b></p> : null}
                            <div className="linkMenu-title-wrapper">
                                <div className="destination-icon-wrapper" >
                                    <FontAwesomeIcon className="destination-icon" icon={destinationIcon} size="sm" />
                                </div>
                                <p className="linkMenu-destination-title">
                                    {this.props.linkDoc.linksToAnnotation && Cast(this.props.destinationDoc.data, WebField)?.url.href === this.props.linkDoc.annotationUri ? "Annotation in" : ""} {title}
                                </p>
                            </div>
                            {!this.props.linkDoc.description ? (null) : <p className="linkMenu-description">{StrCast(this.props.linkDoc.description)}</p>}
                        </div>

                        <div className="linkMenu-item-buttons" ref={this._buttonRef} >

                            <Tooltip title={<><div className="dash-tooltip">{this.props.linkDoc.hidden ? "Show Anchor" : "Hide Anchor"}</div></>}>
                                <div className="button" ref={this._editRef} onPointerDown={this.showAnchor}>
                                    <FontAwesomeIcon className="fa-icon" icon={this.props.linkDoc.hidden ? "eye-slash" : "eye"} size="sm" /></div>
                            </Tooltip>

                            <Tooltip title={<><div className="dash-tooltip">{!this.props.linkDoc.linkDisplay ? "Show link" : "Hide link"}</div></>}>
                                <div className="button" ref={this._editRef} onPointerDown={this.showLink}>
                                    <FontAwesomeIcon className="fa-icon" icon={!this.props.linkDoc.linkDisplay ? "eye-slash" : "eye"} size="sm" /></div>
                            </Tooltip>

                            <Tooltip title={<><div className="dash-tooltip">{!this.props.linkDoc.linkAutoMove ? "Auto move dot" : "Freeze dot position"}</div></>}>
                                <div className="button" ref={this._editRef} onPointerDown={this.autoMove}>
                                    <FontAwesomeIcon className="fa-icon" icon={this.props.linkDoc.linkAutoMove ? "play" : "pause"} size="sm" /></div>
                            </Tooltip>

                            <Tooltip title={<><div className="dash-tooltip">Edit Link</div></>}>
                                <div className="button" ref={this._editRef} onPointerDown={this.onEdit}>
                                    <FontAwesomeIcon className="fa-icon" icon="edit" size="sm" /></div>
                            </Tooltip>
                            <Tooltip title={<><div className="dash-tooltip">Delete Link</div></>}>
                                <div className="button" onPointerDown={this.deleteLink}>
                                    <FontAwesomeIcon className="fa-icon" icon="trash" size="sm" /></div>
                            </Tooltip>
                        </div>
                    </div>
                </div>

            </div >
        );
    }
}