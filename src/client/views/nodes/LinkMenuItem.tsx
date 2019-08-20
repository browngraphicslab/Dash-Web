import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faEye, faTimes, faArrowRight, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { observer } from "mobx-react";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import './LinkMenu.scss';
import React = require("react");
import { Doc, DocListCastAsync } from '../../../new_fields/Doc';
import { StrCast, Cast, FieldValue, NumCast } from '../../../new_fields/Types';
import { observable, action } from 'mobx';
import { LinkManager } from '../../util/LinkManager';
import { DragLinkAsDocument } from '../../util/DragManager';
import { CollectionDockingView } from '../collections/CollectionDockingView';
import { SelectionManager } from '../../util/SelectionManager';
import { CollectionViewType } from '../collections/CollectionBaseView';
import { DocumentView } from './DocumentView';
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


    unhighlight = () => {
        Doc.UnhighlightAll();
        document.removeEventListener("pointerdown", this.unhighlight);
    }

    @action
    highlightDoc = () => {
        document.removeEventListener("pointerdown", this.unhighlight);
        Doc.HighlightDoc(this.props.destinationDoc);
        window.setTimeout(() => {
            document.addEventListener("pointerdown", this.unhighlight);
        }, 10000);
    }

    // NOT DONE?
    // col = collection the doc is in
    // target = the document to center on
    @undoBatch
    openLinkColRight = ({ col, target }: { col: Doc, target: Doc }) => {
        col = Doc.IsPrototype(col) ? Doc.MakeDelegate(col) : col;
        if (NumCast(col.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
            const newPanX = NumCast(target.x) + NumCast(target.width) / NumCast(target.zoomBasis, 1) / 2;
            const newPanY = NumCast(target.y) + NumCast(target.height) / NumCast(target.zoomBasis, 1) / 2;
            col.panX = newPanX;
            col.panY = newPanY;
        }
        CollectionDockingView.Instance.AddRightSplit(col, undefined);
    }

    // DONE
    // this opens the linked doc in a right split, NOT in its collection
    @undoBatch
    openLinkRight = () => {
        this.highlightDoc();
        let alias = Doc.MakeAlias(this.props.destinationDoc);
        CollectionDockingView.Instance.AddRightSplit(alias, undefined);
        SelectionManager.DeselectAll();
    }

    // DONE
    // this is the standard "follow link" (jump to document)
    // taken from follow link
    @undoBatch
    jumpToLink = async (shouldZoom: boolean = false) => {
        this.highlightDoc();
        let jumpToDoc = this.props.destinationDoc;
        let pdfDoc = FieldValue(Cast(this.props.destinationDoc, Doc));
        if (pdfDoc) {
            jumpToDoc = pdfDoc;
        }
        let proto = Doc.GetProto(this.props.linkDoc);
        let targetContext = await Cast(proto.targetContext, Doc);
        let sourceContext = await Cast(proto.sourceContext, Doc);
        let self = this;

        let dockingFunc = (document: Doc) => { this.props.addDocTab(document, undefined, "inTab"); SelectionManager.DeselectAll(); };

        if (this.props.destinationDoc === self.props.linkDoc.anchor2 && targetContext) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, false, async document => dockingFunc(document), undefined, targetContext!);
        }
        else if (this.props.destinationDoc === self.props.linkDoc.anchor1 && sourceContext) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, false, document => dockingFunc(sourceContext!));
        }
        else if (DocumentManager.Instance.getDocumentView(jumpToDoc)) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, undefined, undefined, NumCast((this.props.destinationDoc === self.props.linkDoc.anchor2 ? self.props.linkDoc.anchor2Page : self.props.linkDoc.anchor1Page)));

        }
        else {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, false, dockingFunc);
        }
    }

    // DONE
    // opens link in new tab (not in a collection)
    // this opens it full screen, do we need a separate full screen option?
    @undoBatch
    openLinkTab = () => {
        this.highlightDoc();
        let fullScreenAlias = Doc.MakeAlias(this.props.destinationDoc);
        this.props.addDocTab(fullScreenAlias, undefined, "inTab");
        SelectionManager.DeselectAll();
    }

    //opens link in new tab in collection
    // col = collection the doc is in
    // target = the document to center on
    @undoBatch
    openLinkColTab = ({ col, target }: { col: Doc, target: Doc }) => {
        this.highlightDoc();
    }

    // this will open a link next to the source doc
    @undoBatch
    openLinkInPlace = () => {
        this.highlightDoc();

        let alias = Doc.MakeAlias(this.props.destinationDoc);
        let y = this.props.sourceDoc.y;
        let x = this.props.sourceDoc.x;

        console.log(x, y);
    }

    //set this to be the default link behavior, can be any of the above
    private defaultLinkBehavior: any = this.openLinkRight;

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
                            {/* Original */}
                            {/* <div title="Follow link" className="button" onPointerDown={this.onFollowLink}><FontAwesomeIcon className="fa-icon" icon="arrow-right" size="sm" /></div> */}
                            {/* New */}
                            <div title="Follow link" className="button" onPointerDown={this.defaultLinkBehavior}><FontAwesomeIcon className="fa-icon" icon="arrow-right" size="sm" /></div>
                        </div>
                    </div>
                    {this._showMore ? this.renderMetadata() : <></>}
                </div>

            </div >
        );
    }
}

    // @undoBatch
    // onFollowLink = async (e: React.PointerEvent): Promise<void> => {
    //     e.stopPropagation();
    //     e.persist();
    //     let jumpToDoc = this.props.destinationDoc;
    //     let pdfDoc = FieldValue(Cast(this.props.destinationDoc, Doc));
    //     if (pdfDoc) {
    //         jumpToDoc = pdfDoc;
    //     }
    //     let proto = Doc.GetProto(this.props.linkDoc);
    //     let targetContext = await Cast(proto.targetContext, Doc);
    //     let sourceContext = await Cast(proto.sourceContext, Doc);
    //     let self = this;


    //     let dockingFunc = (document: Doc) => { this.props.addDocTab(document, undefined, "inTab"); SelectionManager.DeselectAll(); };
    //     if (e.ctrlKey) {
    //         dockingFunc = (document: Doc) => CollectionDockingView.Instance.AddRightSplit(document, undefined);
    //     }

    //     if (this.props.destinationDoc === self.props.linkDoc.anchor2 && targetContext) {
    //         DocumentManager.Instance.jumpToDocument(jumpToDoc, e.altKey, false, async document => dockingFunc(document), undefined, targetContext!);
    //         console.log("1")
    //     }
    //     else if (this.props.destinationDoc === self.props.linkDoc.anchor1 && sourceContext) {
    //         DocumentManager.Instance.jumpToDocument(jumpToDoc, e.altKey, false, document => dockingFunc(sourceContext!));
    //         console.log("2")
    //     }
    //     else if (DocumentManager.Instance.getDocumentView(jumpToDoc)) {
    //         DocumentManager.Instance.jumpToDocument(jumpToDoc, e.altKey, undefined, undefined, NumCast((this.props.destinationDoc === self.props.linkDoc.anchor2 ? self.props.linkDoc.anchor2Page : self.props.linkDoc.anchor1Page)));
    //         console.log("3")

    //     }
    //     else {
    //         DocumentManager.Instance.jumpToDocument(jumpToDoc, e.altKey, false, dockingFunc);
    //         console.log("4")

    //     }
    // }