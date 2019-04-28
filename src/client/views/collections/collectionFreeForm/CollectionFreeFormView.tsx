import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { emptyFunction, returnFalse, returnOne } from "../../../../Utils";
import { DocumentManager } from "../../../util/DocumentManager";
import { DragManager } from "../../../util/DragManager";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from "../../../views/globalCssVariables.scss";
import { InkingCanvas } from "../../InkingCanvas";
import { CollectionFreeFormDocumentView } from "../../nodes/CollectionFreeFormDocumentView";
import { DocumentContentsView } from "../../nodes/DocumentContentsView";
import { DocumentViewProps, positionSchema } from "../../nodes/DocumentView";
import { CollectionSubView } from "../CollectionSubView";
import { CollectionFreeFormLinksView } from "./CollectionFreeFormLinksView";
import { CollectionFreeFormRemoteCursors } from "./CollectionFreeFormRemoteCursors";
import "./CollectionFreeFormView.scss";
import { MarqueeView } from "./MarqueeView";
import React = require("react");
import v5 = require("uuid/v5");
import { createSchema, makeInterface, listSpec } from "../../../../new_fields/Schema";
import { Doc } from "../../../../new_fields/Doc";
import { FieldValue, Cast, NumCast } from "../../../../new_fields/Types";
import { pageSchema } from "../../nodes/ImageBox";
import { List } from "../../../../new_fields/List";
import { Id } from "../../../../new_fields/RefField";

export const panZoomSchema = createSchema({
    panX: "number",
    panY: "number",
    scale: "number"
});

type PanZoomDocument = makeInterface<[typeof panZoomSchema, typeof positionSchema, typeof pageSchema]>;
const PanZoomDocument = makeInterface(panZoomSchema, positionSchema, pageSchema);

@observer
export class CollectionFreeFormView extends CollectionSubView(PanZoomDocument) {
    public static RIGHT_BTN_DRAG = false;
    private _selectOnLoaded: string = ""; // id of document that should be selected once it's loaded (used for click-to-type)
    private _lastX: number = 0;
    private _lastY: number = 0;
    private get _pwidth() { return this.props.PanelWidth(); }
    private get _pheight() { return this.props.PanelHeight(); }

    @computed get nativeWidth() { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight() { return FieldValue(this.Document.nativeHeight, 0); }
    private get borderWidth() { return this.isAnnotationOverlay ? 0 : COLLECTION_BORDER_WIDTH; }
    private get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey === "annotations"; }
    private panX = () => FieldValue(this.Document.panX, 0);
    private panY = () => FieldValue(this.Document.panY, 0);
    private zoomScaling = () => FieldValue(this.Document.scale, 1);
    private centeringShiftX = () => !this.nativeWidth ? this._pwidth / 2 : 0;  // shift so pan position is at center of window for non-overlay collections
    private centeringShiftY = () => !this.nativeHeight ? this._pheight / 2 : 0;// shift so pan position is at center of window for non-overlay collections
    private getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth, -this.borderWidth).translate(-this.centeringShiftX(), -this.centeringShiftY()).transform(this.getLocalTransform());
    private getContainerTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth, -this.borderWidth);
    private getLocalTransform = (): Transform => Transform.Identity().scale(1 / this.zoomScaling()).translate(this.panX(), this.panY());
    private addLiveTextBox = (newBox: Doc) => {
        this._selectOnLoaded = newBox[Id];// track the new text box so we can give it a prop that tells it to focus itself when it's displayed
        this.addDocument(newBox, false);
    }
    private addDocument = (newBox: Doc, allowDuplicates: boolean) => {
        this.props.addDocument(newBox, false);
        this.bringToFront(newBox);
        return true;
    }
    private selectDocuments = (docs: Doc[]) => {
        SelectionManager.DeselectAll;
        docs.map(doc => DocumentManager.Instance.getDocumentView(doc)).filter(dv => dv).map(dv =>
            SelectionManager.SelectDoc(dv!, true));
    }
    public getActiveDocuments = () => {
        const curPage = FieldValue(this.Document.curPage, -1);
        return FieldValue(this.children, [] as Doc[]).filter(doc => {
            var page = Cast(doc.page, "number", -1);
            return page === curPage || page === -1;
        });
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (super.drop(e, de) && de.data instanceof DragManager.DocumentDragData) {
            if (de.data.droppedDocuments.length) {
                let dragDoc = de.data.droppedDocuments[0];
                let zoom = NumCast(dragDoc.zoomBasis, 1);
                let [xp, yp] = this.getTransform().transformPoint(de.x, de.y);
                let x = xp - de.data.xOffset / zoom;
                let y = yp - de.data.yOffset / zoom;
                let dropX = NumCast(de.data.droppedDocuments[0].x);
                let dropY = NumCast(de.data.droppedDocuments[0].y);
                de.data.droppedDocuments.map(d => {
                    d.x = x + NumCast(d.x) - dropX;
                    d.y = y + NumCast(d.y) - dropY;
                    if (!NumCast(d.width)) {
                        d.width = 300;
                    }
                    if (!NumCast(d.height)) {
                        let nw = NumCast(d.nativeWidth);
                        let nh = NumCast(d.nativeHeight);
                        d.height = nw && nh ? nh / nw * NumCast(d.Width) : 300;
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
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        let childSelected = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc), [] as Doc[]).filter(doc => doc).reduce((childSelected, doc) => {
            var dv = DocumentManager.Instance.getDocumentView(doc);
            return childSelected || (dv && SelectionManager.IsSelected(dv) ? true : false);
        }, false);
        if ((CollectionFreeFormView.RIGHT_BTN_DRAG &&
            (((e.button === 2 && (!this.isAnnotationOverlay || this.zoomScaling() !== 1)) ||
                (e.button === 0 && e.altKey)) && (childSelected || this.props.active()))) ||
            (!CollectionFreeFormView.RIGHT_BTN_DRAG &&
                ((e.button === 0 && !e.altKey && (!this.isAnnotationOverlay || this.zoomScaling() !== 1)) && (childSelected || this.props.active())))) {
            this.cleanupInteractions();
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);
            this._lastX = e.pageX;
            this._lastY = e.pageY;
        }
    }

    onPointerUp = (e: PointerEvent): void => {
        this.cleanupInteractions();
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble) {
            let x = Cast(this.props.Document.panX, "number", 0);
            let y = Cast(this.props.Document.panY, "number", 0);
            let docs = this.children || [];
            let [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
            if (!this.isAnnotationOverlay) {
                let minx = docs.length ? Cast(docs[0].x, "number", 0) : 0;
                let maxx = docs.length ? Cast(docs[0].width, "number", 0) + minx : minx;
                let miny = docs.length ? Cast(docs[0].y, "number", 0) : 0;
                let maxy = docs.length ? Cast(docs[0].height, "number", 0) + miny : miny;
                let ranges = docs.filter(doc => doc).reduce((range, doc) => {
                    let x = Cast(doc.x, "number", 0);
                    let xe = x + Cast(doc.width, "number", 0);
                    let y = Cast(doc.y, "number", 0);
                    let ye = y + Cast(doc.height, "number", 0);
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
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        // if (!this.props.active()) {
        //     return;
        // }
        let childSelected = (this.children || []).filter(doc => doc).some(doc => {
            var dv = DocumentManager.Instance.getDocumentView(doc);
            return dv && SelectionManager.IsSelected(dv) ? true : false;
        });
        if (!this.props.isSelected() && !childSelected && !this.props.isTopMost) {
            return;
        }
        e.stopPropagation();
        const coefficient = 1000;

        if (e.ctrlKey) {
            let deltaScale = (1 - (e.deltaY / coefficient));
            this.props.Document.nativeWidth = this.nativeWidth * deltaScale;
            this.props.Document.nativeHeight = this.nativeHeight * deltaScale;
            e.stopPropagation();
            e.preventDefault();
        } else {
            // if (modes[e.deltaMode] === 'pixels') coefficient = 50;
            // else if (modes[e.deltaMode] === 'lines') coefficient = 1000; // This should correspond to line-height??
            let deltaScale = (1 - (e.deltaY / coefficient));
            if (deltaScale * this.zoomScaling() < 1 && this.isAnnotationOverlay) {
                deltaScale = 1 / this.zoomScaling();
            }
            if (deltaScale < 0) deltaScale = -deltaScale;
            let [x, y] = this.getTransform().transformPoint(e.clientX, e.clientY);
            let localTransform = this.getLocalTransform().inverse().scaleAbout(deltaScale, x, y);

            let safeScale = Math.abs(localTransform.Scale);
            this.props.Document.scale = Math.abs(safeScale);
            this.setPan(-localTransform.TranslateX / safeScale, -localTransform.TranslateY / safeScale);
            e.stopPropagation();
        }
    }

    @action
    setPan(panX: number, panY: number) {
        var scale = this.getLocalTransform().inverse().Scale;
        const newPanX = Math.min((1 - 1 / scale) * this.nativeWidth, Math.max(0, panX));
        const newPanY = Math.min((1 - 1 / scale) * this.nativeHeight, Math.max(0, panY));
        this.props.Document.panX = this.isAnnotationOverlay ? newPanX : panX;
        this.props.Document.panY = this.isAnnotationOverlay ? newPanY : panY;
    }

    @action
    onDrop = (e: React.DragEvent): void => {
        var pt = this.getTransform().transformPoint(e.pageX, e.pageY);
        super.onDrop(e, { x: pt[0], y: pt[1] });
    }

    onDragOver = (): void => {
    }

    bringToFront(doc: Doc) {
        const docs = (this.children || []);
        docs.slice().sort((doc1, doc2) => {
            if (doc1 === doc) return 1;
            if (doc2 === doc) return -1;
            return NumCast(doc1.zIndex) - NumCast(doc2.zIndex);
        }).forEach((doc, index) => doc.zIndex = index + 1);
        doc.zIndex = docs.length + 1;
        return doc;
    }

    focusDocument = (doc: Doc) => {
        this.setPan(
            Cast(doc.x, "number", 0) + Cast(doc.width, "number", 0) / 2,
            Cast(doc.y, "number", 0) + Cast(doc.height, "number", 0) / 2);
        this.props.focus(this.props.Document);
    }

    getDocumentViewProps(document: Doc): DocumentViewProps {
        return {
            Document: document,
            toggleMinimized: emptyFunction,
            addDocument: this.props.addDocument,
            removeDocument: this.props.removeDocument,
            moveDocument: this.props.moveDocument,
            ScreenToLocalTransform: this.getTransform,
            isTopMost: false,
            selectOnLoad: document.Id === this._selectOnLoaded,
            PanelWidth: () => Cast(document.width, "number", 0),//TODO Types These are inline functions
            PanelHeight: () => Cast(document.height, "number", 0),
            ContentScaling: returnOne,
            ContainingCollectionView: this.props.CollectionView,
            focus: this.focusDocument,
            parentActive: this.props.active,
            whenActiveChanged: this.props.active,
        };
    }

    @computed
    get views() {
        let curPage = FieldValue(this.Document.curPage, -1);
        let docviews = (this.children || []).filter(doc => doc).reduce((prev, doc) => {
            var page = Cast(doc.page, "number", -1);
            if (page === curPage || page === -1) {
                let minim = Cast(doc.isMinimized, "boolean");
                if (minim === undefined || !minim) {
                    prev.push(<CollectionFreeFormDocumentView key={doc[Id]} {...this.getDocumentViewProps(doc)} />);
                }
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

    private childViews = () => [...this.views, <CollectionFreeFormBackgroundView key="backgroundView" {...this.getDocumentViewProps(this.props.Document)} />];
    render() {
        const containerName = `collectionfreeformview${this.isAnnotationOverlay ? "-overlay" : "-container"}`;
        return (
            <div className={containerName} ref={this.createDropTarget} onWheel={this.onPointerWheel}
                style={{ borderRadius: "inherit" }}
                onPointerDown={this.onPointerDown} onPointerMove={this.onCursorMove} onDrop={this.onDrop.bind(this)} onDragOver={this.onDragOver} >
                {/* <svg viewBox="0 0 180 18" style={{ top: "50%", opacity: 0.05, position: "absolute" }}>
                    <text y="15" >
                        {this.props.Document.Title}
                    </text>
                </svg> */}
                <MarqueeView container={this} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments}
                    addDocument={this.addDocument} removeDocument={this.props.removeDocument} addLiveTextDocument={this.addLiveTextBox}
                    getContainerTransform={this.getContainerTransform} getTransform={this.getTransform}>
                    <CollectionFreeFormViewPannableContents centeringShiftX={this.centeringShiftX} centeringShiftY={this.centeringShiftY}
                        zoomScaling={this.zoomScaling} panX={this.panX} panY={this.panY}>
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
        let overlayLayout = Cast(this.props.Document.overlayLayout, "string", "");
        return !overlayLayout ? (null) :
            (<DocumentContentsView {...this.props} layoutKey={"overlayLayout"}
                isTopMost={this.props.isTopMost} isSelected={returnFalse} select={emptyFunction} />);
    }
    render() {
        return this.overlayView;
    }
}

@observer
class CollectionFreeFormBackgroundView extends React.Component<DocumentViewProps> {
    @computed get backgroundView() {
        let backgroundLayout = Cast(this.props.Document.backgroundLayout, "string", "");
        return !backgroundLayout ? (null) :
            (<DocumentContentsView {...this.props} layoutKey={"backgroundLayout"}
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
        return <div className="collectionfreeformview" style={{ borderRadius: "inherit", transform: `translate(${cenx}px, ${ceny}px) scale(${zoom}, ${zoom}) translate(${panx}px, ${pany}px)` }}>
            {this.props.children}
        </div>;
    }
}