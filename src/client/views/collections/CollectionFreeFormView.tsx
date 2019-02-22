import { observer } from "mobx-react";
import React = require("react");
import { action, computed, trace } from "mobx";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { DragManager } from "../../util/DragManager";
import "./CollectionFreeFormView.scss";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { KeyStore } from "../../../fields/KeyStore";
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";
import { FieldWaiting } from "../../../fields/Field";
import { Transform } from "../../util/Transform";
import { DocumentView } from "../nodes/DocumentView";
import { undoBatch } from "../../util/UndoManager";
import { CollectionViewBase, SubCollectionViewProps } from "./CollectionViewBase";

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    private _canvasRef = React.createRef<HTMLDivElement>();
    private _lastX: number = 0;
    private _lastY: number = 0;
    private _downX: number = 0;
    private _downY: number = 0;

    @computed
    get isAnnotationOverlay() { return this.props.fieldKey == KeyStore.Annotations; }

    @computed
    get nativeWidth() { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed
    get nativeHeight() { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }

    @computed
    get zoomScaling() { return this.props.Document.GetNumber(KeyStore.Scale, 1); }

    @computed
    get resizeScaling() { return this.isAnnotationOverlay ? this.props.Document.GetNumber(KeyStore.Width, 0) / this.nativeWidth : 1; }

    constructor(props: SubCollectionViewProps) {
        super(props);
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        super.drop(e, de);
        const doc: DocumentView = de.data["document"];
        const xOffset = de.data["xOffset"] as number || 0;
        const yOffset = de.data["yOffset"] as number || 0;
        //this should be able to use translate and scale methods on an Identity transform, no?
        const transform = this.getTransform();
        const screenX = de.x - xOffset;
        const screenY = de.y - yOffset;
        const [x, y] = transform.transformPoint(screenX, screenY);
        doc.props.Document.SetNumber(KeyStore.X, x);
        doc.props.Document.SetNumber(KeyStore.Y, y);
        this.bringToFront(doc);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if ((e.button === 2 && this.props.active()) ||
            !e.defaultPrevented) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
            this._downX = this._lastX = e.pageX;
            this._downY = this._lastY = e.pageY;
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        e.stopPropagation();
        if (Math.abs(this._downX - e.clientX) < 3 && Math.abs(this._downY - e.clientY) < 3) {
            if (!this.props.isSelected()) {
                this.props.select(false);
            }
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble && this.props.active()) {
            e.preventDefault();
            e.stopPropagation();
            let x = this.props.Document.GetNumber(KeyStore.PanX, 0);
            let y = this.props.Document.GetNumber(KeyStore.PanY, 0);
            let [dx, dy] = this.props.ScreenToLocalTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);

            this.SetPan(x + dx, y + dy);
        }
        this._lastX = e.pageX;
        this._lastY = e.pageY;
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        let coefficient = 1000;
        // if (modes[e.deltaMode] == 'pixels') coefficient = 50;
        // else if (modes[e.deltaMode] == 'lines') coefficient = 1000; // This should correspond to line-height??
        let transform = this.getTransform();

        let deltaScale = (1 - (e.deltaY / coefficient));
        let [x, y] = transform.transformPoint(e.clientX, e.clientY);

        let localTransform = this.getLocalTransform();
        localTransform = localTransform.inverse().scaleAbout(deltaScale, x, y)

        this.props.Document.SetNumber(KeyStore.Scale, localTransform.Scale);
        this.SetPan(localTransform.TranslateX, localTransform.TranslateY);
    }

    @action
    private SetPan(panX: number, panY: number) {
        const newPanX = Math.max((1 - this.zoomScaling) * this.nativeWidth, Math.min(0, panX));
        const newPanY = Math.max((1 - this.zoomScaling) * this.nativeHeight, Math.min(0, panY));
        this.props.Document.SetNumber(KeyStore.PanX, this.isAnnotationOverlay ? newPanX : panX);
        this.props.Document.SetNumber(KeyStore.PanY, this.isAnnotationOverlay ? newPanY : panY);
    }

    @action
    onDrop = (e: React.DragEvent): void => {
        const panx: number = this.props.Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = this.props.Document.GetNumber(KeyStore.PanY, 0);
        let x = e.pageX - panx
        let y = e.pageY - pany
        super.onDrop(e, { x: x, y: y });
    }

    onDragOver = (): void => {
    }

    @action
    bringToFront(doc: DocumentView) {
        const { fieldKey: fieldKey, Document: Document } = this.props;

        const value: Document[] = Document.GetList<Document>(fieldKey, []).slice();
        value.sort((doc1, doc2) => {
            if (doc1 === doc.props.Document) {
                return 1;
            }
            if (doc2 === doc.props.Document) {
                return -1;
            }
            return doc1.GetNumber(KeyStore.ZIndex, 0) - doc2.GetNumber(KeyStore.ZIndex, 0);
        }).map((doc, index) => {
            doc.SetNumber(KeyStore.ZIndex, index + 1)
        });
    }

    @computed
    get translate(): [number, number] {
        const x = this.props.Document.GetNumber(KeyStore.PanX, 0);
        const y = this.props.Document.GetNumber(KeyStore.PanY, 0);
        return [x, y];
    }

    @computed
    get scale(): number {
        return this.props.Document.GetNumber(KeyStore.Scale, 1);
    }

    getTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH, -COLLECTION_BORDER_WIDTH).transform(this.getLocalTransform())
    }

    getLocalTransform = (): Transform => {
        const [x, y] = this.translate;
        return Transform.Identity.translate(-x, -y).scale(1 / this.scale);
    }

    @computed
    get views() {
        const { fieldKey, Document } = this.props;
        const lvalue = Document.GetT<ListField<Document>>(fieldKey, ListField);
        if (lvalue && lvalue != FieldWaiting) {
            return lvalue.Data.map(doc => {
                return (<CollectionFreeFormDocumentView key={doc.Id} Document={doc}
                    AddDocument={this.props.addDocument}
                    RemoveDocument={this.props.removeDocument}
                    ScreenToLocalTransform={this.getTransform}
                    isTopMost={false}
                    Scaling={1}
                    PanelWidth={doc.GetNumber(KeyStore.Width, 0)}
                    PanelHeight={doc.GetNumber(KeyStore.Height, 0)}
                    ContainingCollectionView={this.props.CollectionView} />);
            })
        }
        return null;
    }

    render() {
        const panx: number = this.props.Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = this.props.Document.GetNumber(KeyStore.PanY, 0);
        return (
            <div className="collectionfreeformview-container"
                onPointerDown={this.onPointerDown}
                onWheel={this.onPointerWheel}
                onContextMenu={(e) => e.preventDefault()}
                onDrop={this.onDrop.bind(this)}
                onDragOver={this.onDragOver}
                style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px`, }}
                ref={this.createDropTarget}>
                <div className="collectionfreeformview"
                    style={{ width: "100%", transformOrigin: "left top", transform: ` translate(${panx}px, ${pany}px) scale(${this.zoomScaling}, ${this.zoomScaling})` }}
                    ref={this._canvasRef}>

                    {this.props.BackgroundView ? this.props.BackgroundView() : null}
                    {this.views}
                </div>
            </div>
        );
    }
}