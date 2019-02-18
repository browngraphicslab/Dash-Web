import { observer } from "mobx-react";
import React = require("react");
import { action, observable, computed } from "mobx";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { DragManager } from "../../util/DragManager";
import "./CollectionFreeFormView.scss";
import { Utils } from "../../../Utils";
import { CollectionViewBase, CollectionViewProps, COLLECTION_BORDER_WIDTH } from "./CollectionViewBase";
import { SelectionManager } from "../../util/SelectionManager";
import { Key, KeyStore } from "../../../fields/Key";
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";
import { NumberField } from "../../../fields/NumberField";
import { Documents } from "../../documents/Documents";
import { FieldWaiting } from "../../../fields/Field";
import { Transform } from "../../util/Transform";
import { DocumentView } from "../nodes/DocumentView";

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    public static LayoutString(fieldKey: string = "DataKey") { return CollectionViewBase.LayoutString("CollectionFreeFormView", fieldKey); }
    private _containerRef = React.createRef<HTMLDivElement>();
    private _canvasRef = React.createRef<HTMLDivElement>();
    private _lastX: number = 0;
    private _lastY: number = 0;
    private _downX: number = 0;
    private _downY: number = 0;

    constructor(props: CollectionViewProps) {
        super(props);
    }

    @computed
    get isAnnotationOverlay() { return this.props.CollectionFieldKey == KeyStore.Annotations; }

    @computed
    get nativeWidth() { return this.props.DocumentForCollection.GetNumber(KeyStore.NativeWidth, 0); }
    @computed
    get nativeHeight() { return this.props.DocumentForCollection.GetNumber(KeyStore.NativeHeight, 0); }

    @computed
    get zoomScaling() { return this.props.DocumentForCollection.GetNumber(KeyStore.Scale, 1); }

    @computed
    get resizeScaling() { return this.isAnnotationOverlay ? this.props.DocumentForCollection.GetNumber(KeyStore.Width, 0) / this.nativeWidth : 1; }

    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        const doc: DocumentView = de.data["document"];
        var me = this;
        if (doc.props.ContainingCollectionView && doc.props.ContainingCollectionView !== this) {
            doc.props.ContainingCollectionView.removeDocument(doc.props.Document);
            this.addDocument(doc.props.Document);
        }
        const xOffset = de.data["xOffset"] as number || 0;
        const yOffset = de.data["yOffset"] as number || 0;
        //this should be able to use translate and scale methods on an Identity transform, no?
        const transform = me.getTransform();
        const screenX = de.x - xOffset;
        const screenY = de.y - yOffset;
        const [x, y] = transform.transformPoint(screenX, screenY);
        doc.props.Document.SetNumber(KeyStore.X, x);
        doc.props.Document.SetNumber(KeyStore.Y, y);
        this.bringToFront(doc);
        e.stopPropagation();
    }

    componentDidMount() {
        if (this._containerRef.current) {
            DragManager.MakeDropTarget(this._containerRef.current, {
                handlers: {
                    drop: this.drop
                }
            });
        }
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if ((e.button === 2 && this.active) ||
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
        if (!e.cancelBubble && this.active) {
            e.preventDefault();
            e.stopPropagation();
            let x = this.props.DocumentForCollection.GetNumber(KeyStore.PanX, 0);
            let y = this.props.DocumentForCollection.GetNumber(KeyStore.PanY, 0);
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
        let modes = ['pixels', 'lines', 'page'];
        let coefficient = 1000;
        // if (modes[e.deltaMode] == 'pixels') coefficient = 50;
        // else if (modes[e.deltaMode] == 'lines') coefficient = 1000; // This should correspond to line-height??
        let transform = this.getTransform();

        let deltaScale = (1 - (e.deltaY / coefficient));
        let [x, y] = transform.transformPoint(e.clientX, e.clientY);

        let localTransform = this.getLocalTransform();
        localTransform = localTransform.inverse().scaleAbout(deltaScale, x, y)

        this.props.DocumentForCollection.SetNumber(KeyStore.Scale, localTransform.Scale);
        this.SetPan(localTransform.TranslateX, localTransform.TranslateY);
    }

    @action
    private SetPan(panX: number, panY: number) {
        const newPanX = Math.max((1 - this.zoomScaling) * this.nativeWidth, Math.min(0, panX));
        const newPanY = Math.max((1 - this.zoomScaling) * this.nativeHeight, Math.min(0, panY));
        this.props.DocumentForCollection.SetNumber(KeyStore.PanX, this.isAnnotationOverlay ? newPanX : panX);
        this.props.DocumentForCollection.SetNumber(KeyStore.PanY, this.isAnnotationOverlay ? newPanY : panY);
    }

    @action
    onDrop = (e: React.DragEvent): void => {
        e.stopPropagation()
        e.preventDefault()
        let fReader = new FileReader()
        let file = e.dataTransfer.items[0].getAsFile();
        let that = this;
        const panx: number = this.props.DocumentForCollection.GetNumber(KeyStore.PanX, 0);
        const pany: number = this.props.DocumentForCollection.GetNumber(KeyStore.PanY, 0);
        let x = e.pageX - panx
        let y = e.pageY - pany

        fReader.addEventListener("load", action("drop", (event) => {
            if (fReader.result) {
                let url = "" + fReader.result;
                let doc = Documents.ImageDocument(url, {
                    x: x, y: y
                })
                let docs = that.props.DocumentForCollection.GetT(KeyStore.Data, ListField);
                if (docs != FieldWaiting) {
                    if (!docs) {
                        docs = new ListField<Document>();
                        that.props.DocumentForCollection.Set(KeyStore.Data, docs)
                    }
                    docs.Data.push(doc);
                }
            }
        }), false)

        if (file) {
            fReader.readAsDataURL(file)
        }
    }

    onDragOver = (e: React.DragEvent): void => {
    }

    @action
    bringToFront(doc: DocumentView) {
        const { CollectionFieldKey: fieldKey, DocumentForCollection: Document } = this.props;

        const value: Document[] = Document.GetList<Document>(fieldKey, []);
        var topmost = value.reduce((topmost, d) => Math.max(d.GetNumber(KeyStore.ZIndex, 0), topmost), -1000);
        value.map(d => {
            var zind = d.GetNumber(KeyStore.ZIndex, 0);
            if (zind != topmost - 1 - (topmost - zind) && d != doc.props.Document) {
                d.SetData(KeyStore.ZIndex, topmost - 1 - (topmost - zind), NumberField);
            }
        })

        if (doc.props.Document.GetNumber(KeyStore.ZIndex, 0) != 0) {
            doc.props.Document.SetData(KeyStore.ZIndex, 0, NumberField);
        }
    }

    @computed
    get translate(): [number, number] {
        const x = this.props.DocumentForCollection.GetNumber(KeyStore.PanX, 0);
        const y = this.props.DocumentForCollection.GetNumber(KeyStore.PanY, 0);
        return [x, y];
    }

    @computed
    get scale(): number {
        return this.props.DocumentForCollection.GetNumber(KeyStore.Scale, 1);
    }

    getTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH, -COLLECTION_BORDER_WIDTH).transform(this.getLocalTransform())
    }

    getLocalTransform = (): Transform => {
        const [x, y] = this.translate;
        return Transform.Identity.translate(-x, -y).scale(1 / this.scale);
    }

    render() {
        const Document: Document = this.props.DocumentForCollection;
        const value: Document[] = Document.GetList<Document>(this.props.CollectionFieldKey, []);
        const panx: number = Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = Document.GetNumber(KeyStore.PanY, 0);
        var me = this;

        return (
            <div className="collectionfreeformview-container"
                onPointerDown={this.onPointerDown}
                onWheel={this.onPointerWheel}
                onContextMenu={(e) => e.preventDefault()}
                onDrop={this.onDrop}
                onDragOver={this.onDragOver}
                style={{
                    borderWidth: `${COLLECTION_BORDER_WIDTH}px`,
                }}
                ref={this._containerRef}>
                <div className="collectionfreeformview"
                    style={{ width: "100%", transformOrigin: "left top", transform: ` translate(${panx}px, ${pany}px) scale(${this.zoomScaling}, ${this.zoomScaling})` }}
                    ref={this._canvasRef}>

                    {this.props.BackgroundView}
                    {value.map(doc => {
                        return (<CollectionFreeFormDocumentView key={doc.Id} Document={doc}
                            AddDocument={this.addDocument}
                            RemoveDocument={this.removeDocument}
                            ScreenToLocalTransform={this.getTransform}
                            isTopMost={false}
                            Scaling={1}
                            ContainingCollectionView={this} DocumentView={this.props.ContainingDocumentView} />);
                    })}
                </div>
            </div>
        );
    }
}