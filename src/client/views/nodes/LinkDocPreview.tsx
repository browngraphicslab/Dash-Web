import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip } from '@material-ui/core';
import { action, computed, observable } from 'mobx';
import { observer } from "mobx-react";
import wiki from "wikijs";
import { Doc, DocListCast, HeightSym, Opt, WidthSym, DocCastAsync } from "../../../fields/Doc";
import { NumCast, StrCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, setupMoveUpEvents, Utils } from "../../../Utils";
import { DocServer } from '../../DocServer';
import { Docs, DocUtils } from "../../documents/Documents";
import { LinkManager } from '../../util/LinkManager';
import { Transform } from "../../util/Transform";
import { undoBatch } from '../../util/UndoManager';
import { DocumentView, DocumentViewSharedProps } from "./DocumentView";
import './LinkDocPreview.scss';
import React = require("react");

interface LinkDocPreviewProps {
    linkDoc?: Doc;
    linkSrc?: Doc;
    docProps: DocumentViewSharedProps;
    location: number[];
    hrefs?: string[];
    showHeader?: boolean;
}
@observer
export class LinkDocPreview extends React.Component<LinkDocPreviewProps> {
    @action public static Clear() { LinkDocPreview.LinkInfo = undefined; }
    @action public static SetLinkInfo(info?: LinkDocPreviewProps) { LinkDocPreview.LinkInfo != info && (LinkDocPreview.LinkInfo = info); }

    _infoRef = React.createRef<HTMLDivElement>();
    @observable public static LinkInfo: Opt<LinkDocPreviewProps>;
    @observable _targetDoc: Opt<Doc>;
    @observable _linkDoc: Opt<Doc>;
    @observable _linkSrc: Opt<Doc>;
    @observable _toolTipText = "";
    @observable _hrefInd = 0;

    @action init() {
        var linkTarget = this.props.linkDoc;
        this._linkSrc = this.props.linkSrc;
        this._linkDoc = this.props.linkDoc;
        const anchor1 = this._linkDoc?.anchor1 as Doc;
        const anchor2 = this._linkDoc?.anchor2 as Doc;
        if (anchor1 && anchor2) {
            linkTarget = Doc.AreProtosEqual(anchor1, this._linkSrc) || Doc.AreProtosEqual(anchor1?.annotationOn as Doc, this._linkSrc) ? anchor2 : anchor1;
        }
        if (linkTarget?.annotationOn) {
            linkTarget && DocCastAsync(linkTarget.annotationOn).then(action(anno => this._targetDoc = anno));
        } else {
            this._targetDoc = linkTarget;
        }
        this._toolTipText = "";
    }
    componentDidUpdate(props: any) {
        if (props.linkSrc !== this.props.linkSrc || props.linkDoc !== this.props.linkDoc || props.hrefs !== this.props.hrefs) this.init();
    }
    componentDidMount() {
        this.init();
        document.addEventListener("pointerdown", this.onPointerDown);
    }

    componentWillUnmount() {
        LinkDocPreview.SetLinkInfo(undefined);
        document.removeEventListener("pointerdown", this.onPointerDown);
    }

    onPointerDown = (e: PointerEvent) => {
        !this._infoRef.current?.contains(e.target as any) && LinkDocPreview.Clear(); // close preview when not clicking anywhere other than the info bar of the preview
    }

    @computed get href() {
        if (this.props.hrefs?.length) {
            const href = this.props.hrefs[this._hrefInd];
            if (href.indexOf(Utils.prepend("/doc/")) !== 0) {  // link to a web page URL -- try to show a preview
                if (href.startsWith("https://en.wikipedia.org/wiki/")) {
                    wiki().page(href.replace("https://en.wikipedia.org/wiki/", "")).then(page => page.summary().then(action(summary => this._toolTipText = summary.substring(0, 500))));
                } else {
                    setTimeout(action(() => this._toolTipText = "url => " + href));
                }
            } else { // hyperlink to a document .. decode doc id and retrieve from the server. this will trigger vals() being invalidated
                const anchorDoc = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                anchorDoc && DocServer.GetRefField(anchorDoc).then(action(anchor => {
                    if (anchor instanceof Doc && DocListCast(anchor.links).length) {
                        this._linkDoc = DocListCast(anchor.links)[0];
                        this._linkSrc = anchor;
                        const linkTarget = LinkManager.getOppositeAnchor(this._linkDoc, this._linkSrc);
                        this._targetDoc = linkTarget?.annotationOn as Doc ?? linkTarget;
                        this._toolTipText = "";
                    }
                }));
            }
            return href;
        }
        return undefined;
    }
    deleteLink = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, undoBatch(() => this._linkDoc && LinkManager.Instance.deleteLink(this._linkDoc)));
    }
    nextHref = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, action(() => this._hrefInd = (this._hrefInd + 1) % (this.props.hrefs?.length || 1)));
    }

    followLink = (e: React.PointerEvent) => {
        if (this._linkDoc && this._linkSrc) {
            LinkDocPreview.Clear();
            LinkManager.FollowLink(this._linkDoc, this._linkSrc, this.props.docProps, false);
        } else if (this.props.hrefs?.length) {
            this.props.docProps?.addDocTab(Docs.Create.WebDocument(this.props.hrefs[0], { title: this.props.hrefs[0], _width: 200, _height: 400, useCors: true }), "add:right");
        }
    }
    width = () => {
        if (!this._targetDoc) return 225;
        if (this._targetDoc[WidthSym]() < this._targetDoc?.[HeightSym]()) {
            return Math.min(225, this._targetDoc[HeightSym]()) * this._targetDoc[WidthSym]() / this._targetDoc[HeightSym]();
        }
        return Math.min(225, NumCast(this._targetDoc?.[WidthSym](), 225));
    }
    height = () => {
        if (!this._targetDoc) return 225;
        if (this._targetDoc[WidthSym]() > this._targetDoc?.[HeightSym]()) {
            return Math.min(225, this._targetDoc[WidthSym]()) * this._targetDoc[HeightSym]() / this._targetDoc[WidthSym]();
        }
        return Math.min(225, NumCast(this._targetDoc?.[HeightSym](), 225));
    }
    @computed get previewHeader() {
        return !this._linkDoc || !this._targetDoc || !this._linkSrc ? (null) :
            <div className="linkDocPreview-info" ref={this._infoRef}>
                <div className="linkDocPreview-title">
                    {StrCast(this._targetDoc.title).length > 16 ? StrCast(this._targetDoc.title).substr(0, 16) + "..." : this._targetDoc.title}
                    <p className="linkDocPreview-description"> {StrCast(this._linkDoc.description)}</p>
                </div>
                <div className="linkDocPreview-buttonBar" >
                    <Tooltip title={<div className="dash-tooltip">Next Link</div>} placement="top">
                        <div className="linkDocPreview-button" style={{ background: (this.props.hrefs?.length || 0) <= 1 ? "gray" : "green" }} onPointerDown={this.nextHref}>
                            <FontAwesomeIcon className="linkDocPreview-fa-icon" icon="chevron-right" color="white" size="sm" />
                        </div>
                    </Tooltip>

                    <Tooltip title={<div className="dash-tooltip">Delete Link</div>} placement="top">
                        <div className="linkDocPreview-button" onPointerDown={this.deleteLink}>
                            <FontAwesomeIcon className="linkDocPreview-fa-icon" icon="trash" color="white" size="sm" />
                        </div>
                    </Tooltip>
                </div>
            </div>;
    }

    @computed get docPreview() {
        const href = this.href; // needs to be here to trigger lookup of web pages and docs on server
        return (!this._linkDoc || !this._targetDoc || !this._linkSrc) && !this._toolTipText ? (null) :
            <div className="linkDocPreview-inner">
                {!this.props.showHeader ? (null) : this.previewHeader}
                <div className="linkDocPreview-preview-wrapper">
                    {this._toolTipText ? this._toolTipText :
                        <DocumentView ref={(r) => {
                            const targetanchor = LinkManager.getOppositeAnchor(this._linkDoc!, this._linkSrc!);
                            targetanchor && this._targetDoc !== targetanchor && r?.focus(targetanchor);
                        }}
                            Document={this._targetDoc!}
                            moveDocument={returnFalse}
                            rootSelected={returnFalse}
                            styleProvider={this.props.docProps?.styleProvider}
                            layerProvider={this.props.docProps?.layerProvider}
                            docViewPath={returnEmptyDoclist}
                            ScreenToLocalTransform={Transform.Identity}
                            parentActive={returnFalse}
                            addDocument={returnFalse}
                            removeDocument={returnFalse}
                            addDocTab={returnFalse}
                            pinToPres={returnFalse}
                            dontRegisterView={true}
                            docFilters={returnEmptyFilter}
                            docRangeFilters={returnEmptyFilter}
                            searchFilterDocs={returnEmptyDoclist}
                            ContainingCollectionDoc={undefined}
                            ContainingCollectionView={undefined}
                            renderDepth={-1}
                            PanelWidth={this.width}
                            PanelHeight={this.height}
                            focus={DocUtils.DefaultFocus}
                            whenActiveChanged={returnFalse}
                            bringToFront={returnFalse}
                            NativeWidth={Doc.NativeWidth(this._targetDoc) ? () => Doc.NativeWidth(this._targetDoc) : undefined}
                            NativeHeight={Doc.NativeHeight(this._targetDoc) ? () => Doc.NativeHeight(this._targetDoc) : undefined}
                        />}
                </div>
            </div>;
    }

    render() {
        const borders = 16; // 8px border on each side
        return <div className="linkDocPreview" onPointerDown={this.followLink}
            style={{ left: this.props.location[0], top: this.props.location[1], width: this.width() + borders, height: this.height() + borders + (this.props.showHeader ? 37 : 0) }}>
            {this.docPreview}
        </div>;
    }
}