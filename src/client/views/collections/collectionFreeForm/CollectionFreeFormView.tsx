import { action, computed, observable, trace } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { FieldWaiting } from "../../../../fields/Field";
import { KeyStore } from "../../../../fields/KeyStore";
import { TextField } from "../../../../fields/TextField";
import { DragManager } from "../../../util/DragManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { InkingCanvas } from "../../InkingCanvas";
import { CollectionFreeFormDocumentView } from "../../nodes/CollectionFreeFormDocumentView";
import { DocumentContentsView } from "../../nodes/DocumentContentsView";
import { DocumentViewProps } from "../../nodes/DocumentView";
import { COLLECTION_BORDER_WIDTH } from "../CollectionBaseView";
import { CollectionViewBase } from "../CollectionViewBase";
import { CollectionFreeFormLinksView } from "./CollectionFreeFormLinksView";
import "./CollectionFreeFormView.scss";
import { MarqueeView } from "./MarqueeView";
import React = require("react");
import v5 = require("uuid/v5");
import { CollectionFreeFormRemoteCursors } from "./CollectionFreeFormRemoteCursors";
import { PreviewCursor } from "./PreviewCursor";
import { DocumentManager } from "../../../util/DocumentManager";
import { SelectionManager } from "../../../util/SelectionManager";
import { NumberField } from "../../../../fields/NumberField";
import { Main } from "../../Main";

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    public _canvasRef = React.createRef<HTMLDivElement>();
    private _selectOnLoaded: string = ""; // id of document that should be selected once it's loaded (used for click-to-type)

    public addLiveTextBox = (newBox: Document) => {
        // mark this collection so that when the text box is created we can send it the SelectOnLoad prop to focus itself and receive text input
        this._selectOnLoaded = newBox.Id;
        this.addDocument(newBox, false);
    }

    public addDocument = (newBox: Document, allowDuplicates: boolean) => {
        let added = this.props.addDocument(newBox, false);
        this.bringToFront(newBox);
        return added;
    }

    public selectDocuments = (docs: Document[]) => {
        SelectionManager.DeselectAll;
        docs.map(doc => {
            const dv = DocumentManager.Instance.getDocumentView(doc);
            if (dv) {
                SelectionManager.SelectDoc(dv, true);
            }
        })
    }

    public getActiveDocuments = () => {
        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1);
        return this.props.Document.GetList(this.props.fieldKey, [] as Document[]).reduce((active, doc) => {
            var page = doc.GetNumber(KeyStore.Page, -1);
            if (page === curPage || page === -1) {
                active.push(doc);
            }
            return active;
        }, [] as Document[]);
    }

    @observable public DownX: number = 0;
    @observable public DownY: number = 0;
    @observable private _lastX: number = 0;
    @observable private _lastY: number = 0;

    private outerElement?: HTMLDivElement;

    @computed get panX(): number { return this.props.Document.GetNumber(KeyStore.PanX, 0) }
    @computed get panY(): number { return this.props.Document.GetNumber(KeyStore.PanY, 0) }
    @computed get scale(): number { return this.props.Document.GetNumber(KeyStore.Scale, 1); }
    @computed get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey.Id === KeyStore.Annotations.Id; } // bcz: ? Why do we need to compare Id's?
    @computed get nativeWidth() { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight() { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }
    @computed get zoomScaling() { return this.props.Document.GetNumber(KeyStore.Scale, 1); }
    @computed get centeringShiftX() { return !this.props.Document.GetNumber(KeyStore.NativeWidth, 0) && this.outerElement ? this.outerElement.clientWidth / 2 : 0; }  // shift so pan position is at center of window for non-overlay collections
    @computed get centeringShiftY() { return !this.props.Document.GetNumber(KeyStore.NativeHeight, 0) && this.outerElement ? this.outerElement.clientHeight / 2 : 0; }// shift so pan position is at center of window for non-overlay collections

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (super.drop(e, de)) {
            if (de.data instanceof DragManager.DocumentDragData) {
                let droppedDocs = de.data.droppedDocuments;
                let xoff = de.data.xOffset as number || 0;
                let yoff = de.data.yOffset as number || 0;
                if (droppedDocs.length) {
                    let screenX = de.x - xoff;
                    let screenY = de.y - yoff;
                    const [x, y] = this.getTransform().transformPoint(screenX, screenY);
                    let dragDoc = droppedDocs[0];
                    let dragX = dragDoc.GetNumber(KeyStore.X, 0);
                    let dragY = dragDoc.GetNumber(KeyStore.Y, 0);
                    droppedDocs.map(async d => {
                        let docX = d.GetNumber(KeyStore.X, 0);
                        let docY = d.GetNumber(KeyStore.Y, 0);
                        d.SetNumber(KeyStore.X, x + (docX - dragX));
                        d.SetNumber(KeyStore.Y, y + (docY - dragY));
                        let docW = await d.GetTAsync(KeyStore.Width, NumberField);
                        let docH = await d.GetTAsync(KeyStore.Height, NumberField);
                        if (!docW) {
                            d.SetNumber(KeyStore.Width, 300);
                        }
                        if (!docH) {
                            d.SetNumber(KeyStore.Height, 300);
                        }
                        this.bringToFront(d);
                    })
                }
            }
            return true;
        }
        return false;
    }


    @action
    cleanupInteractions = () => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (((e.button === 2 && (!this.isAnnotationOverlay || this.zoomScaling !== 1)) || e.button === 0) && this.props.active()) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
            this._lastX = this.DownX = e.pageX;
            this._lastY = this.DownY = e.pageY;
            if (this.props.isSelected())
                e.stopPropagation();
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();

        this.cleanupInteractions();
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble && this.props.active()) {
            if ((!this.isAnnotationOverlay || this.zoomScaling !== 1) && !e.shiftKey) {
                let x = this.props.Document.GetNumber(KeyStore.PanX, 0);
                let y = this.props.Document.GetNumber(KeyStore.PanY, 0);
                let [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
                this.SetPan(x - dx, y - dy);
                this._lastX = e.pageX;
                this._lastY = e.pageY;
                e.stopPropagation();
                e.preventDefault();
            }
        }
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        this.props.select(false);
        e.stopPropagation();
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
            // if (modes[e.deltaMode] === 'pixels') coefficient = 50;
            // else if (modes[e.deltaMode] === 'lines') coefficient = 1000; // This should correspond to line-height??
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
        Main.Instance.SetTextDoc(undefined, undefined);
        var x1 = this.getLocalTransform().inverse().Scale;
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
        if (field && field !== FieldWaiting) {
            return field.Data;
        }
    }
    @computed get overlayLayout(): string | undefined {
        let field = this.props.Document.GetT(KeyStore.OverlayLayout, TextField);
        if (field && field !== FieldWaiting) {
            return field.Data;
        }
    }

    focusDocument = (doc: Document) => {
        let x = doc.GetNumber(KeyStore.X, 0) + doc.GetNumber(KeyStore.Width, 0) / 2;
        let y = doc.GetNumber(KeyStore.Y, 0) + doc.GetNumber(KeyStore.Height, 0) / 2;
        this.SetPan(x, y);
        this.props.focus(this.props.Document);
    }

    getDocumentViewProps(document: Document): DocumentViewProps {
        return {
            Document: document,
            addDocument: this.props.addDocument,
            removeDocument: this.props.removeDocument,
            moveDocument: this.props.moveDocument,
            ScreenToLocalTransform: this.getTransform,
            isTopMost: false,
            selectOnLoad: document.Id === this._selectOnLoaded,
            PanelWidth: document.Width,
            PanelHeight: document.Height,
            ContentScaling: this.noScaling,
            ContainingCollectionView: undefined,
            focus: this.focusDocument,
            parentActive: this.props.active,
            onActiveChanged: this.props.active,
        }
    }

    @computed
    get views() {
        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1);
        return this.props.Document.GetList(this.props.fieldKey, [] as Document[]).filter(doc => doc).reduce((prev, doc) => {
            var page = doc.GetNumber(KeyStore.Page, -1);
            if (page === curPage || page === -1)
                prev.push(<CollectionFreeFormDocumentView key={doc.Id} {...this.getDocumentViewProps(doc)} />);
            return prev;
        }, [] as JSX.Element[])
    }

    @computed
    get backgroundView() {
        return !this.backgroundLayout ? (null) :
            (<DocumentContentsView {...this.getDocumentViewProps(this.props.Document)}
                layoutKey={KeyStore.BackgroundLayout} isTopMost={this.props.isTopMost} isSelected={() => false} select={() => { }} />);
    }
    @computed
    get overlayView() {
        return !this.overlayLayout ? (null) :
            (<DocumentContentsView {...this.getDocumentViewProps(this.props.Document)}
                layoutKey={KeyStore.OverlayLayout} isTopMost={this.props.isTopMost} isSelected={() => false} select={() => { }} />);
    }

    getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH, -COLLECTION_BORDER_WIDTH).translate(-this.centeringShiftX, -this.centeringShiftY).transform(this.getLocalTransform())
    getContainerTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH, -COLLECTION_BORDER_WIDTH)
    getLocalTransform = (): Transform => Transform.Identity().scale(1 / this.scale).translate(this.panX, this.panY);
    noScaling = () => 1;
    childViews = () => this.views;

    render() {
        let [dx, dy] = [this.centeringShiftX, this.centeringShiftY];

        const panx: number = -this.props.Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = -this.props.Document.GetNumber(KeyStore.PanY, 0);

        return (
            <div className={`collectionfreeformview${this.isAnnotationOverlay ? "-overlay" : "-container"}`}
                onPointerDown={this.onPointerDown} onPointerMove={(e) => super.setCursorPosition(this.getTransform().transformPoint(e.clientX, e.clientY))}
                onDrop={this.onDrop.bind(this)} onDragOver={this.onDragOver} onWheel={this.onPointerWheel}
                style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }} ref={this.createDropTarget}>
                <MarqueeView container={this} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments}
                    addDocument={this.addDocument} removeDocument={this.props.removeDocument}
                    getContainerTransform={this.getContainerTransform} getTransform={this.getTransform}>
                    <PreviewCursor container={this} addLiveTextDocument={this.addLiveTextBox}
                        getContainerTransform={this.getContainerTransform} getTransform={this.getTransform} >
                        <div className="collectionfreeformview" ref={this._canvasRef}
                            style={{ transform: `translate(${dx}px, ${dy}px) scale(${this.zoomScaling}, ${this.zoomScaling}) translate(${panx}px, ${pany}px)` }}>
                            {this.backgroundView}
                            <CollectionFreeFormLinksView {...this.props}>
                                <InkingCanvas getScreenTransform={this.getTransform} Document={this.props.Document} >
                                    {this.childViews}
                                </InkingCanvas>
                            </CollectionFreeFormLinksView>
                            <CollectionFreeFormRemoteCursors {...this.props} />
                        </div>
                        {this.overlayView}
                    </PreviewCursor>
                </MarqueeView>
            </div>
        );
    }
}