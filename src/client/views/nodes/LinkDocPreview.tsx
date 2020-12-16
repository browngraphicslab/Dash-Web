import { action, computed, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import wiki from "wikijs";
import { Doc, DocCastAsync, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { Id } from '../../../fields/FieldSymbols';
import { Cast, FieldValue, NumCast } from "../../../fields/Types";
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnFalse } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { Transform } from "../../util/Transform";
import { ContextMenu } from '../ContextMenu';
import { DocumentLinksButton } from './DocumentLinksButton';
import { DocumentView, StyleProviderFunc } from "./DocumentView";
import React = require("react");

interface Props {
    linkDoc?: Doc;
    linkSrc?: Doc;
    href?: string;
    styleProvider?: StyleProviderFunc;
    addDocTab: (document: Doc, where: string) => boolean;
    location: number[];
}
@observer
export class LinkDocPreview extends React.Component<Props> {
    static TargetDoc: Doc | undefined;
    @observable public static LinkInfo: Opt<{ linkDoc?: Doc; addDocTab: (document: Doc, where: string) => boolean, linkSrc: Doc; href?: string; Location: number[] }>;
    @observable _targetDoc: Opt<Doc>;
    @observable _toolTipText = "";
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
        this._targetDoc ? DocumentManager.Instance.FollowLink(this.props.linkDoc, this._targetDoc, (doc, where) => this.props.addDocTab(doc, where), false) : null;
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
            const anchor = FieldValue(Doc.AreProtosEqual(FieldValue(Cast(linkDoc.anchor1, Doc)), linkSrc) ? Cast(linkDoc.anchor2, Doc) : (Cast(linkDoc.anchor1, Doc)) || linkDoc);
            const target = anchor?.annotationOn ? await DocCastAsync(anchor.annotationOn) : anchor;
            runInAction(() => {
                this._toolTipText = "";
                LinkDocPreview.TargetDoc = this._targetDoc = target;
                if (this._targetDoc) {
                    this._targetDoc._scrollToPreviewLinkID = linkDoc?.[Id];
                    if (anchor !== this._targetDoc && anchor) {
                        this._targetDoc._scrollPreviewY = NumCast(anchor?.y);
                    }
                }
            });
        }
    }
    pointerDown = (e: React.PointerEvent) => {
        if (this.props.linkDoc && this.props.linkSrc) {
            DocumentManager.Instance.FollowLink(this.props.linkDoc, this.props.linkSrc,
                (doc: Doc, followLinkLocation: string) => this.props.addDocTab(doc, e.ctrlKey ? "add" : followLinkLocation));
        } else if (this.props.href) {
            this.props.addDocTab(Docs.Create.WebDocument(this.props.href, { _fitWidth: true, title: this.props.href, _width: 200, _height: 400, useCors: true }), "add:right");
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
            <DocumentView
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
                styleProvider={this.props.styleProvider} />;
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
