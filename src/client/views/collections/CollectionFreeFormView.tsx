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
import { Server } from "tls";
var FontAwesomeIcon = require('react-fontawesome');

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    public static LayoutString() { return CollectionViewBase.LayoutString("CollectionFreeFormView"); }
    private _containerRef = React.createRef<HTMLDivElement>();
    private _canvasRef = React.createRef<HTMLDivElement>();
    private _nodeContainerRef = React.createRef<HTMLDivElement>();
    private _lastX: number = 0;
    private _lastY: number = 0;
    private _downX: number = 0;
    private _downY: number = 0;
    //determines whether the blinking cursor for indicating whether a text will be made on key down is visible
    private _previewCursorVisible: boolean = false;

    constructor(props: CollectionViewProps) {
        super(props);
    }

    @computed
    get isAnnotationOverlay() { return this.props.CollectionFieldKey == KeyStore.Annotations; }

    @computed
    get nativeWidth() { return this.props.DocumentForCollection.GetNumber(KeyStore.NativeWidth, 0); }

    @computed
    get zoomScaling() { return this.props.DocumentForCollection.GetNumber(KeyStore.Scale, 1); }

    @computed
    get resizeScaling() { return this.isAnnotationOverlay ? this.props.DocumentForCollection.GetNumber(KeyStore.Width, 0) / this.nativeWidth : 1; }

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
            const { translateX, translateY } = Utils.GetScreenTransform(this._canvasRef.current!);
            const currScale = this.resizeScaling * this.zoomScaling * this.props.ContainingDocumentView!.ScalingToScreenSpace;
            const screenX = de.x - xOffset;
            const screenY = de.y - yOffset;
            const docX = (screenX - translateX) / currScale;
            const docY = (screenY - translateY) / currScale;
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
            //document.removeEventListener("keypress", this.onKeyDown);
            //document.addEventListener("keydown", this.onKeyDown);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
            this._lastX = e.pageX;
            this._lastY = e.pageY;
            this._downX = e.pageX;
            this._downY = e.pageY;
            //update downX/downY to update UI (used for preview text cursor)
            this.setState({
                DownX: e.pageX,
                DownY: e.pageY,
            })
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        e.stopPropagation();
        if (Math.abs(this._downX - e.clientX) < 3 && Math.abs(this._downY - e.clientY) < 3) {
            this._previewCursorVisible = true;
            if (!SelectionManager.IsSelected(this.props.ContainingDocumentView as CollectionFreeFormDocumentView)) {
                SelectionManager.SelectDoc(this.props.ContainingDocumentView as CollectionFreeFormDocumentView, false);
            }
        }

    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble && this.active) {
            e.preventDefault();
            e.stopPropagation();
            let currScale: number = this.props.ContainingDocumentView!.ScalingToScreenSpace;
            let x = this.props.DocumentForCollection.GetNumber(KeyStore.PanX, 0);
            let y = this.props.DocumentForCollection.GetNumber(KeyStore.PanY, 0);

            this.SetPan(x + (e.pageX - this._lastX) / currScale, y + (e.pageY - this._lastY) / currScale);
            console.log("SET PAN");
        }
        this._lastX = e.pageX;
        this._lastY = e.pageY;
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();

        let { LocalX, Ss, Panxx, Xx, LocalY, Panyy, Yy, ContainerX, ContainerY } = this.props.ContainingDocumentView!.TransformToLocalPoint(e.pageX, e.pageY);

        var deltaScale = (1 - (e.deltaY / 1000)) * Ss;
        var newDeltaScale = this.isAnnotationOverlay ? Math.max(1, deltaScale) : deltaScale;

        this.props.DocumentForCollection.SetNumber(KeyStore.Scale, newDeltaScale);
        this.SetPan(ContainerX - (LocalX * newDeltaScale + Xx), ContainerY - (LocalY * newDeltaScale + Yy));
    }

    @action
    private SetPan(panX: number, panY: number) {
        const newPanX = Math.max(-(this.resizeScaling * this.zoomScaling - this.resizeScaling) * this.nativeWidth, Math.min(0, panX));
        const newPanY = Math.min(0, panY);
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
    onKeyDown = (e: React.KeyboardEvent<Element>) => {
        console.log("KEY PRESSED");
        //if not these keys, make a textbox if preview cursor is active!
        if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
            if (this._previewCursorVisible) {
                //make textbox
                let { LocalX, Ss, Panxx, Xx, LocalY, Panyy, Yy, ContainerX, ContainerY } = this.props.ContainingDocumentView!.TransformToLocalPoint(this._downX, this._downY);
                let newBox = Documents.TextDocument({ width: 200, height: 100, x: LocalX, y: LocalY, title: "new" });
                this.addDocument(newBox);
            }
        }
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
        const Document: Document = this.props.DocumentForCollection;
        const value: Document[] = Document.GetList<Document>(this.props.CollectionFieldKey, []);
        const panx: number = Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = Document.GetNumber(KeyStore.PanY, 0);

        let cursor = null;
        //toggle for preview cursor -> will be on when user taps freeform
        if (this._previewCursorVisible) {
            //get local position and place cursor there!
            let { LocalX, Ss, Panxx, Xx, LocalY, Panyy, Yy, ContainerX, ContainerY } = this.props.ContainingDocumentView!.TransformToLocalPoint(this._downX, this._downY);
            cursor = <div id="prevCursor" onKeyPress={this.onKeyDown} style={{ color: "black", transform: `translate(${LocalX}px, ${LocalY}px)` }}>I</div>
        }



        return (
            <div className="border" style={{
                borderWidth: `${COLLECTION_BORDER_WIDTH} px`,
            }}>
                <div
                    className="collectionfreeformview-container"
                    onPointerDown={this.onPointerDown}
                    onWheel={this.onPointerWheel}
                    onContextMenu={(e) => e.preventDefault()}
                    onDrop={this.onDrop}
                    onDragOver={this.onDragOver}
                    onKeyPress={this.onKeyDown}
                    ref={this._containerRef}>
                    <div className="collectionfreeformview" style={{ transform: `translate(${panx}px, ${pany}px) scale(${this.zoomScaling}, ${this.zoomScaling})`, transformOrigin: `left, top` }} ref={this._canvasRef}>
                        {this.props.BackgroundView}
                        <div className="node-container" ref={this._nodeContainerRef} onKeyPress={this.onKeyDown}>


                            {cursor}

                            {value.map(doc => {
                                return (<CollectionFreeFormDocumentView Scaling={this.resizeScaling} key={doc.Id} ContainingCollectionView={this} Document={doc} DocumentView={undefined} />);
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}