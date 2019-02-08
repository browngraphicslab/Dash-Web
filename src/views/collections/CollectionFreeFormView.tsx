import { observer } from "mobx-react";
import { Key, KeyStore } from "../../fields/Key";
import React = require("react");
import { action, observable, computed } from "mobx";
import { Document } from "../../fields/Document";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { ListField } from "../../fields/ListField";
import { NumberField } from "../../fields/NumberField";
import { SSL_OP_SINGLE_DH_USE } from "constants";
import { Documents } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import "./CollectionFreeFormView.scss";
import { Utils } from "../../Utils";
import { CollectionViewBase, CollectionViewProps, COLLECTION_BORDER_WIDTH } from "./CollectionViewBase";
import { SelectionManager } from "../../util/SelectionManager";
import { FieldWaiting } from "../../fields/Field";

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    public static LayoutString() { return CollectionViewBase.LayoutString("CollectionFreeFormView"); }
    private _containerRef = React.createRef<HTMLDivElement>();
    private _canvasRef = React.createRef<HTMLDivElement>();
    private _nodeContainerRef = React.createRef<HTMLDivElement>();
    private _lastX: number = 0;
    private _lastY: number = 0;

    constructor(props: CollectionViewProps) {
        super(props);
    }

    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        const doc = de.data["document"];
        var me = this;
        if (doc instanceof CollectionFreeFormDocumentView) {
            if (doc.props.ContainingCollectionView && doc.props.ContainingCollectionView !== this) {
                doc.props.ContainingCollectionView.removeDocument(doc.props.Document);
                this.addDocument(doc.props.Document);
            }
            const xOffset = de.data["xOffset"] as number || 0;
            const yOffset = de.data["yOffset"] as number || 0;
            const { scale, translateX, translateY } = Utils.GetScreenTransform(this._canvasRef.current!);
            let sscale = this.props.ContainingDocumentView!.props.Document.GetData(KeyStore.Scale, NumberField, Number(1))
            const screenX = de.x - xOffset;
            const screenY = de.y - yOffset;
            const docX = (screenX - translateX) / sscale / scale;
            const docY = (screenY - translateY) / sscale / scale;
            doc.x = docX;
            doc.y = docY;
            this.bringToFront(doc);
        }
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
            this._lastX = e.pageX;
            this._lastY = e.pageY;
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        e.stopPropagation();
        SelectionManager.DeselectAll();
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        var me = this;
        if (!e.cancelBubble && this.active) {
            e.preventDefault();
            e.stopPropagation();
            let currScale: number = this.props.ContainingDocumentView!.ScalingToScreenSpace;
            let x = this.props.DocumentForCollection.GetData(KeyStore.PanX, NumberField, Number(0));
            let y = this.props.DocumentForCollection.GetData(KeyStore.PanY, NumberField, Number(0));
            this.props.DocumentForCollection.SetData(KeyStore.PanX, x + (e.pageX - this._lastX) / currScale, NumberField);
            this.props.DocumentForCollection.SetData(KeyStore.PanY, y + (e.pageY - this._lastY) / currScale, NumberField);
        }
        this._lastX = e.pageX;
        this._lastY = e.pageY;
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();

        let { LocalX, Ss, Panxx, Xx, LocalY, Panyy, Yy, ContainerX, ContainerY } = this.props.ContainingDocumentView!.TransformToLocalPoint(e.pageX, e.pageY);

        var deltaScale = (1 - (e.deltaY / 1000)) * Ss;

        var newContainerX = LocalX * deltaScale + Panxx + Xx;
        var newContainerY = LocalY * deltaScale + Panyy + Yy;

        let dx = ContainerX - newContainerX;
        let dy = ContainerY - newContainerY;

        this.props.DocumentForCollection.Set(KeyStore.Scale, new NumberField(deltaScale));
        this.props.DocumentForCollection.SetData(KeyStore.PanX, Panxx + dx, NumberField);
        this.props.DocumentForCollection.SetData(KeyStore.PanY, Panyy + dy, NumberField);
    }

    @action
    onDrop = (e: React.DragEvent): void => {
        e.stopPropagation()
        e.preventDefault()
        let fReader = new FileReader()
        let file = e.dataTransfer.items[0].getAsFile();
        let that = this;
        const panx: number = this.props.DocumentForCollection.GetData(KeyStore.PanX, NumberField, Number(0));
        const pany: number = this.props.DocumentForCollection.GetData(KeyStore.PanY, NumberField, Number(0));
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
    bringToFront(doc: CollectionFreeFormDocumentView) {
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

    render() {
        const { CollectionFieldKey: fieldKey, DocumentForCollection: Document } = this.props;
        const value: Document[] = Document.GetList<Document>(fieldKey, []);
        const panx: number = Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = Document.GetNumber(KeyStore.PanY, 0);
        const currScale: number = Document.GetNumber(KeyStore.Scale, 1);

        return (
            <div className="border" style={{
                borderWidth: `${COLLECTION_BORDER_WIDTH}px`,
            }}>
                <div className="collectionfreeformview-container"
                    onPointerDown={this.onPointerDown}
                    onWheel={this.onPointerWheel}
                    onContextMenu={(e) => e.preventDefault()}
                    onDrop={this.onDrop}
                    onDragOver={this.onDragOver}
                    ref={this._containerRef}>
                    <div className="collectionfreeformview" style={{ transform: `translate(${panx}px, ${pany}px) scale(${currScale}, ${currScale})`, transformOrigin: `left, top` }} ref={this._canvasRef}>

                        <div className="node-container" ref={this._nodeContainerRef}>
                            {value.map(doc => {
                                return (<CollectionFreeFormDocumentView key={doc.Id} ContainingCollectionView={this} Document={doc} DocumentView={undefined} />);
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}