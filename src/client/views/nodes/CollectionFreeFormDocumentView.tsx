import { computed, trace, reaction, runInAction, observable } from "mobx";
import { observer } from "mobx-react";
import { KeyStore } from "../../../fields/KeyStore";
import { NumberField } from "../../../fields/NumberField";
import { Transform } from "../../util/Transform";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");
import { Document } from "../../../fields/Document";
import { DocumentManager } from "../../util/DocumentManager";


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
        return `scale(${this.props.ContentScaling()}, ${this.props.ContentScaling()}) translate(${this.props.Document.GetNumber(KeyStore.X, 0)}px, ${this.props.Document.GetNumber(KeyStore.Y, 0)}px)`;
    }

    @computed get zIndex(): number { return this.props.Document.GetNumber(KeyStore.ZIndex, 0); }
    @computed get width(): number { return this.props.Document.Width(); }
    @computed get height(): number { return this.props.Document.Height(); }
    @computed get nativeWidth(): number { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight(): number { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }

    set width(w: number) {
        this.props.Document.SetData(KeyStore.Width, w, NumberField)
        if (this.nativeWidth && this.nativeHeight) {
            this.props.Document.SetNumber(KeyStore.Height, this.nativeHeight / this.nativeWidth * w)
        }
    }

    set height(h: number) {
        this.props.Document.SetData(KeyStore.Height, h, NumberField);
        if (this.nativeWidth && this.nativeHeight) {
            this.props.Document.SetNumber(KeyStore.Width, this.nativeWidth / this.nativeHeight * h)
        }
    }

    set zIndex(h: number) {
        this.props.Document.SetData(KeyStore.ZIndex, h, NumberField)
    }

    contentScaling = () => {
        return this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
    }

    getTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().
            translate(-this.props.Document.GetNumber(KeyStore.X, 0), -this.props.Document.GetNumber(KeyStore.Y, 0)).scale(1 / this.contentScaling());
    }

    @computed
    get docView() {
        return <DocumentView {...this.props}
            ContentScaling={this.contentScaling}
            ScreenToLocalTransform={this.getTransform}
        />
    }
    @observable _docView1: DocumentView | null = null;
    @observable _docView2: DocumentView | null = null;

    componentDidMount() {
        reaction(() => {
            let linkFrom = this.props.Document.GetT(KeyStore.LinkedFromDocs, Document);
            let linkTo = this.props.Document.GetT(KeyStore.LinkedToDocs, Document);
            let docView1: DocumentView | null = null;
            let docView2: DocumentView | null = null;
            if (linkFrom instanceof Document && linkTo instanceof Document) {
                docView1 = DocumentManager.Instance.getDocumentView(linkFrom);
                docView2 = DocumentManager.Instance.getDocumentView(linkTo);
            }
            return [docView1, docView2];
        }, (vals) => runInAction(() => {
            this._docView1 = vals[0];
            this._docView2 = vals[1];
        }), { fireImmediately: true });
    }

    render() {
        if (this._docView1 != null && this._docView2 != null) {
            let doc1 = this._docView1.props.Document;
            let doc2 = this._docView2.props.Document;
            let x1 = doc1.GetNumber(KeyStore.X, 0) + doc1.GetNumber(KeyStore.Width, 0) / 2;
            let y1 = doc1.GetNumber(KeyStore.Y, 0) + doc1.GetNumber(KeyStore.Height, 0) / 2;
            let x2 = doc2.GetNumber(KeyStore.X, 0) + doc2.GetNumber(KeyStore.Width, 0) / 2;
            let y2 = doc2.GetNumber(KeyStore.Y, 0) + doc2.GetNumber(KeyStore.Height, 0) / 2;
            let lx = Math.min(x1, x2);
            let ly = Math.min(y1, y2);
            let w = Math.max(x1, x2) - lx;
            let h = Math.max(y1, y2) - ly;
            let unflipped = (x1 == lx && y1 == ly) || (x2 == lx && y2 == ly);
            return (
                <div style={{ width: w, height: h, transform: `translate(${lx}px, ${ly}px)`, position: "absolute" }}>
                    <svg width="5000" height="5000">
                        <line x1="0" x2={`${w}`} y1={`${unflipped ? 0 : h}`} y2={`${unflipped ? h : 0}`} width="4" style={{ stroke: "black", strokeWidth: "5" }}  ></line>
                    </svg>
                </div>);
        }
        return (
            <div className="collectionFreeFormDocumentView-container" ref={this._mainCont} style={{
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