import { computed } from "mobx";
import { observer } from "mobx-react";
import { KeyStore } from "../../../fields/KeyStore";
import { NumberField } from "../../../fields/NumberField";
import { Transform } from "../../util/Transform";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");


@observer
export class CollectionFreeFormDocumentView extends React.Component<DocumentViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();

    constructor(props: DocumentViewProps) {
        super(props);
    }

    @computed
    get transform(): string {
        return `scale(${this.props.ContentScaling()}, ${this.props.ContentScaling()}) translate(${this.props.Document.GetNumber(KeyStore.X, 0)}px, ${this.props.Document.GetNumber(KeyStore.Y, 0)}px) scale(${this.zoom}, ${this.zoom}) `;
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

    contentScaling = () => this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;

    getTransform = (): Transform =>
        this.props.ScreenToLocalTransform()
            .translate(-this.props.Document.GetNumber(KeyStore.X, 0), -this.props.Document.GetNumber(KeyStore.Y, 0))
            .scale(1 / this.contentScaling()).scale(1 / this.zoom)

    @computed
    get docView() {
        return <DocumentView {...this.props}
            ContentScaling={this.contentScaling}
            ScreenToLocalTransform={this.getTransform}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight}
        />;
    }
    panelWidth = () => this.props.Document.GetBoolean(KeyStore.Minimized, false) ? 10 : this.props.PanelWidth();
    panelHeight = () => this.props.Document.GetBoolean(KeyStore.Minimized, false) ? 10 : this.props.PanelHeight();

    render() {
        return (
            <div className="collectionFreeFormDocumentView-container" ref={this._mainCont} style={{
                opacity: this.props.opacity,
                transformOrigin: "left top",
                transform: this.transform,
                pointerEvents: "all",
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