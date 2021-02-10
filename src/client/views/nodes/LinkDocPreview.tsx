import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip } from '@material-ui/core';
import { action, computed, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import wiki from "wikijs";
import { Doc, DocCastAsync, DocListCast, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { NumCast, StrCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, setupMoveUpEvents, Utils } from "../../../Utils";
import { DocServer } from '../../DocServer';
import { Docs } from "../../documents/Documents";
import { LinkManager } from '../../util/LinkManager';
import { Transform } from "../../util/Transform";
import { DocumentView, DocumentViewSharedProps } from "./DocumentView";
import './LinkDocPreview.scss';
import React = require("react");

interface LinkDocPreviewProps {
    linkDoc?: Doc;
    linkSrc?: Doc;
    href?: string;
    docprops: DocumentViewSharedProps;
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
    @observable _linkTarget: Opt<Doc>;

    @action componentDidUpdate(props: any) {
        if (props.linkSrc !== this.props.linkSrc ||
            props.linkDoc !== this.props.linkDoc ||
            props.hrefs !== this.props.hrefs) {
            this._linkTarget = this.props.linkDoc;
            this._linkSrc = this.props.linkSrc;
            this._linkDoc = this.props.linkDoc;
            this._toolTipText = "";
            this.updatePreview();
        }
    }
    @action componentDidMount() {
        this._linkTarget = this.props.linkDoc;
        this._linkSrc = this.props.linkSrc;
        this._linkDoc = this.props.linkDoc;
        this._toolTipText = "";
        this.updatePreview();
        document.addEventListener("pointerdown", this.onPointerDown);
    }

    componentWillUnmount() {
        LinkDocPreview.SetLinkInfo(undefined);
        document.removeEventListener("pointerdown", this.onPointerDown);
    }

    onPointerDown = (e: PointerEvent) => {
        !this._infoRef.current?.contains(e.target as any) && LinkDocPreview.Clear();
    }

    updatePreview() {
        const linkDoc = this.props.linkDoc;
        const linkSrc = this.props.linkSrc;
        if (this.props.hrefs?.length) {
            const href = this.props.hrefs[this._hrefInd];
            if (href.indexOf(Utils.prepend("/doc/")) !== 0) {
                if (href.startsWith("https://en.wikipedia.org/wiki/")) {
                    wiki().page(href.replace("https://en.wikipedia.org/wiki/", "")).then(page => page.summary().then(action(summary => this._toolTipText = summary.substring(0, 500))));
                } else {
                    runInAction(() => this._toolTipText = "external => " + href);
                }
            } else {
                const anchorDoc = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                anchorDoc && DocServer.GetRefField(anchorDoc).then(action(async anchor => {
                    if (anchor instanceof Doc) {
                        this._linkDoc = DocListCast(anchor.links)[0];
                        this._linkSrc = anchor;
                        const targetanchor = LinkManager.getOppositeAnchor(this._linkDoc, this._linkSrc);
                        runInAction(async () => {
                            this._linkTarget = targetanchor;
                            const target = this._linkTarget?.annotationOn ? await DocCastAsync(this._linkTarget.annotationOn) : this._linkTarget;
                            this._toolTipText = "";
                            runInAction(() => this._targetDoc = target);
                        });
                    }
                }));
            }
        } else if (linkDoc) {
            const anchor1 = linkDoc.anchor1 as Doc;
            const anchor2 = linkDoc.anchor2 as Doc;
            runInAction(async () => {
                this._linkTarget = Doc.AreProtosEqual(anchor1, linkSrc) || Doc.AreProtosEqual(anchor1.annotationOn as Doc, linkSrc) ? anchor2 : anchor1;
                const target = this._linkTarget?.annotationOn ? await DocCastAsync(this._linkTarget.annotationOn) : this._linkTarget;
                this._toolTipText = "";
                runInAction(() => this._targetDoc = target);
            });
        }
    }
    deleteLink = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, action(() => this._linkDoc ? LinkManager.Instance.deleteLink(this._linkDoc) : null));
    }
    nextHref = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, action(() => {
            this._hrefInd = (this._hrefInd + 1) % (this.props.hrefs?.length || 1);
            this.updatePreview();
        }));
    }

    followLink = (e: React.PointerEvent) => {
        if (this._linkDoc && this._linkSrc) {
            LinkManager.FollowLink(this._linkDoc, this._linkSrc, this.props.docprops, false);
        } else if (this.props.href) {
            this.props.docprops?.addDocTab(Docs.Create.WebDocument(this.props.href, { title: this.props.href, _width: 200, _height: 400, useCors: true }), "add:right");
        }
    }
    width = () => Math.min(225, NumCast(this._targetDoc?.[WidthSym](), 225));
    height = () => Math.min(225, NumCast(this._targetDoc?.[HeightSym](), 225));
    @computed get previewHeader() {
        return !this._linkDoc || !this._targetDoc || !this._linkSrc ? (null) :
            <div className="LinkDocPreview-info" ref={this._infoRef}>
                <div className="LinkDocPreview-title">
                    {StrCast(this._targetDoc.title).length > 16 ? StrCast(this._targetDoc.title).substr(0, 16) + "..." : this._targetDoc.title}
                    <p className="LinkDocPreview-description"> {StrCast(this._linkDoc.description)}</p>
                </div>
                <div className="wrapper" style={{ float: "right" }}>
                    {(this.props.hrefs?.length || 0) <= 1 ? (null) :
                        <Tooltip title={<div className="dash-tooltip">Next Link</div>} placement="top">
                            <div className="LinkDocPreview-button" onPointerDown={this.nextHref}>
                                <FontAwesomeIcon className="LinkDocPreview-fa-icon" icon="chevron-right" color="white" size="sm" />
                            </div>
                        </Tooltip>}

                    <Tooltip title={<div className="dash-tooltip">Delete Link</div>} placement="top">
                        <div className="LinkDocPreview-button" onPointerDown={this.deleteLink}>
                            <FontAwesomeIcon className="LinkDocPreview-fa-icon" icon="trash" color="white" size="sm" />
                        </div>
                    </Tooltip>
                </div>
            </div>;
    }

    @computed get docPreview() {
        return (!this._linkDoc || !this._targetDoc || !this._linkSrc) && !this._toolTipText ? (null) :
            <div className="LinkDocPreview-inner">
                {!this.props.showHeader ? (null) : this.previewHeader}
                <div className="LinkDocPreview-preview-wrapper">
                    {this._toolTipText ? this._toolTipText :
                        <DocumentView ref={(r) => {
                            const targetanchor = LinkManager.getOppositeAnchor(this._linkDoc!, this._linkSrc!);
                            targetanchor && this._targetDoc !== targetanchor && r?.focus(targetanchor);
                        }}
                            Document={this._targetDoc}
                            moveDocument={returnFalse}
                            rootSelected={returnFalse}
                            styleProvider={this.props.docprops?.styleProvider}
                            layerProvider={this.props.docprops?.layerProvider}
                            docViewPath={emptyPath}
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
                            focus={emptyFunction}
                            whenActiveChanged={returnFalse}
                            bringToFront={returnFalse}
                            NativeWidth={Doc.NativeWidth(this._targetDoc) ? () => Doc.NativeWidth(this._targetDoc) : undefined}
                            NativeHeight={Doc.NativeHeight(this._targetDoc) ? () => Doc.NativeHeight(this._targetDoc) : undefined}
                        />}
                </div>
            </div>;
    }

    render() {
        return <div className="linkDocPreview" onPointerDown={this.followLink}
            style={{ left: this.props.location[0], top: this.props.location[1], width: this.width() + 16 }}>
            {this.docPreview}
        </div>;
    }
}
