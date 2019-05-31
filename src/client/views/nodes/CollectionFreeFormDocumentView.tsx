import { action, computed, IReactionDisposer, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { createSchema, listSpec, makeInterface } from "../../../new_fields/Schema";
import { BoolCast, Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { OmitKeys, Utils } from "../../../Utils";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { UndoManager } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { DocComponent } from "../DocComponent";
import { DocumentView, DocumentViewProps, positionSchema } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
}

const schema = createSchema({
    zoomBasis: "number",
    zIndex: "number",
});

//TODO Types: The import order is wrong, so positionSchema is undefined
type FreeformDocument = makeInterface<[typeof schema, typeof positionSchema]>;
const FreeformDocument = makeInterface(schema, positionSchema);

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, FreeformDocument>(FreeformDocument) {
    private _mainCont = React.createRef<HTMLDivElement>();
    _bringToFrontDisposer?: IReactionDisposer;

    @computed get transform() {
        return `scale(${this.props.ContentScaling()}, ${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) scale(${this.zoom}, ${this.zoom}) `;
    }

    @computed get X() { return FieldValue(this.Document.x, 0); }
    @computed get Y() { return FieldValue(this.Document.y, 0); }
    @computed get zoom(): number { return 1 / FieldValue(this.Document.zoomBasis, 1); }
    @computed get nativeWidth(): number { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight(): number { return FieldValue(this.Document.nativeHeight, 0); }
    @computed get width(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : FieldValue(this.Document.width, 0); }
    @computed get height(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : FieldValue(this.Document.height, 0); }

    set width(w: number) {
        this.Document.width = w;
        if (this.nativeWidth && this.nativeHeight) {
            this.Document.height = this.nativeHeight / this.nativeWidth * w;
        }
    }
    set height(h: number) {
        this.Document.height = h;
        if (this.nativeWidth && this.nativeHeight) {
            this.Document.width = this.nativeWidth / this.nativeHeight * h;
        }
    }
    contentScaling = () => this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling()).scale(1 / this.zoom)

    @computed
    get docView() {
        return <DocumentView {...OmitKeys(this.props, ['zoomFade']).omit}
            ContentScaling={this.contentScaling}
            ScreenToLocalTransform={this.getTransform}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight}
        />;
    }

    componentDidMount() {
        this._bringToFrontDisposer = reaction(() => this.props.Document.isIconAnimating, (values) => {
            this.props.bringToFront(this.props.Document);
            if (values instanceof List) {
                let scrpt = this.props.ScreenToLocalTransform().transformPoint(values[0], values[1]);
                this.animateBetweenIcon(true, scrpt, [this.Document.x || 0, this.Document.y || 0],
                    this.Document.width || 0, this.Document.height || 0, values[2], values[3] ? true : false);
            }
        }, { fireImmediately: true });
    }

    componentWillUnmount() {
        if (this._bringToFrontDisposer) this._bringToFrontDisposer();
    }

    animateBetweenIcon(first: boolean, icon: number[], targ: number[], width: number, height: number, stime: number, maximizing: boolean) {

        setTimeout(() => {
            let now = Date.now();
            let progress = Math.min(1, (now - stime) / 200);
            let pval = maximizing ?
                [icon[0] + (targ[0] - icon[0]) * progress, icon[1] + (targ[1] - icon[1]) * progress] :
                [targ[0] + (icon[0] - targ[0]) * progress, targ[1] + (icon[1] - targ[1]) * progress];
            this.props.Document.width = maximizing ? 25 + (width - 25) * progress : width + (25 - width) * progress;
            this.props.Document.height = maximizing ? 25 + (height - 25) * progress : height + (25 - height) * progress;
            this.props.Document.x = pval[0];
            this.props.Document.y = pval[1];
            if (first) {
                this.props.Document.proto!.willMaximize = false;
            }
            if (now < stime + 200) {
                this.animateBetweenIcon(false, icon, targ, width, height, stime, maximizing);
            }
            else {
                if (!maximizing) {
                    this.props.Document.proto!.isMinimized = true;
                    this.props.Document.x = targ[0];
                    this.props.Document.y = targ[1];
                    this.props.Document.width = width;
                    this.props.Document.height = height;
                }
                this.props.Document.proto!.isIconAnimating = undefined;
            }
        },
            2);
    }

    borderRounding = () => {
        let br = NumCast(this.props.Document.borderRounding);
        return br >= 0 ? br :
            NumCast(this.props.Document.nativeWidth) === 0 ?
                Math.min(this.props.PanelWidth(), this.props.PanelHeight())
                : Math.min(this.Document.nativeWidth || 0, this.Document.nativeHeight || 0);
    }

    render() {
        let maximizedDoc = FieldValue(Cast(this.props.Document.maximizedDocs, listSpec(Doc)));
        let zoomFade = 1;
        //var zoom = doc.GetNumber(KeyStore.ZoomBasis, 1);
        // let transform = this.getTransform().scale(this.contentScaling()).inverse();
        // var [sptX, sptY] = transform.transformPoint(0, 0);
        // let [bptX, bptY] = transform.transformPoint(this.props.PanelWidth(), this.props.PanelHeight());
        // let w = bptX - sptX;
        //zoomFade = area < 100 || area > 800 ? Math.max(0, Math.min(1, 2 - 5 * (zoom < this.scale ? this.scale / zoom : zoom / this.scale))) : 1;
        const screenWidth = Math.min(50 * NumCast(this.props.Document.nativeWidth, 0), 1800);
        let fadeUp = .75 * screenWidth;
        let fadeDown = (maximizedDoc ? .0075 : .075) * screenWidth;
        // zoomFade = w < fadeDown  /* || w > fadeUp */ ? Math.max(0.1, Math.min(1, 2 - (w < fadeDown ? Math.sqrt(Math.sqrt(fadeDown / w)) : w / fadeUp))) : 1;

        return (
            <div className="collectionFreeFormDocumentView-container" ref={this._mainCont}
                style={{
                    opacity: zoomFade,
                    borderRadius: `${this.borderRounding()}px`,
                    transformOrigin: "left top",
                    transform: this.transform,
                    pointerEvents: (zoomFade < 0.09 ? "none" : "all"),
                    width: this.width,
                    height: this.height,
                    position: "absolute",
                    zIndex: this.Document.zIndex || 0,
                    backgroundColor: "transparent"
                }} >
                {this.docView}
            </div>
        );
    }
}