import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Key, KeyStore } from "../../../fields/Key";
import { NumberField } from "../../../fields/NumberField";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import "./DocumentView.scss";
import React = require("react");
import { DocumentView, DocumentViewProps } from "./DocumentView";
import { Transform } from "../../util/Transform";


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


    getTransform = (): Transform => {
        return this.props.GetTransform().translated(this.props.Document.GetNumber(KeyStore.X, 0), this.props.Document.GetNumber(KeyStore.Y, 0));
    }

    render() {
        var parentScaling = this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
        return (
            <div className="node" ref={this._mainCont} style={{
                transformOrigin: "left top",
                transform: this.transform,
                width: this.width,
                height: this.height,
                position: "absolute",
                zIndex: this.zIndex,
                backgroundColor: "transparent"
            }} >

                <DocumentView {...this.props} Scaling={this.width / this.nativeWidth} GetTransform={this.getTransform} />
            </div>
        );
    }
}