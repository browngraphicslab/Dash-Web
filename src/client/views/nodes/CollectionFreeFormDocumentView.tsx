import { computed, trace } from "mobx";
import { observer } from "mobx-react";
import { KeyStore } from "../../../fields/KeyStore";
import { NumberField } from "../../../fields/NumberField";
import { Transform } from "../../util/Transform";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");
import { OmitKeys } from "../../../Utils";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
}

@observer
export class CollectionFreeFormDocumentView extends React.Component<CollectionFreeFormDocumentViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();

    @computed
    get transform(): string {
        return `scale(${this.props.ContentScaling()}, ${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) scale(${this.zoom}, ${this.zoom}) `;
    }

    @computed get zoom(): number { return 1 / this.props.Document.GetNumber(KeyStore.Zoom, 1); }
    @computed get zIndex(): number { return this.props.Document.GetNumber(KeyStore.ZIndex, 0); }
    @computed get width(): number { return this.props.Document.Width(); }
    @computed get height(): number { return this.props.Document.Height(); }
    @computed get nativeWidth(): number { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight(): number { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }

    set width(w: number) {
        this.props.Document.SetData(KeyStore.Width, w, NumberField);
        if (this.nativeWidth && this.nativeHeight) {
            this.props.Document.SetNumber(KeyStore.Height, this.nativeHeight / this.nativeWidth * w);
        }
    }

    set height(h: number) {
        this.props.Document.SetData(KeyStore.Height, h, NumberField);
        if (this.nativeWidth && this.nativeHeight) {
            this.props.Document.SetNumber(KeyStore.Width, this.nativeWidth / this.nativeHeight * h);
        }
    }

    set zIndex(h: number) {
        this.props.Document.SetData(KeyStore.ZIndex, h, NumberField);
    }

    get X() {
        return this.props.Document.GetNumber(KeyStore.X, 0);
    }
    get Y() {
        return this.props.Document.GetNumber(KeyStore.Y, 0);
    }
    getTransform = (): Transform =>
        this.props.ScreenToLocalTransform()
            .translate(-this.X, -this.Y)
            .scale(1 / this.contentScaling()).scale(1 / this.zoom)

    contentScaling = () => (this.nativeWidth > 0 ? this.width / this.nativeWidth : 1);
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();

    @computed
    get docView() {
        return <DocumentView {...OmitKeys(this.props, ['zoomFade'])}
            ContentScaling={this.contentScaling}
            ScreenToLocalTransform={this.getTransform}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight}
        />;
    }

    render() {
        let zoomFade = 1;
        //var zoom = doc.GetNumber(KeyStore.Zoom, 1);
        // let transform = this.getTransform().scale(this.contentScaling()).inverse();
        // var [sptX, sptY] = transform.transformPoint(0, 0);
        // let [bptX, bptY] = transform.transformPoint(this.props.PanelWidth(), this.props.PanelHeight());
        // let w = bptX - sptX;
        // //zoomFade = area < 100 || area > 800 ? Math.max(0, Math.min(1, 2 - 5 * (zoom < this.scale ? this.scale / zoom : zoom / this.scale))) : 1;
        // let fadeUp = .75 * 1800;
        // let fadeDown = .075 * 1800;
        // zoomFade = w < fadeDown  /* || w > fadeUp */ ? Math.max(0, Math.min(1, 2 - (w < fadeDown ? fadeDown / w : w / fadeUp))) : 1;

        return (
            <div className="collectionFreeFormDocumentView-container" ref={this._mainCont} style={{
                opacity: zoomFade,
                transformOrigin: "left top",
                transform: this.transform,
                pointerEvents: (zoomFade < 0.09 ? "none" : "all"),
                width: this.width,
                height: this.height,
                position: "absolute",
                zIndex: this.zIndex,
                backgroundColor: "transparent"
            }} >
                {this.docView}
            </div>
        );
    }
}