import { computed, trace } from "mobx";
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
    get screenRect(): ClientRect | DOMRect {
        if (this._mainCont.current) {
            return this._mainCont.current.getBoundingClientRect();
        }
        return new DOMRect();
    }

    @computed
    get transform(): string {
        return `scale(${this.props.Scaling}, ${this.props.Scaling}) translate(${this.props.Document.GetNumber(KeyStore.X, 0)}px, ${this.props.Document.GetNumber(KeyStore.Y, 0)}px)`;
    }

    @computed
    get width(): number {
        return this.props.Document.GetNumber(KeyStore.Width, 0);
    }

    @computed
    get nativeWidth(): number {
        return this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
    }

    set width(w: number) {
        this.props.Document.SetData(KeyStore.Width, w, NumberField)
        if (this.nativeWidth > 0 && this.nativeHeight > 0) {
            this.props.Document.SetNumber(KeyStore.Height, this.nativeHeight / this.nativeWidth * w)
        }
    }

    @computed
    get height(): number {
        return this.props.Document.GetNumber(KeyStore.Height, 0);
    }
    @computed
    get nativeHeight(): number {
        return this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
    }

    set height(h: number) {
        this.props.Document.SetData(KeyStore.Height, h, NumberField);
        if (this.nativeWidth > 0 && this.nativeHeight > 0) {
            this.props.Document.SetNumber(KeyStore.Width, this.nativeWidth / this.nativeHeight * h)
        }
    }

    @computed
    get zIndex(): number {
        return this.props.Document.GetNumber(KeyStore.ZIndex, 0);
    }

    set zIndex(h: number) {
        this.props.Document.SetData(KeyStore.ZIndex, h, NumberField)
    }

    @computed
    get parentScaling() {
        return this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
    }

    getTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().
            translate(-this.props.Document.GetNumber(KeyStore.X, 0), -this.props.Document.GetNumber(KeyStore.Y, 0)).scale(1 / this.parentScaling);
    }

    @computed
    get docView() {
        return <DocumentView {...this.props}
            Scaling={this.parentScaling}
            ScreenToLocalTransform={this.getTransform}
        />
    }

    render() {
        return (
            <div ref={this._mainCont} style={{
                transformOrigin: "left top",
                transform: this.transform,
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