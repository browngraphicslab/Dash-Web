import { action, computed, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import wiki from "wikijs";
import { Doc, DocCastAsync, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { Id } from '../../../fields/FieldSymbols';
import { Cast, FieldValue, NumCast } from "../../../fields/Types";
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnFalse, emptyPath } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { LinkManager } from '../../util/LinkManager';
import { Transform } from "../../util/Transform";
import { ContextMenu } from '../ContextMenu';
import { DocumentLinksButton } from './DocumentLinksButton';
import { DocumentView, StyleProviderFunc, DocumentViewSharedProps } from "./DocumentView";
import React = require("react");

interface Props {
    linkDoc?: Doc;
    linkSrc?: Doc;
    href?: string;
    docprops: DocumentViewSharedProps;
    location: number[];
}
@observer
export class LinkDocPreview extends React.Component<Props> {
    static TargetDoc: Doc | undefined;
    @observable public static LinkInfo: Opt<{ linkDoc?: Doc; linkSrc: Doc; href?: string; Location: number[], docprops: DocumentViewSharedProps }>;
    @observable _targetDoc: Opt<Doc>;
    @observable _toolTipText = "";
    _linkTarget: Opt<Doc>;
    _editRef = React.createRef<HTMLDivElement>();

    @action
    onContextMenu = (e: React.MouseEvent) => {
        DocumentLinksButton.EditLink = undefined;
        LinkDocPreview.LinkInfo = undefined;
        e.preventDefault();
        ContextMenu.Instance.addItem({ description: "Follow Default Link", event: () => this.followDefault(), icon: "arrow-right" });
        ContextMenu.Instance.displayMenu(e.clientX, e.clientY);
    }

    @action.bound
    async followDefault() {
        DocumentLinksButton.EditLink = undefined;
        LinkDocPreview.LinkInfo = undefined;
        this._targetDoc && LinkManager.FollowLink(this.props.linkDoc, this._targetDoc, this.props.docprops, false);
    }
    componentWillUnmount() { LinkDocPreview.TargetDoc = undefined; }

    componentDidUpdate() { this.updatePreview(); }
    componentDidMount() { this.updatePreview(); }
    async updatePreview() {
        const linkDoc = this.props.linkDoc;
        const linkSrc = this.props.linkSrc;
        LinkDocPreview.TargetDoc = undefined;
        if (this.props.href) {
            if (this.props.href.startsWith("https://en.wikipedia.org/wiki/")) {
                wiki().page(this.props.href.replace("https://en.wikipedia.org/wiki/", "")).then(page => page.summary().then(action(summary => this._toolTipText = summary.substring(0, 500))));
            } else {
                runInAction(() => this._toolTipText = "external => " + this.props.href);
            }
        } else if (linkDoc && linkSrc) {
            const anchor1 = linkDoc.anchor1 as Doc;
            const anchor2 = linkDoc.anchor2 as Doc;
            this._linkTarget = Doc.AreProtosEqual(anchor1, linkSrc) || Doc.AreProtosEqual(anchor1.annotationOn as Doc, linkSrc) ? anchor2 : anchor1;
            const target = this._linkTarget?.annotationOn ? await DocCastAsync(this._linkTarget.annotationOn) : this._linkTarget;
            runInAction(() => {
                this._toolTipText = "";
                LinkDocPreview.TargetDoc = this._targetDoc = target;
            });
        }
    }
    pointerDown = (e: React.PointerEvent) => {
        if (this.props.linkDoc && this.props.linkSrc) {
            LinkManager.FollowLink(this.props.linkDoc, this.props.linkSrc, this.props.docprops, false);
        } else if (this.props.href) {
            this.props.docprops?.addDocTab(Docs.Create.WebDocument(this.props.href, { title: this.props.href, _width: 200, _height: 400, useCors: true }), "add:right");
        }
    }
    width = () => Math.min(225, NumCast(this._targetDoc?.[WidthSym](), 225));
    height = () => Math.min(225, NumCast(this._targetDoc?.[HeightSym](), 225));
    @computed get targetDocView() {
        return !this._targetDoc ?
            <div style={{ pointerEvents: "all", maxWidth: 225, maxHeight: 225, width: "100%", height: "100%", overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", textOverflow: "ellipsis", }} onPointerDown={this.pointerDown}>
                    {this._toolTipText}
                </div>
            </div>
            :
            <DocumentView ref={r => this._linkTarget !== this._targetDoc && this._linkTarget && r?.focus(this._linkTarget)}
                Document={this._targetDoc}
                moveDocument={returnFalse}
                rootSelected={returnFalse}
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
                styleProvider={this.props.docprops?.styleProvider}
                layerProvider={this.props.docprops?.layerProvider}
                docViewPath={emptyPath}
            />;
    }

    render() {
        return <div className="linkDocPreview"
            style={{
                position: "absolute", left: this.props.location[0],
                top: this.props.location[1], width: this.width() + 16, height: this.height() + 16,
                zIndex: 1000,
                backgroundColor: "lightblue",
                border: "8px solid white", borderRadius: "7px",
                boxShadow: "3px 3px 1.5px grey",
                borderBottom: "8px solid white", borderRight: "8px solid white"
            }}>
            {this.targetDocView}
        </div>;
    }
}
