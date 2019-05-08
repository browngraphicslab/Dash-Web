import { computed, trace, action, reaction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { Transform } from "../../util/Transform";
import { DocumentView, DocumentViewProps, positionSchema } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");
import { DocComponent } from "../DocComponent";
import { createSchema, makeInterface, listSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, NumCast, BoolCast } from "../../../new_fields/Types";
import { OmitKeys, Utils } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { Doc, DocListCast, HeightSym } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { undoBatch, UndoManager } from "../../util/UndoManager";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
}

const schema = createSchema({
    zoomBasis: "number",
    zIndex: "number"
});

//TODO Types: The import order is wrong, so positionSchema is undefined
type FreeformDocument = makeInterface<[typeof schema, typeof positionSchema]>;
const FreeformDocument = makeInterface(schema, positionSchema);

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, FreeformDocument>(FreeformDocument) {
    private _mainCont = React.createRef<HTMLDivElement>();
    private _downX: number = 0;
    private _downY: number = 0;
    _bringToFrontDisposer?: IReactionDisposer;

    @computed get transform() {
        return `scale(${this.props.ContentScaling()}, ${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) scale(${this.zoom}, ${this.zoom}) `;
    }

    @computed get X() { return FieldValue(this.Document.x, 0); }
    @computed get Y() { return FieldValue(this.Document.y, 0); }
    @computed get zoom(): number { return 1 / FieldValue(this.Document.zoomBasis, 1); }
    @computed get nativeWidth(): number { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight(): number { return FieldValue(this.Document.nativeHeight, 0); }
    @computed get width(): number { return FieldValue(this.Document.width, 0); }
    @computed get height(): number { return FieldValue(this.Document.height, 0); }
    @computed get zIndex(): number { return FieldValue(this.Document.zIndex, 0); }

    set width(w: number) {
        this.Document.width = w;
        if (this.nativeWidth && this.nativeHeight) {
            this.Document.height = this.nativeHeight / this.nativeWidth * w;
        }
    }
    set height(h: number) {
        this.Document.height = h;
        if (this.nativeWidth && this.nativeHeight) {
            this.Document.width = this.nativeWidth / this.nativeHeight * h;
        }
    }
    set zIndex(h: number) {
        this.Document.zIndex = h;
    }

    contentScaling = () => this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    toggleMinimized = () => this.toggleIcon();
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling()).scale(1 / this.zoom)

    @computed
    get docView() {
        return <DocumentView {...OmitKeys(this.props, ['zoomFade']).omit}
            toggleMinimized={this.toggleMinimized}
            ContentScaling={this.contentScaling}
            ScreenToLocalTransform={this.getTransform}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight}
        />;
    }

    componentDidMount() {
        this._bringToFrontDisposer = reaction(() => this.props.Document.isIconAnimating, (values) => {
            this.props.bringToFront(this.props.Document);
            if (values instanceof List) {
                let scrpt = this.props.ScreenToLocalTransform().transformPoint(values[0], values[1]);
                this.animateBetweenIcon(true, scrpt, [values[2], values[3]], values[4], values[5], values[6], this.props.Document, values[7] ? true : false);
            }
        }, { fireImmediately: true });
    }

    componentWillUnmount() {
        if (this._bringToFrontDisposer) this._bringToFrontDisposer();
    }

    animateBetweenIcon(first: boolean, icon: number[], targ: number[], width: number, height: number, stime: number, target: Doc, maximizing: boolean) {
        if (first) {
            if (maximizing) target.width = target.height = 1;
        }
        setTimeout(() => {
            let now = Date.now();
            let progress = Math.min(1, (now - stime) / 200);
            let pval = maximizing ?
                [icon[0] + (targ[0] - icon[0]) * progress, icon[1] + (targ[1] - icon[1]) * progress] :
                [targ[0] + (icon[0] - targ[0]) * progress, targ[1] + (icon[1] - targ[1]) * progress];
            target.width = maximizing ? 25 + (width - 25) * progress : width + (25 - width) * progress;
            target.height = maximizing ? 25 + (height - 25) * progress : height + (25 - height) * progress;
            target.x = pval[0];
            target.y = pval[1];
            if (now < stime + 200) {
                this.animateBetweenIcon(false, icon, targ, width, height, stime, target, maximizing);
            }
            else {
                if (!maximizing) {
                    target.isMinimized = true;
                    target.x = targ[0];
                    target.y = targ[1];
                    target.width = width;
                    target.height = height;
                }
                target.isIconAnimating = undefined;
            }
        },
            2);
    }
    @action
    public toggleIcon = async (): Promise<void> => {
        UndoManager.GetOpenBatches().forEach(batch => console.log(batch.batchName));
        SelectionManager.DeselectAll();
        let isMinimized: boolean | undefined;
        let maximizedDocs = await DocListCast(this.props.Document.maximizedDocs);
        let minimizedDoc: Doc | undefined = this.props.Document;
        if (!maximizedDocs) {
            minimizedDoc = await Cast(this.props.Document.minimizedDoc, Doc);
            if (minimizedDoc) maximizedDocs = await DocListCast(minimizedDoc.maximizedDocs);
        }
        if (minimizedDoc && maximizedDocs) {
            let minimizedTarget = minimizedDoc;
            CollectionFreeFormDocumentView._undoBatch = UndoManager.StartBatch("iconAnimating");
            maximizedDocs.forEach(maximizedDoc => {
                let iconAnimating = Cast(maximizedDoc.isIconAnimating, List);
                if (!iconAnimating || (Date.now() - iconAnimating[6] > 1000)) {
                    if (isMinimized === undefined) {
                        isMinimized = BoolCast(maximizedDoc.isMinimized, false);
                    }
                    let minx = NumCast(minimizedTarget.x, undefined) + NumCast(minimizedTarget.width, undefined) * this.getTransform().Scale * this.contentScaling() / 2;
                    let miny = NumCast(minimizedTarget.y, undefined) + NumCast(minimizedTarget.height, undefined) * this.getTransform().Scale * this.contentScaling() / 2;
                    let maxx = NumCast(maximizedDoc.x, undefined);
                    let maxy = NumCast(maximizedDoc.y, undefined);
                    let maxw = NumCast(maximizedDoc.width, undefined);
                    let maxh = NumCast(maximizedDoc.height, undefined);
                    if (minx !== undefined && miny !== undefined && maxx !== undefined && maxy !== undefined &&
                        maxw !== undefined && maxh !== undefined) {
                        let scrpt = this.props.ScreenToLocalTransform().inverse().transformPoint(minx, miny);
                        if (isMinimized) maximizedDoc.isMinimized = false;
                        maximizedDoc.isIconAnimating = new List<number>([scrpt[0], scrpt[1], maxx, maxy, maxw, maxh, Date.now(), isMinimized ? 1 : 0])
                    }
                }
            });
            setTimeout(() => {
                CollectionFreeFormDocumentView._undoBatch && CollectionFreeFormDocumentView._undoBatch.end();
                CollectionFreeFormDocumentView._undoBatch = undefined;
            }, 500);
        }
    }
    static _undoBatch?: UndoManager.Batch = undefined;
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        e.stopPropagation();
    }
    onClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        let altKey = e.altKey;
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            if (BoolCast(this.props.Document.isButton, false) || (e.target as any).id === "isBullet") {
                let maximizedDocs = await DocListCast(this.props.Document.maximizedDocs);
                if (maximizedDocs) {   // bcz: need a better way to associate behaviors with click events on widget-documents
                    if ((altKey && !this.props.Document.maximizeOnRight) || (!altKey && this.props.Document.maximizeOnRight)) {
                        let dataDocs = await DocListCast(CollectionDockingView.Instance.props.Document.data);
                        if (dataDocs) {
                            SelectionManager.DeselectAll();
                            maximizedDocs.forEach(maxDoc => {
                                if (!dataDocs || dataDocs.indexOf(maxDoc) == -1) {
                                    CollectionDockingView.Instance.AddRightSplit(maxDoc);
                                } else {
                                    CollectionDockingView.Instance.CloseRightSplit(maxDoc);
                                }
                            });
                        }
                    } else {
                        this.props.addDocument && maximizedDocs.forEach(async maxDoc => this.props.addDocument!(await maxDoc, false));
                        this.toggleIcon();
                    }
                }
            }
        }
    }

    onPointerEnter = (e: React.PointerEvent): void => { this.props.Document.libraryBrush = true; }
    onPointerLeave = (e: React.PointerEvent): void => { this.props.Document.libraryBrush = false; }

    borderRounding = () => {
        let br = NumCast(this.props.Document.borderRounding);
        return br >= 0 ? br :
            NumCast(this.props.Document.nativeWidth) === 0 ?
                Math.min(this.props.PanelWidth(), this.props.PanelHeight())
                : Math.min(this.Document.nativeWidth || 0, this.Document.nativeHeight || 0);
    }

    render() {
        let maximizedDoc = FieldValue(Cast(this.props.Document.maximizedDocs, listSpec(Doc)));
        let zoomFade = 1;
        //var zoom = doc.GetNumber(KeyStore.ZoomBasis, 1);
        let transform = this.getTransform().scale(this.contentScaling()).inverse();
        var [sptX, sptY] = transform.transformPoint(0, 0);
        let [bptX, bptY] = transform.transformPoint(this.props.PanelWidth(), this.props.PanelHeight());
        let w = bptX - sptX;
        //zoomFade = area < 100 || area > 800 ? Math.max(0, Math.min(1, 2 - 5 * (zoom < this.scale ? this.scale / zoom : zoom / this.scale))) : 1;
        const screenWidth = Math.min(50 * NumCast(this.props.Document.nativeWidth, 0), 1800);
        let fadeUp = .75 * screenWidth;
        let fadeDown = (maximizedDoc ? .0075 : .075) * screenWidth;
        zoomFade = w < fadeDown  /* || w > fadeUp */ ? Math.max(0.1, Math.min(1, 2 - (w < fadeDown ? fadeDown / w : w / fadeUp))) : 1;

        return (
            <div className="collectionFreeFormDocumentView-container" ref={this._mainCont}
                onPointerDown={this.onPointerDown}
                onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}
                onClick={this.onClick}
                style={{
                    outlineColor: "black",
                    outlineStyle: "dashed",
                    outlineWidth: BoolCast(this.props.Document.libraryBrush, false) ? `${0.5 / this.contentScaling()}px` : "0px",
                    opacity: zoomFade,
                    borderRadius: `${this.borderRounding()}px`,
                    transformOrigin: "left top",
                    transform: this.transform,
                    pointerEvents: (zoomFade < 0.09 ? "none" : "all"),
                    width: this.width,
                    height: this.height,
                    position: "absolute",
                    zIndex: this.zIndex,
                    backgroundColor: "transparent"
                }} >
                {this.docView}
            </div>
        );
    }
}