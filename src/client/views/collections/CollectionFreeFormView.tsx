import { observable, action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting } from "../../../fields/Field";
import { Server } from "tls";
import { RichTextField } from "../../../fields/RichTextField";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { TextField } from "../../../fields/TextField";
import { DragManager } from "../../util/DragManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionView } from "../collections/CollectionView";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { DocumentView } from "../nodes/DocumentView";
import { WebView } from "../nodes/WebView";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import "./CollectionFreeFormView.scss";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { CollectionViewBase } from "./CollectionViewBase";
import React = require("react");
import { Documents } from "../../documents/Documents";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    private _canvasRef = React.createRef<HTMLDivElement>();
    private _lastX: number = 0;
    private _lastY: number = 0;

    @observable
    private _downX: number = 0;
    @observable
    private _downY: number = 0;

    //determines whether the blinking cursor for indicating whether a text will be made on key down is visible
    @observable
    private _previewCursorVisible: boolean = false;

    @computed get panX(): number { return this.props.Document.GetNumber(KeyStore.PanX, 0) }
    @computed get panY(): number { return this.props.Document.GetNumber(KeyStore.PanY, 0) }
    @computed get scale(): number { return this.props.Document.GetNumber(KeyStore.Scale, 1); }
    @computed get isAnnotationOverlay() { return this.props.fieldKey.Id === KeyStore.Annotations.Id; } // bcz: ? Why do we need to compare Id's?
    @computed get nativeWidth() { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight() { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }
    @computed get zoomScaling() { return this.props.Document.GetNumber(KeyStore.Scale, 1); }

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
            //show preview text cursor on tap
            this._previewCursorVisible = true;
            //select is not already selected
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
            this._previewCursorVisible = false;
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
        this.props.Document.SetNumber(KeyStore.PanX, false && this.isAnnotationOverlay ? newPanX : panX);
        this.props.Document.SetNumber(KeyStore.PanY, false && this.isAnnotationOverlay ? newPanY : panY);
    }

    @action
    onDrop = (e: React.DragEvent): void => {
        const panx: number = this.props.Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = this.props.Document.GetNumber(KeyStore.PanY, 0);
        let transform = this.getTransform();

        var pt = transform.transformPoint(e.pageX, e.pageY);
        super.onDrop(e, { x: pt[0], y: pt[1] });
    }

    onDragOver = (): void => {
    }

    @action
    onKeyDown = (e: React.KeyboardEvent<Element>) => {
        console.log("KEY PRESSED");
        //if not these keys, make a textbox if preview cursor is active!
        if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
            if (this._previewCursorVisible) {
                //make textbox and add it to this collection
                //let { LocalX, LocalY } = this.props.TransformToLocalPoint(this._downX, this._downY);
                let tr = this.props.ScreenToLocalTransform().translate(this._downX, this._downY);
                let LocalX = tr.TranslateX;
                let LocalY = tr.TranslateY;
                let newBox = Documents.TextDocument({ width: 200, height: 100, x: LocalX, y: LocalY, title: "new" });
                //set text to be the typed key and get focus on text box
                this.props.CollectionView.addDocument(newBox);
                newBox.SetText(KeyStore.Text, e.key);
                newBox.SetNumber(KeyStore.SelectOnLoaded, 1);

                //remove cursor from screen
                this._previewCursorVisible = false;
            }
        }
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


    @computed get backgroundLayout(): string | undefined {
        let field = this.props.Document.GetT(KeyStore.BackgroundLayout, TextField);
        if (field && field !== "<Waiting>") {
            return field.Data;
        }
    }
    @computed get overlayLayout(): string | undefined {
        let field = this.props.Document.GetT(KeyStore.OverlayLayout, TextField);
        if (field && field !== "<Waiting>") {
            return field.Data;
        }
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
                    ContentScaling={this.noScaling}
                    PanelWidth={doc.Width}
                    PanelHeight={doc.Height}
                    ContainingCollectionView={this.props.CollectionView} />);
            })
        }
        return null;
    }

    @computed
    get backgroundView() {
        return !this.backgroundLayout ? (null) :
            (<JsxParser
                components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, WebView }}
                bindings={this.props.bindings}
                jsx={this.backgroundLayout}
                showWarnings={true}
                onError={(test: any) => console.log(test)}
            />);
    }
    @computed
    get overlayView() {
        return !this.overlayLayout ? (null) :
            (<JsxParser
                components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView }}
                bindings={this.props.bindings}
                jsx={this.overlayLayout}
                showWarnings={true}
                onError={(test: any) => console.log(test)}
            />);
    }
    getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH, -COLLECTION_BORDER_WIDTH).transform(this.getLocalTransform())
    getLocalTransform = (): Transform => Transform.Identity.translate(-this.panX, -this.panY).scale(1 / this.scale);
    noScaling = () => 1;

    //hides the preview cursor for generating new text boxes - called when other docs are selected/dragged
    @action
    hidePreviewCursor() {
        this._previewCursorVisible = false;
    }

    render() {

        let cursor = null;
        //toggle for preview cursor -> will be on when user taps freeform
        if (this._previewCursorVisible) {
            //get local position and place cursor there!
            //let { LocalX, LocalY } = this.props.ContainingDocumentView!.TransformToLocalPoint(this._downX, this._downY);
            let tr = this.props.ScreenToLocalTransform().translate(this._downX, this._downY);
            let LocalX = tr.TranslateX;
            let LocalY = tr.TranslateY;
            //let [dx, dy] = this.props.ScreenToLocalTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
            cursor = <div id="prevCursor" onKeyPress={this.onKeyDown} style={{ color: "black", transform: `translate(${LocalX}px, ${LocalY}px)` }}>I</div>
        }

        const panx: number = this.props.Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = this.props.Document.GetNumber(KeyStore.PanY, 0);
        var overlay = this.overlayView ?
            <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                {this.overlayView}
            </div>
            :
            (null);
        return (
            <div className="collectionfreeformview-container"
                onPointerDown={this.onPointerDown}
                onKeyPress={this.onKeyDown}
                onWheel={this.onPointerWheel}
                onContextMenu={(e) => e.preventDefault()}
                onDrop={this.onDrop.bind(this)}
                onDragOver={this.onDragOver}
                style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px`, }}
                tabIndex={0}
                ref={this.createDropTarget}>
                <div className="collectionfreeformview"
                    style={{ transformOrigin: "left top", transform: ` translate(${panx}px, ${pany}px) scale(${this.zoomScaling}, ${this.zoomScaling})` }}
                    ref={this._canvasRef}>
                    {this.backgroundView}
                    {cursor}
                    {this.views}
                </div>
                {this.overlayView}
            </div>
        );
    }
}