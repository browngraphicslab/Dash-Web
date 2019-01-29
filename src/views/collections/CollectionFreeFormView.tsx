import { observer } from "mobx-react";
import { Key, KeyStore } from "../../fields/Key";
import React = require("react");
import { action, observable, computed } from "mobx";
import { Document } from "../../fields/Document";
import { DocumentView, CollectionViewProps } from "../nodes/DocumentView";
import { ListField } from "../../fields/ListField";
import { NumberField } from "../../fields/NumberField";
import { SSL_OP_SINGLE_DH_USE } from "constants";
import { SelectionManager } from "../../util/SelectionManager";
import { Documents } from "../../documents/Documents";
import { ContextMenu } from "../ContextMenu";
import { DragManager } from "../../util/DragManager";
import "./CollectionFreeFormView.scss";
import { Utils } from "../../Utils";

@observer
export class CollectionFreeFormView extends React.Component<CollectionViewProps> {
    private _containerRef = React.createRef<HTMLDivElement>();
    private _canvasRef = React.createRef<HTMLDivElement>();

    constructor(props: CollectionViewProps) {
        super(props);
    }

    public static BORDER_WIDTH = 2;

    @computed
    public get active(): boolean {
        var isSelected = (this.props.ContainingDocumentView != undefined && SelectionManager.IsSelected(this.props.ContainingDocumentView));
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == this);
        var topMost = this.props.ContainingDocumentView != undefined && this.props.ContainingDocumentView.props.ContainingCollectionView == undefined;
        return isSelected || childSelected || topMost;
    }

    drop = (e: Event, de: DragManager.DropEvent) => {
        const doc = de.data[ "document" ];
        if (doc instanceof DocumentView) {
            if (doc.props.ContainingCollectionView && doc.props.ContainingCollectionView !== this) {
                doc.props.ContainingCollectionView.removeDocument(doc.props.Document);
                this.addDocument(doc.props.Document);
            }
            const xOffset = de.data[ "xOffset" ] as number || 0;
            const yOffset = de.data[ "yOffset" ] as number || 0;
            let { LocalX, LocalY } = this.props.ContainingDocumentView!.TransformToLocalPoint(de.x - xOffset, de.y - yOffset);
            doc.x = LocalX;
            doc.y = LocalY;
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

    _lastX: number = 0;
    _lastY: number = 0;
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button === 2 && this.active) {
            e.stopPropagation();
            e.preventDefault();
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
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble) {
            e.preventDefault();
            e.stopPropagation();
            let currScale: number = this.props.ContainingDocumentView!.ScalingToScreenSpace;
            let x = this.props.Document.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
            let y = this.props.Document.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
            this.props.Document.SetFieldValue(KeyStore.PanX, x + (e.pageX - this._lastX) / currScale, NumberField);
            this.props.Document.SetFieldValue(KeyStore.PanY, y + (e.pageY - this._lastY) / currScale, NumberField);
            this._lastX = e.pageX;
            this._lastY = e.pageY;
        }
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

        this.props.Document.SetField(KeyStore.Scale, new NumberField(deltaScale));
        this.props.Document.SetFieldValue(KeyStore.PanX, Panxx + dx, NumberField);
        this.props.Document.SetFieldValue(KeyStore.PanY, Panyy + dy, NumberField);
    }

    onDrop = (e: React.DragEvent): void => {
        e.stopPropagation()
        e.preventDefault()
        let fReader = new FileReader()
        let file = e.dataTransfer.items[ 0 ].getAsFile();
        let that = this;
        const panx: number = this.props.Document.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        const pany: number = this.props.Document.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        let x = e.pageX - panx
        let y = e.pageY - pany

        fReader.addEventListener("load", action("drop", (event) => {
            if (fReader.result) {
                let url = "" + fReader.result;
                let doc = Documents.ImageDocument(url, {
                    x: x, y: y
                })
                let docs = that.props.Document.GetFieldT(KeyStore.Data, ListField);
                if (!docs) {
                    docs = new ListField<Document>();
                    that.props.Document.SetField(KeyStore.Data, docs)
                }
                docs.Data.push(doc);
            }
        }), false)

        if (file) {
            fReader.readAsDataURL(file)
        }
    }

    @action
    addDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetFieldValue(this.props.fieldKey, ListField, new Array<Document>())
        value.push(doc);
    }

    @action
    removeDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetFieldValue(this.props.fieldKey, ListField, new Array<Document>())
        if (value.indexOf(doc) !== -1) {
            value.splice(value.indexOf(doc), 1)

            SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems()
        }
    }

    onDragOver = (e: React.DragEvent): void => {
    }
    render() {
        const { fieldKey, Document: Document } = this.props;

        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        const panx: number = Document.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        const pany: number = Document.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        const currScale: number = Document.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
        return (
            <div className="border" style={{
                borderStyle: "solid",
                borderWidth: `${CollectionFreeFormView.BORDER_WIDTH}px`,
            }}>
                <div className="collectionfreeformview-container" onPointerDown={this.onPointerDown} onWheel={this.onPointerWheel} onContextMenu={(e) => e.preventDefault()} style={{
                    width: "100%",
                    height: `calc(100% - 2*${CollectionFreeFormView.BORDER_WIDTH}px)`,
                }} onDrop={this.onDrop} onDragOver={this.onDragOver} ref={this._containerRef}>
                    <div className="collectionfreeformview" style={{ transform: `translate(${panx}px, ${pany}px) scale(${currScale}, ${currScale})`, transformOrigin: `left, top` }} ref={this._canvasRef}>

                        <div className="node-container">
                            {value.map(doc => {
                                return (<DocumentView key={doc.Id} ContainingCollectionView={this} Document={doc} ContainingDocumentView={this.props.ContainingDocumentView} />);
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}