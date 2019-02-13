import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Key, KeyStore } from "../../../fields/Key";
import { NumberField } from "../../../fields/NumberField";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import "./NodeView.scss";
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
    get x(): number {
        return this.props.Document.GetData(KeyStore.X, NumberField, Number(0));
    }

    @computed
    get y(): number {
        return this.props.Document.GetData(KeyStore.Y, NumberField, Number(0));
    }

    set x(x: number) {
        this.props.Document.SetData(KeyStore.X, x, NumberField)
    }

    set y(y: number) {
        this.props.Document.SetData(KeyStore.Y, y, NumberField)
    }

    @computed
    get transform(): string {
        return `scale(${this.props.Scaling}, ${this.props.Scaling}) translate(${this.x}px, ${this.y}px)`;
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
        return this.props.Document.GetData(KeyStore.ZIndex, NumberField, Number(0));
    }

    set zIndex(h: number) {
        this.props.Document.SetData(KeyStore.ZIndex, h, NumberField)
    }


    getTransform = (): Transform => {
        return this.props.GetTransform().translated(this.x, this.y);
    }

    render() {
        var freestyling = this.props.ContainingCollectionView instanceof CollectionFreeFormView;
        return (
            <div className="node" ref={this._mainCont} style={{
                transformOrigin: "left top",
                transform: freestyling ? this.transform : "",
                width: freestyling ? this.width : "100%",
                height: freestyling ? this.height : "100%",
                position: freestyling ? "absolute" : "relative",
                zIndex: freestyling ? this.zIndex : 0,
                backgroundColor: "transparent"
            }} >

                <DocumentView {...this.props} Scaling={this.width / this.nativeWidth} GetTransform={this.getTransform} />
            </div>
        );
    }
}