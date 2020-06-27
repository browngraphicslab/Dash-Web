import { action, computed, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import wiki from "wikijs";
import { Doc, DocCastAsync, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { Cast, FieldValue, NumCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnEmptyFilter, returnFalse, returnOne, returnZero } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { Transform } from "../../util/Transform";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";
import React = require("react");
import { DocumentView } from './DocumentView';

interface Props {
    linkDoc?: Doc;
    linkSrc?: Doc;
    href?: string;
    backgroundColor: (doc: Doc) => string;
    addDocTab: (document: Doc, where: string) => boolean;
    location: number[];
}
@observer
export class LinkDocPreview extends React.Component<Props> {
    @observable public static LinkInfo: Opt<{ linkDoc?: Doc; addDocTab: (document: Doc, where: string) => boolean, linkSrc: Doc; href?: string; Location: number[] }>;
    @observable _targetDoc: Opt<Doc>;
    @observable _toolTipText = "";

    componentDidUpdate() { this.updatePreview(); }
    componentDidMount() { this.updatePreview(); }
    async updatePreview() {
        const linkDoc = this.props.linkDoc;
        const linkSrc = this.props.linkSrc;
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
                this._targetDoc = target;
                if (anchor !== this._targetDoc && anchor && this._targetDoc) {
                    this._targetDoc._scrollY = NumCast(anchor?.y);
                }
            });
        }
    }
    pointerDown = (e: React.PointerEvent) => {
        if (this.props.linkDoc && this.props.linkSrc) {
            DocumentManager.Instance.FollowLink(this.props.linkDoc, this.props.linkSrc,
                (doc: Doc, followLinkLocation: string) => this.props.addDocTab(doc, e.ctrlKey ? "inTab" : followLinkLocation));
        } else if (this.props.href) {
            this.props.addDocTab(Docs.Create.WebDocument(this.props.href, { title: this.props.href, _width: 200, _height: 400, UseCors: true }), "onRight");
        }
    }
    width = () => Math.min(350, NumCast(this._targetDoc?.[WidthSym](), 350));
    height = () => Math.min(350, NumCast(this._targetDoc?.[HeightSym](), 350));
    @computed get targetDocView() {
        return !this._targetDoc ?
            <div style={{ pointerEvents: "all", maxWidth: 350, maxHeight: 250, width: "100%", height: "100%", overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", textOverflow: "ellipsis", }} onPointerDown={this.pointerDown}>
                    {this._toolTipText}
                </div>
            </div> :
            <ContentFittingDocumentView
                Document={this._targetDoc}
                LibraryPath={emptyPath}
                fitToBox={true}
                backgroundColor={this.props.backgroundColor}
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
                ContainingCollectionDoc={undefined}
                ContainingCollectionView={undefined}
                renderDepth={0}
                PanelWidth={this.width}
                PanelHeight={this.height}
                focus={emptyFunction}
                whenActiveChanged={returnFalse}
                bringToFront={returnFalse}
                ContentScaling={returnOne}
                NativeWidth={returnZero}
                NativeHeight={returnZero}
            />;
    }

    render() {
        return <div className="linkDocPreview"
            style={{
                position: "absolute", left: this.props.location[0],
                top: this.props.location[1], width: this.width(), height: this.height(),
                boxShadow: "black 2px 2px 1em"
            }}>
            {this.targetDocView}
        </div>;
    }
}