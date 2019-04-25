import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { KeyStore } from "../../../../fields/KeyStore";
import { emptyFunction, returnFalse, returnOne } from "../../../../Utils";
import { TouchInteractions } from "../../../TouchInteractions";
import { DocumentManager } from "../../../util/DocumentManager";
import { DragManager } from "../../../util/DragManager";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from "../../../views/globalCssVariables.scss";
import { InkingCanvas } from "../../InkingCanvas";
import { MainOverlayTextBox } from "../../MainOverlayTextBox";
import { CollectionFreeFormDocumentView } from "../../nodes/CollectionFreeFormDocumentView";
import { DocumentContentsView } from "../../nodes/DocumentContentsView";
import { DocumentViewProps } from "../../nodes/DocumentView";
import { CollectionSubView } from "../CollectionSubView";
import { CollectionFreeFormLinksView } from "./CollectionFreeFormLinksView";
import { CollectionFreeFormRemoteCursors } from "./CollectionFreeFormRemoteCursors";
import "./CollectionFreeFormView.scss";
import { MarqueeView } from "./MarqueeView";
import React = require("react");
import v5 = require("uuid/v5");

@observer
export class CollectionFreeFormView extends CollectionSubView {
    private _selectOnLoaded: string = ""; // id of document that should be selected once it's loaded (used for click-to-type)
    private _lastX: number = 0;
    private _lastY: number = 0;
    private get _pwidth() { return this.props.PanelWidth(); }
    private get _pheight() { return this.props.PanelHeight(); }

    @computed get nativeWidth() { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight() { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }
    private get borderWidth() { return this.isAnnotationOverlay ? 0 : COLLECTION_BORDER_WIDTH; }
    private get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey.Id === KeyStore.Annotations.Id; } // bcz: ? Why do we need to compare Id's?
    private childViews = () => this.views;
    private panX = () => this.props.Document.GetNumber(KeyStore.PanX, 0);
    private panY = () => this.props.Document.GetNumber(KeyStore.PanY, 0);
    private zoomScaling = () => this.props.Document.GetNumber(KeyStore.Scale, 1);
    private centeringShiftX = () => !this.nativeWidth ? this._pwidth / 2 : 0;  // shift so pan position is at center of window for non-overlay collections
    private centeringShiftY = () => !this.nativeHeight ? this._pheight / 2 : 0;// shift so pan position is at center of window for non-overlay collections
    private getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth, -this.borderWidth).translate(-this.centeringShiftX(), -this.centeringShiftY()).transform(this.getLocalTransform());
    private getContainerTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth, -this.borderWidth);
    private getLocalTransform = (): Transform => Transform.Identity().scale(1 / this.zoomScaling()).translate(this.panX(), this.panY());
    private addLiveTextBox = (newBox: Document) => {
        this._selectOnLoaded = newBox.Id;// track the new text box so we can give it a prop that tells it to focus itself when it's displayed
        this.addDocument(newBox, false);
    }
    private addDocument = (newBox: Document, allowDuplicates: boolean) => {
        if (this.isAnnotationOverlay) {
            newBox.SetNumber(KeyStore.Zoom, this.props.Document.GetNumber(KeyStore.Scale, 1));
        }
        return this.props.addDocument(this.bringToFront(newBox), false);
    }
    private selectDocuments = (docs: Document[]) => {
        SelectionManager.DeselectAll;
        docs.map(doc => DocumentManager.Instance.getDocumentView(doc)).filter(dv => dv).map(dv =>
            SelectionManager.SelectDoc(dv!, true));
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

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (super.drop(e, de) && de.data instanceof DragManager.DocumentDragData) {
            const [x, y] = this.getTransform().transformPoint(de.x - de.data.xOffset, de.y - de.data.yOffset);
            if (de.data.droppedDocuments.length) {
                let dropX = de.data.droppedDocuments[0].GetNumber(KeyStore.X, 0);
                let dropY = de.data.droppedDocuments[0].GetNumber(KeyStore.Y, 0);
                de.data.droppedDocuments.map(d => {
                    d.SetNumber(KeyStore.X, x + (d.GetNumber(KeyStore.X, 0) - dropX));
                    d.SetNumber(KeyStore.Y, y + (d.GetNumber(KeyStore.Y, 0) - dropY));
                    if (!d.GetNumber(KeyStore.Width, 0)) {
                        d.SetNumber(KeyStore.Width, 300);
                    }
                    if (!d.GetNumber(KeyStore.Height, 0)) {
                        let nw = d.GetNumber(KeyStore.NativeWidth, 0);
                        let nh = d.GetNumber(KeyStore.NativeHeight, 0);
                        d.SetNumber(KeyStore.Height, nw && nh ? nh / nw * d.Width() : 300);
                    }
                    this.bringToFront(d);
                });
                SelectionManager.ReselectAll();
            }
            return true;
        }
        return false;
    }

    @action
    cleanupInteractions = () => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.removeEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchend", this.onTouchEnd);
    }

    shouldPan = (e: PointerEvent | React.PointerEvent): boolean => {
        return e.pointerType === "touch" || (e.pointerType === "mouse" && (e.button === 2 || e.altKey));
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        e.currentTarget.setPointerCapture(e.pointerId);
        if ((this.shouldPan(e) && this.props.active() && (!this.isAnnotationOverlay || this.zoomScaling() !== 1)) || e.button === 0) {
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
        if (e.pointerType === "touch") return;
        e.stopPropagation();

        this.cleanupInteractions();
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (e.pointerType === "touch") {
            if (this.props.active()) {
                e.stopPropagation();
            }
            return;
        }

        if (!e.cancelBubble && this.props.active()) {
            if ((!this.isAnnotationOverlay || this.zoomScaling() !== 1) && !e.shiftKey) {
                this.pan(e);
                e.stopPropagation();
                e.preventDefault();
            }
        }
    }

    @action
    pan = (e: PointerEvent | React.Touch): void => {
        let x = this.props.Document.GetNumber(KeyStore.PanX, 0);
        let y = this.props.Document.GetNumber(KeyStore.PanY, 0);
        let docs = this.props.Document.GetList(this.props.fieldKey, [] as Document[]);
        let [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
        if (!this.isAnnotationOverlay) {
            let minx = docs.length ? docs[0].GetNumber(KeyStore.X, 0) : 0;
            let maxx = docs.length ? docs[0].GetNumber(KeyStore.Width, 0) + minx : minx;
            let miny = docs.length ? docs[0].GetNumber(KeyStore.Y, 0) : 0;
            let maxy = docs.length ? docs[0].GetNumber(KeyStore.Height, 0) + miny : miny;
            let ranges = docs.filter(doc => doc).reduce((range, doc) => {
                let x = doc.GetNumber(KeyStore.X, 0);
                let xe = x + doc.GetNumber(KeyStore.Width, 0);
                let y = doc.GetNumber(KeyStore.Y, 0);
                let ye = y + doc.GetNumber(KeyStore.Height, 0);
                return [[range[0][0] > x ? x : range[0][0], range[0][1] < xe ? xe : range[0][1]],
                [range[1][0] > y ? y : range[1][0], range[1][1] < ye ? ye : range[1][1]]];
            }, [[minx, maxx], [miny, maxy]]);
            let panelwidth = this._pwidth / this.zoomScaling() / 2;
            let panelheight = this._pheight / this.zoomScaling() / 2;
            if (x - dx < ranges[0][0] - panelwidth) x = ranges[0][1] + panelwidth + dx;
            if (x - dx > ranges[0][1] + panelwidth) x = ranges[0][0] - panelwidth + dx;
            if (y - dy < ranges[1][0] - panelheight) y = ranges[1][1] + panelheight + dy;
            if (y - dy > ranges[1][1] + panelheight) y = ranges[1][0] - panelheight + dy;
        }
        this.setPan(x - dx, y - dy);
        this._lastX = e.pageX;
        this._lastY = e.pageY;
    }

    private prevPoints: Map<number, React.Touch> = new Map<number, React.Touch>();
    public FirstX: number = 0;
    public FirstY: number = 0;
    public SecondX: number = 0;
    public SecondY: number = 0;

    private _touchDrag: boolean = false;

    /**
     * When a touch even starts, we keep track of each touch that is associated with that event
     */
    @action
    onTouchStart = (e: React.TouchEvent): void => {
        for (let i = 0; i < e.targetTouches.length; i++) {
            let pt = e.targetTouches.item(i);
            this.prevPoints.set(pt.identifier, pt);
        }
        document.removeEventListener("touchmove", this.onTouch);
        document.addEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchend", this.onTouchEnd);
        document.addEventListener("touchend", this.onTouchEnd);
    }

    /**
     * Handle touch move event
     */
    @action
    onTouch = (e: TouchEvent): void => {
        // if we're not actually moving a lot, don't consider it as dragging yet
        if (!TouchInteractions.IsDragging(this.prevPoints, e.targetTouches, 5) && !this._touchDrag) return;
        this._touchDrag = true;
        switch (e.targetTouches.length) {
            case 1:
                // panning a workspace
                if (!e.cancelBubble && this.props.active()) {
                    let pt = e.targetTouches.item(0);
                    if (pt) {
                        this.pan(pt);
                    }
                    e.stopPropagation();
                    e.preventDefault();
                }
                break;
            case 2:
                // pinch zooming
                if (!e.cancelBubble) {
                    let pt1: Touch | null = e.targetTouches.item(0);
                    let pt2: Touch | null = e.targetTouches.item(1);
                    if (!pt1 || !pt2) return;

                    if (this.prevPoints.size === 2) {
                        let oldPoint1 = this.prevPoints.get(pt1.identifier);
                        let oldPoint2 = this.prevPoints.get(pt2.identifier);
                        if (oldPoint1 && oldPoint2) {
                            let dir = TouchInteractions.Pinching(pt1, pt2, oldPoint1, oldPoint2);

                            // if zooming, zoom
                            if (dir !== 0) {
                                let d1 = Math.sqrt(Math.pow(pt1.clientX - oldPoint1.clientX, 2) + Math.pow(pt1.clientY - oldPoint1.clientY, 2));
                                let d2 = Math.sqrt(Math.pow(pt2.clientX - oldPoint2.clientX, 2) + Math.pow(pt2.clientY - oldPoint2.clientY, 2));
                                let centerX = Math.min(pt1.clientX, pt2.clientX) + Math.abs(pt2.clientX - pt1.clientX) / 2;
                                let centerY = Math.min(pt1.clientY, pt2.clientY) + Math.abs(pt2.clientY - pt1.clientY) / 2;
                                let delta = dir * (d1 + d2);
                                this.zoom(centerX, centerY, delta, 250);
                                this.prevPoints.set(pt1.identifier, pt1);
                                this.prevPoints.set(pt2.identifier, pt2);
                            }
                        }
                    }
                }
                e.stopPropagation();
                e.preventDefault();
                break;
        }
    }

    @action
    onTouchEnd = (e: TouchEvent): void => {
        this._touchDrag = false;
        e.stopPropagation();

        // remove all the touches associated with the event
        for (let i = 0; i < e.targetTouches.length; i++) {
            let pt = e.targetTouches.item(i);
            if (pt) {
                if (this.prevPoints.has(pt.identifier)) {
                    this.prevPoints.delete(pt.identifier);
                }
            }
        }

        if (e.targetTouches.length === 0) {
            this.prevPoints.clear();
        }
        this.cleanupInteractions();
    }

    @action
    zoom = (pointX: number, pointY: number, deltaY: number, coefficient: number): void => {
        let transform = this.getTransform();
        let deltaScale = (1 - (deltaY / coefficient));
        if (deltaScale * this.zoomScaling() < 1 && this.isAnnotationOverlay) {
            deltaScale = 1 / this.zoomScaling();
        }
        let [x, y] = transform.transformPoint(pointX, pointY);

        let localTransform = this.getLocalTransform();
        localTransform = localTransform.inverse().scaleAbout(deltaScale, x, y);

        this.props.Document.SetNumber(KeyStore.Scale, localTransform.Scale);
        this.setPan(-localTransform.TranslateX / localTransform.Scale, -localTransform.TranslateY / localTransform.Scale);
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        // if (!this.props.active()) {
        //     return;
        // }
        let childSelected = this.props.Document.GetList(this.props.fieldKey, [] as Document[]).filter(doc => doc).reduce((childSelected, doc) => {
            var dv = DocumentManager.Instance.getDocumentView(doc);
            return childSelected || (dv && SelectionManager.IsSelected(dv) ? true : false);
        }, false);
        if (!this.props.isSelected() && !childSelected && !this.props.isTopMost) {
            return;
        }
        e.stopPropagation();
        const coefficient = 1000;

        if (e.ctrlKey) {
            let deltaScale = (1 - (e.deltaY / coefficient));
            this.props.Document.SetNumber(KeyStore.NativeWidth, this.nativeWidth * deltaScale);
            this.props.Document.SetNumber(KeyStore.NativeHeight, this.nativeHeight * deltaScale);
            e.stopPropagation();
            e.preventDefault();
        } else {
            this.zoom(e.clientX, e.clientY, e.deltaY, coefficient);
            e.stopPropagation();
        }
    }

    @action
    setPan(panX: number, panY: number) {
        MainOverlayTextBox.Instance.SetTextDoc();
        var scale = this.getLocalTransform().inverse().Scale;
        const newPanX = Math.min((1 - 1 / scale) * this.nativeWidth, Math.max(0, panX));
        const newPanY = Math.min((1 - 1 / scale) * this.nativeHeight, Math.max(0, panY));
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
        this.props.Document.GetList(this.props.fieldKey, [] as Document[]).slice().sort((doc1, doc2) => {
            if (doc1 === doc) return 1;
            if (doc2 === doc) return -1;
            return doc1.GetNumber(KeyStore.ZIndex, 0) - doc2.GetNumber(KeyStore.ZIndex, 0);
        }).map((doc, index) => doc.SetNumber(KeyStore.ZIndex, index + 1));
        return doc;
    }

    focusDocument = (doc: Document) => {
        this.setPan(
            doc.GetNumber(KeyStore.X, 0) + doc.Width() / 2,
            doc.GetNumber(KeyStore.Y, 0) + doc.Height() / 2);
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
            ContentScaling: returnOne,
            ContainingCollectionView: this.props.CollectionView,
            focus: this.focusDocument,
            parentActive: this.props.active,
            whenActiveChanged: this.props.active,
        };
    }

    @computed
    get views() {
        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1);
        let docviews = this.props.Document.GetList(this.props.fieldKey, [] as Document[]).filter(doc => doc).reduce((prev, doc) => {
            var page = doc.GetNumber(KeyStore.Page, -1);
            if (page === curPage || page === -1) {
                prev.push(<CollectionFreeFormDocumentView key={doc.Id} {...this.getDocumentViewProps(doc)} />);
            }
            return prev;
        }, [] as JSX.Element[]);

        setTimeout(() => this._selectOnLoaded = "", 600);// bcz: surely there must be a better way ....

        return docviews;
    }

    @action
    onCursorMove = (e: React.PointerEvent) => {
        super.setCursorPosition(this.getTransform().transformPoint(e.clientX, e.clientY));
    }

    render() {
        const containerName = `collectionfreeformview${this.isAnnotationOverlay ? "-overlay" : "-container"}`;
        return (
            <div className={containerName} ref={this.createDropTarget} onWheel={this.onPointerWheel} onTouchStart={this.onTouchStart}
                onPointerDown={this.onPointerDown} onPointerMove={this.onCursorMove} onDrop={this.onDrop.bind(this)} onDragOver={this.onDragOver} >
                <MarqueeView container={this} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments}
                    addDocument={this.addDocument} removeDocument={this.props.removeDocument} addLiveTextDocument={this.addLiveTextBox}
                    getContainerTransform={this.getContainerTransform} getTransform={this.getTransform}>
                    <CollectionFreeFormViewPannableContents centeringShiftX={this.centeringShiftX} centeringShiftY={this.centeringShiftY}
                        zoomScaling={this.zoomScaling} panX={this.panX} panY={this.panY}>
                        <CollectionFreeFormBackgroundView {...this.getDocumentViewProps(this.props.Document)} />
                        <CollectionFreeFormLinksView {...this.props} key="freeformLinks">
                            <InkingCanvas getScreenTransform={this.getTransform} Document={this.props.Document} >
                                {this.childViews}
                            </InkingCanvas>
                        </CollectionFreeFormLinksView>
                        <CollectionFreeFormRemoteCursors {...this.props} key="remoteCursors" />
                    </CollectionFreeFormViewPannableContents>
                    <CollectionFreeFormOverlayView {...this.getDocumentViewProps(this.props.Document)} />
                </MarqueeView>
            </div>
        );
    }
}

@observer
class CollectionFreeFormOverlayView extends React.Component<DocumentViewProps> {
    @computed get overlayView() {
        let overlayLayout = this.props.Document.GetText(KeyStore.OverlayLayout, "");
        return !overlayLayout ? (null) :
            (<DocumentContentsView {...this.props} layoutKey={KeyStore.OverlayLayout}
                isTopMost={this.props.isTopMost} isSelected={returnFalse} select={emptyFunction} />);
    }
    render() {
        return this.overlayView;
    }
}

@observer
class CollectionFreeFormBackgroundView extends React.Component<DocumentViewProps> {
    @computed get backgroundView() {
        let backgroundLayout = this.props.Document.GetText(KeyStore.BackgroundLayout, "");
        return !backgroundLayout ? (null) :
            (<DocumentContentsView {...this.props} layoutKey={KeyStore.BackgroundLayout}
                isTopMost={this.props.isTopMost} isSelected={returnFalse} select={emptyFunction} />);
    }
    render() {
        return this.backgroundView;
    }
}

interface CollectionFreeFormViewPannableContentsProps {
    centeringShiftX: () => number;
    centeringShiftY: () => number;
    panX: () => number;
    panY: () => number;
    zoomScaling: () => number;
}

@observer
class CollectionFreeFormViewPannableContents extends React.Component<CollectionFreeFormViewPannableContentsProps>{
    render() {
        const cenx = this.props.centeringShiftX();
        const ceny = this.props.centeringShiftY();
        const panx = -this.props.panX();
        const pany = -this.props.panY();
        const zoom = this.props.zoomScaling();// needs to be a variable outside of the <Measure> otherwise, reactions won't fire
        return <div className="collectionfreeformview" style={{ transform: `translate(${cenx}px, ${ceny}px) scale(${zoom}, ${zoom}) translate(${panx}px, ${pany}px)` }}>
            {this.props.children}
        </div>;
    }
}