import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { TextField } from "../../../fields/TextField";
import { Documents } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionView } from "../collections/CollectionView";
import { InkingCanvas } from "../InkingCanvas";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { DocumentView } from "../nodes/DocumentView";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import { KeyValueBox } from "../nodes/KeyValueBox";
import { PDFBox } from "../nodes/PDFBox";
import { WebBox } from "../nodes/WebBox";
import "./CollectionFreeFormView.scss";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { CollectionViewBase } from "./CollectionViewBase";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    private _canvasRef = React.createRef<HTMLDivElement>();
    @observable
    private _lastX: number = 0;
    @observable
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
        if (doc) {
            let screenX = de.x - (de.data["xOffset"] as number || 0);
            let screenY = de.y - (de.data["yOffset"] as number || 0);
            const [x, y] = this.getTransform().transformPoint(screenX, screenY);
            doc.SetNumber(KeyStore.X, x);
            doc.SetNumber(KeyStore.Y, y);
            this.bringToFront(doc);
        }
    }

    @observable
    _marquee = false;

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (((e.button === 2 && this.props.active()) || !e.defaultPrevented) &&
            (!this.isAnnotationOverlay || this.zoomScaling != 1 || e.button == 0)) {
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
        if (this._marquee) {
            document.removeEventListener("keydown", this.marqueeCommand);
        }
        e.stopPropagation();

        if (this._marquee) {
            if (!e.shiftKey) {
                SelectionManager.DeselectAll();
            }
            var selectedDocs = this.marqueeSelect();
            selectedDocs.map(s => this.props.CollectionView.SelectedDocs.push(s.Id));
        }
        else if (!this._marquee && Math.abs(this._downX - e.clientX) < 3 && Math.abs(this._downY - e.clientY) < 3) {
            //show preview text cursor on tap
            this._previewCursorVisible = true;
            //select is not already selected
            if (!this.props.isSelected()) {
                this.props.select(false);
            }
        }
        this.cleanupInteractions();
    }

    @action
    cleanupInteractions = () => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        this._marquee = false;
    }

    intersectRect(r1: { left: number, right: number, top: number, bottom: number },
        r2: { left: number, right: number, top: number, bottom: number }) {
        return !(r2.left > r1.right ||
            r2.right < r1.left ||
            r2.top > r1.bottom ||
            r2.bottom < r1.top);
    }

    marqueeSelect() {
        this.props.CollectionView.SelectedDocs.length = 0;
        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, 1);
        let p = this.getTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY);
        let v = this.getTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        let selRect = { left: p[0], top: p[1], right: p[0] + v[0], bottom: p[1] + v[1] }

        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, 1);
        const lvalue = this.props.Document.GetT<ListField<Document>>(this.props.fieldKey, ListField);
        let selection: Document[] = [];
        if (lvalue && lvalue != FieldWaiting) {
            lvalue.Data.map(doc => {
                var page = doc.GetNumber(KeyStore.Page, 0);
                if (page == curPage || page == 0) {
                    var x = doc.GetNumber(KeyStore.X, 0);
                    var y = doc.GetNumber(KeyStore.Y, 0);
                    var w = doc.GetNumber(KeyStore.Width, 0);
                    var h = doc.GetNumber(KeyStore.Height, 0);
                    if (this.intersectRect({ left: x, top: y, right: x + w, bottom: y + h }, selRect))
                        selection.push(doc)
                }
            })
        }
        return selection;
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble && this.props.active()) {
            e.stopPropagation();
            e.preventDefault();
            let wasMarquee = this._marquee;
            this._marquee = e.buttons != 2 && !e.altKey && !e.metaKey;
            if (this._marquee && !wasMarquee) {
                this._previewCursorVisible = false;
                document.addEventListener("keydown", this.marqueeCommand);
            }

            if (!this._marquee) {
                let x = this.props.Document.GetNumber(KeyStore.PanX, 0);
                let y = this.props.Document.GetNumber(KeyStore.PanY, 0);
                let [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
                this._previewCursorVisible = false;
                this.SetPan(x - dx, y - dy);
            }
        }
        this._lastX = e.pageX;
        this._lastY = e.pageY;
    }

    @action
    marqueeCommand = (e: KeyboardEvent) => {
        if (e.key == "Backspace") {
            this.marqueeSelect().map(d => this.props.removeDocument(d));
            this.cleanupInteractions();
        }
        if (e.key == "c") {
            let p = this.getTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY);
            let v = this.getTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);

            let selected = this.marqueeSelect().map(m => m);
            this.marqueeSelect().map(d => this.props.removeDocument(d));
            //setTimeout(() => {
            this.props.CollectionView.addDocument(Documents.FreeformDocument(selected.map(d => {
                d.SetNumber(KeyStore.X, d.GetNumber(KeyStore.X, 0) - p[0] - v[0] / 2);
                d.SetNumber(KeyStore.Y, d.GetNumber(KeyStore.Y, 0) - p[1] - v[1] / 2);
                d.SetNumber(KeyStore.Page, this.props.Document.GetNumber(KeyStore.Page, 0));
                d.SetText(KeyStore.Title, "" + d.GetNumber(KeyStore.Width, 0) + " " + d.GetNumber(KeyStore.Height, 0));
                return d;
            }), { x: p[0], y: p[1], panx: 0, pany: 0, width: v[0], height: v[1], title: "a nested collection" }));
            // }, 100);
            this.cleanupInteractions();
        }
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

            let localTransform = this.getLocalTransform()
            localTransform = localTransform.inverse().scaleAbout(deltaScale, x, y)
            // console.log(localTransform)

            this.props.Document.SetNumber(KeyStore.Scale, localTransform.Scale);
            this.SetPan(-localTransform.TranslateX / localTransform.Scale, -localTransform.TranslateY / localTransform.Scale);
        }
    }

    @action
    private SetPan(panX: number, panY: number) {
        var x1 = this.getLocalTransform().inverse().Scale;
        var x2 = this.getTransform().inverse().Scale;
        const newPanX = Math.min((1 - 1 / x1) * this.nativeWidth, Math.max(0, panX));
        const newPanY = Math.min((1 - 1 / x1) * this.nativeHeight, Math.max(0, panY));
        this.props.Document.SetNumber(KeyStore.PanX, this.isAnnotationOverlay ? newPanX : panX);
        this.props.Document.SetNumber(KeyStore.PanY, this.isAnnotationOverlay ? newPanY : panY);
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
        // if (!e.ctrlKey && !e.altKey) {
        //     if (this._previewCursorVisible) {
        //         //make textbox and add it to this collection
        //         let [x, y] = this.getTransform().transformPoint(this._downX, this._downY); (this._downX, this._downY);
        //         let newBox = Documents.TextDocument({ width: 200, height: 100, x: x, y: y, title: "new" });
        //         // mark this collection so that when the text box is created we can send it the SelectOnLoad prop to focus itself
        //         this._selectOnLoaded = newBox.Id;
        //         //set text to be the typed key and get focus on text box
        //         this.props.CollectionView.addDocument(newBox);
        //         //remove cursor from screen
        //         this._previewCursorVisible = false;
        //     }
        // }
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

    focusDocument = (doc: Document) => {
        let x = doc.GetNumber(KeyStore.X, 0) + doc.GetNumber(KeyStore.Width, 0) / 2;
        let y = doc.GetNumber(KeyStore.Y, 0) + doc.GetNumber(KeyStore.Height, 0) / 2;
        this.SetPan(x, y);
        this.props.focus(this.props.Document);
    }


    @computed
    get views() {
        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, 1);
        const lvalue = this.props.Document.GetT<ListField<Document>>(this.props.fieldKey, ListField);
        if (lvalue && lvalue != FieldWaiting) {
            return lvalue.Data.map(doc => {
                var page = doc.GetNumber(KeyStore.Page, 0);
                return (page != curPage && page != 0) ? (null) :
                    (<CollectionFreeFormDocumentView key={doc.Id} Document={doc}
                        AddDocument={this.props.addDocument}
                        RemoveDocument={this.props.removeDocument}
                        ScreenToLocalTransform={this.getTransform}
                        isTopMost={false}
                        SelectOnLoad={doc.Id === this._selectOnLoaded}
                        ContentScaling={this.noScaling}
                        PanelWidth={doc.Width}
                        PanelHeight={doc.Height}
                        ContainingCollectionView={this.props.CollectionView}
                        focus={this.focusDocument}
                    />);
            })
        }
        return null;
    }

    @computed
    get backgroundView() {
        return !this.backgroundLayout ? (null) :
            (<JsxParser
                components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, CollectionPDFView, WebBox, KeyValueBox, PDFBox }}
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
                components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, CollectionPDFView, WebBox, KeyValueBox, PDFBox }}
                bindings={this.props.bindings}
                jsx={this.overlayLayout}
                showWarnings={true}
                onError={(test: any) => console.log(test)}
            />);
    }

    getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH, -COLLECTION_BORDER_WIDTH).translate(-this.centeringShiftX, -this.centeringShiftY).transform(this.getLocalTransform())
    getLocalTransform = (): Transform => Transform.Identity.scale(1 / this.scale).translate(this.panX, this.panY);
    noScaling = () => 1;

    //when focus is lost, this will remove the preview cursor
    @action
    onBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
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

        let p = this.getTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY);
        let v = this.getTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        var marquee = this._marquee ? <div className="collectionfreeformview-marquee" style={{ transform: `translate(${p[0]}px, ${p[1]}px)`, width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}` }}></div> : (null);

        let [dx, dy] = [this.centeringShiftX, this.centeringShiftY];

        const panx: number = -this.props.Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = -this.props.Document.GetNumber(KeyStore.PanY, 0);
        // const panx: number = this.props.Document.GetNumber(KeyStore.PanX, 0) + this.centeringShiftX;
        // const pany: number = this.props.Document.GetNumber(KeyStore.PanY, 0) + this.centeringShiftY;
        // console.log("center:", this.getLocalTransform().transformPoint(this.centeringShiftX, this.centeringShiftY));

        return (
            <div className={`collectionfreeformview${this.isAnnotationOverlay ? "-overlay" : "-container"}`}
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
                    style={{ transformOrigin: "left top", transform: `translate(${dx}px, ${dy}px) scale(${this.zoomScaling}, ${this.zoomScaling}) translate(${panx}px, ${pany}px)` }}
                    ref={this._canvasRef}>
                    {this.backgroundView}
                    <InkingCanvas getScreenTransform={this.getTransform} Document={this.props.Document} />
                    {cursor}
                    {this.views}
                    {marquee}
                </div>
                {this.overlayView}
            </div>
        );
    }
}
