import { observable, action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting } from "../../../fields/Field";
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
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import { WebBox } from "../nodes/WebBox";
import { KeyValueBox } from "../nodes/KeyValueBox"
import "./CollectionFreeFormView.scss";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { CollectionViewBase } from "./CollectionViewBase";
import { Documents } from "../../documents/Documents";
import React = require("react");
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    private _canvasRef = React.createRef<HTMLDivElement>();
    private _lastX: number = 0;
    private _lastY: number = 0;
    private _selectOnLoaded: string = ""; // id of document that should be selected once it's loaded (used for click-to-type)

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
    @computed get centeringShiftX() { return !this.props.Document.GetNumber(KeyStore.NativeWidth, 0) ? this.props.panelWidth() / 2 : 0; }  // shift so pan position is at center of window for non-overlay collections
    @computed get centeringShiftY() { return !this.props.Document.GetNumber(KeyStore.NativeHeight, 0) ? this.props.panelHeight() / 2 : 0; }// shift so pan position is at center of window for non-overlay collections

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        super.drop(e, de);
        const docView: DocumentView = de.data["documentView"];
        let doc: Document = docView ? docView.props.Document : de.data["document"];
        let screenX = de.x - (de.data["xOffset"] as number || 0);
        let screenY = de.y - (de.data["yOffset"] as number || 0);
        const [x, y] = this.getTransform().transformPoint(screenX, screenY);
        doc.SetNumber(KeyStore.X, x);
        doc.SetNumber(KeyStore.Y, y);
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
            this._lastX = e.pageX;
            this._lastY = e.pageY;
            this._downX = e.pageX;
            this._downY = e.pageY;
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
            e.stopPropagation();
            let x = -this.panX;
            let y = -this.panY;
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

        if (e.ctrlKey) {
            var nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
            var nativeHeight = this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
            const coefficient = 1000;
            let deltaScale = (1 - (e.deltaY / coefficient));
            this.props.Document.SetNumber(KeyStore.NativeWidth, nativeWidth * deltaScale);
            this.props.Document.SetNumber(KeyStore.NativeHeight, nativeHeight * deltaScale);
            e.stopPropagation();
            e.preventDefault();
        } else {
            // if (modes[e.deltaMode] == 'pixels') coefficient = 50;
            // else if (modes[e.deltaMode] == 'lines') coefficient = 1000; // This should correspond to line-height??
            let transform = this.getTransform();

            let deltaScale = (1 - (e.deltaY / coefficient));
            if (deltaScale * this.zoomScaling < 1 && this.isAnnotationOverlay)
                deltaScale = 1 / this.zoomScaling;
            let [x, y] = transform.transformPoint(e.clientX, e.clientY);

            let localTransform = this.getLocalTransform();
            localTransform = localTransform.inverse().scaleAbout(deltaScale, x, y)

            this.props.Document.SetNumber(KeyStore.Scale, localTransform.Scale);
            this.SetPan(localTransform.TranslateX, localTransform.TranslateY);
        }
    }

    @action
    private SetPan(panX: number, panY: number) {
        const newPanX = -Math.max((1 - this.zoomScaling) * this.nativeWidth, Math.min(0, panX));
        const newPanY = -Math.max((1 - this.zoomScaling) * this.nativeHeight, Math.min(0, panY));
        this.props.Document.SetNumber(KeyStore.PanX, this.isAnnotationOverlay ? newPanX : -panX);
        this.props.Document.SetNumber(KeyStore.PanY, this.isAnnotationOverlay ? newPanY : -panY);
    }

    @action
    onDrop = (e: React.DragEvent): void => {
        var pt = this.getTransform().transformPoint(e.pageX, e.pageY);
        super.onDrop(e, { x: pt[0], y: pt[1] });
    }

    onDragOver = (): void => {
    }

    @action
    onKeyDown = (e: React.KeyboardEvent<Element>) => {
        //if not these keys, make a textbox if preview cursor is active!
        if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
            if (this._previewCursorVisible) {
                //make textbox and add it to this collection
                let [x, y] = this.getTransform().transformPoint(this._downX, this._downY); (this._downX, this._downY);
                let newBox = Documents.TextDocument({ width: 200, height: 100, x: x, y: y, title: "new" });
                // mark this collection so that when the text box is created we can send it the SelectOnLoad prop to focus itself
                this._selectOnLoaded = newBox.Id;
                //set text to be the typed key and get focus on text box
                this.props.CollectionView.addDocument(newBox);
                //remove cursor from screen
                this._previewCursorVisible = false;
            }
        }
    }

    @action
    bringToFront(doc: Document) {
        const { fieldKey: fieldKey, Document: Document } = this.props;

        const value: Document[] = Document.GetList<Document>(fieldKey, []).slice();
        value.sort((doc1, doc2) => {
            if (doc1 === doc) {
                return 1;
            }
            if (doc2 === doc) {
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
        const lvalue = this.props.Document.GetT<ListField<Document>>(this.props.fieldKey, ListField);
        if (lvalue && lvalue != FieldWaiting) {
            return lvalue.Data.map(doc => {
                return (<CollectionFreeFormDocumentView key={doc.Id} Document={doc} ref={focus}
                    AddDocument={this.props.addDocument}
                    RemoveDocument={this.props.removeDocument}
                    ScreenToLocalTransform={this.getTransform}
                    isTopMost={false}
                    SelectOnLoad={doc.Id === this._selectOnLoaded}
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
                components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, WebBox, KeyValueBox }}
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
                components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, WebBox, KeyValueBox }}
                bindings={this.props.bindings}
                jsx={this.overlayLayout}
                showWarnings={true}
                onError={(test: any) => console.log(test)}
            />);
    }

    getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH - this.centeringShiftX, -COLLECTION_BORDER_WIDTH - this.centeringShiftY).transform(this.getLocalTransform())
    getLocalTransform = (): Transform => Transform.Identity.translate(this.panX, this.panY).scale(1 / this.scale);
    noScaling = () => 1;

    //when focus is lost, this will remove the preview cursor
    @action
    onBlur = (e: React.FocusEvent<HTMLInputElement>): void => {
        this._previewCursorVisible = false;
    }

    render() {

        //determines whether preview text cursor should be visible (ie when user taps this collection it should)
        let cursor = null;
        if (this._previewCursorVisible) {
            //get local position and place cursor there!
            let [x, y] = this.getTransform().transformPoint(this._downX, this._downY);
            cursor = <div id="prevCursor" onKeyPress={this.onKeyDown} style={{ color: "black", position: "absolute", transformOrigin: "left top", transform: `translate(${x}px, ${y}px)` }}>I</div>
        }

        const panx: number = -this.panX + this.centeringShiftX;
        const pany: number = -this.panY + this.centeringShiftY;

        return (
            <div className="collectionfreeformview-container"
                onPointerDown={this.onPointerDown}
                onKeyPress={this.onKeyDown}
                onWheel={this.onPointerWheel}
                onDrop={this.onDrop.bind(this)}
                onDragOver={this.onDragOver}
                onBlur={this.onBlur}
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