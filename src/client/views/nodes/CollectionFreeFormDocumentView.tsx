import { action, computed, IReactionDisposer, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { createSchema, listSpec, makeInterface } from "../../../new_fields/Schema";
import { BoolCast, Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { OmitKeys, Utils } from "../../../Utils";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { UndoManager } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { DocComponent } from "../DocComponent";
import { DocumentView, DocumentViewProps, positionSchema } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
}

const schema = createSchema({
    zoomBasis: "number",
    zIndex: "number",
});

//TODO Types: The import order is wrong, so positionSchema is undefined
type FreeformDocument = makeInterface<[typeof schema, typeof positionSchema]>;
const FreeformDocument = makeInterface(schema, positionSchema);

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, FreeformDocument>(FreeformDocument) {
    private _mainCont = React.createRef<HTMLDivElement>();
    private _downX: number = 0;
    private _downY: number = 0;
    private _doubleTap = false;
    _bringToFrontDisposer?: IReactionDisposer;

    @computed get transform() {
        return `scale(${this.props.ContentScaling()}, ${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) scale(${this.zoom}, ${this.zoom}) `;
    }

    @computed get X() { return FieldValue(this.Document.x, 0); }
    @computed get Y() { return FieldValue(this.Document.y, 0); }
    @computed get zoom(): number { return 1 / FieldValue(this.Document.zoomBasis, 1); }
    @computed get nativeWidth(): number { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight(): number { return FieldValue(this.Document.nativeHeight, 0); }
    @computed get width(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : FieldValue(this.Document.width, 0); }
    @computed get height(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : FieldValue(this.Document.height, 0); }

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
    contentScaling = () => this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    toggleMinimized = async () => this.toggleIcon(await DocListCastAsync(this.props.Document.maximizedDocs));
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
                this.animateBetweenIcon(true, scrpt, [this.Document.x || 0, this.Document.y || 0],
                    this.Document.width || 0, this.Document.height || 0, values[2], values[3] ? true : false);
            }
        }, { fireImmediately: true });
    }

    componentWillUnmount() {
        if (this._bringToFrontDisposer) this._bringToFrontDisposer();
    }

    animateBetweenIcon(first: boolean, icon: number[], targ: number[], width: number, height: number, stime: number, maximizing: boolean) {

        setTimeout(() => {
            let now = Date.now();
            let progress = Math.min(1, (now - stime) / 200);
            let pval = maximizing ?
                [icon[0] + (targ[0] - icon[0]) * progress, icon[1] + (targ[1] - icon[1]) * progress] :
                [targ[0] + (icon[0] - targ[0]) * progress, targ[1] + (icon[1] - targ[1]) * progress];
            this.props.Document.width = maximizing ? 25 + (width - 25) * progress : width + (25 - width) * progress;
            this.props.Document.height = maximizing ? 25 + (height - 25) * progress : height + (25 - height) * progress;
            this.props.Document.x = pval[0];
            this.props.Document.y = pval[1];
            if (first) {
                this.props.Document.proto!.willMaximize = false;
            }
            if (now < stime + 200) {
                this.animateBetweenIcon(false, icon, targ, width, height, stime, maximizing);
            }
            else {
                if (!maximizing) {
                    this.props.Document.proto!.isMinimized = true;
                    this.props.Document.x = targ[0];
                    this.props.Document.y = targ[1];
                    this.props.Document.width = width;
                    this.props.Document.height = height;
                }
                this.props.Document.proto!.isIconAnimating = undefined;
            }
        },
            2);
    }
    @action
    public toggleIcon = async (maximizedDocs: Doc[] | undefined): Promise<void> => {
        SelectionManager.DeselectAll();
        let isMinimized: boolean | undefined;
        let minimizedDoc: Doc | undefined = this.props.Document;
        if (!maximizedDocs) {
            minimizedDoc = await Cast(this.props.Document.minimizedDoc, Doc);
            if (minimizedDoc) maximizedDocs = await DocListCastAsync(minimizedDoc.maximizedDocs);
        }
        if (minimizedDoc && maximizedDocs) {
            let minimizedTarget = minimizedDoc;
            if (!CollectionFreeFormDocumentView._undoBatch) {
                CollectionFreeFormDocumentView._undoBatch = UndoManager.StartBatch("iconAnimating");
            }
            maximizedDocs.map(d => Doc.GetProto(d)).map(maximizedDoc => {
                let iconAnimating = Cast(maximizedDoc.isIconAnimating, List);
                if (!iconAnimating || (Date.now() - iconAnimating[2] > 1000)) {
                    if (isMinimized === undefined) {
                        isMinimized = BoolCast(maximizedDoc.isMinimized, false);
                    }
                    let minx = NumCast(minimizedTarget.x, undefined) + NumCast(minimizedTarget.width, undefined) / 2;
                    let miny = NumCast(minimizedTarget.y, undefined) + NumCast(minimizedTarget.height, undefined) / 2;
                    if (minx !== undefined && miny !== undefined) {
                        let scrpt = this.props.ScreenToLocalTransform().inverse().transformPoint(minx, miny);
                        maximizedDoc.willMaximize = isMinimized;
                        maximizedDoc.isMinimized = false;
                        maximizedDoc.isIconAnimating = new List<number>([scrpt[0], scrpt[1], Date.now(), isMinimized ? 1 : 0]);
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
        this._doubleTap = false;
        if (e.button === 0 && e.altKey) {
            e.stopPropagation(); // prevents panning from happening on collection if shift is pressed after a document drag has started
        } // allow pointer down to go through otherwise so that marquees can be drawn starting over a document 

        if (e.button === 0) {
            e.preventDefault();  // prevents Firefox from dragging images (we want to do that ourself)
        }
    }
    onClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        let altKey = e.altKey;
        let ctrlKey = e.ctrlKey;
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            let isExpander = (e.target as any).id === "isExpander";
            if (BoolCast(this.props.Document.isButton, false) || isExpander) {
                SelectionManager.DeselectAll();
                let subBulletDocs = await DocListCastAsync(this.props.Document.subBulletDocs);
                let maximizedDocs = await DocListCastAsync(this.props.Document.maximizedDocs);
                let summarizedDocs = await DocListCastAsync(this.props.Document.summarizedDocs);
                let linkedToDocs = await DocListCastAsync(this.props.Document.linkedToDocs, []);
                let linkedFromDocs = await DocListCastAsync(this.props.Document.linkedFromDocs, []);
                let expandedDocs: Doc[] = [];
                expandedDocs = subBulletDocs ? [...subBulletDocs, ...expandedDocs] : expandedDocs;
                expandedDocs = maximizedDocs ? [...maximizedDocs, ...expandedDocs] : expandedDocs;
                expandedDocs = summarizedDocs ? [...summarizedDocs, ...expandedDocs] : expandedDocs;
                // let expandedDocs = [...(subBulletDocs ? subBulletDocs : []), ...(maximizedDocs ? maximizedDocs : []), ...(summarizedDocs ? summarizedDocs : []),];
                if (expandedDocs.length) {   // bcz: need a better way to associate behaviors with click events on widget-documents
                    let expandedProtoDocs = expandedDocs.map(doc => Doc.GetProto(doc));
                    let maxLocation = StrCast(this.props.Document.maximizeLocation, "inPlace");
                    let getDispDoc = (target: Doc) => Object.getOwnPropertyNames(target).indexOf("isPrototype") === -1 ? target : Doc.MakeDelegate(target);
                    if (altKey) {
                        maxLocation = this.props.Document.maximizeLocation = (maxLocation === "inPlace" || !maxLocation ? "inTab" : "inPlace");
                        if (!maxLocation || maxLocation === "inPlace") {
                            let hadView = expandedDocs.length === 1 && DocumentManager.Instance.getDocumentView(expandedProtoDocs[0], this.props.ContainingCollectionView);
                            let wasMinimized = !hadView && expandedDocs.reduce((min, d) => !min && !BoolCast(d.IsMinimized, false), false);
                            expandedDocs.forEach(maxDoc => Doc.GetProto(maxDoc).isMinimized = false);
                            let hasView = expandedDocs.length === 1 && DocumentManager.Instance.getDocumentView(expandedProtoDocs[0], this.props.ContainingCollectionView);
                            if (!hasView) {
                                this.props.addDocument && expandedDocs.forEach(async maxDoc => this.props.addDocument!(getDispDoc(maxDoc), false));
                            }
                            expandedProtoDocs.forEach(maxDoc => maxDoc.isMinimized = wasMinimized);
                        }
                    }
                    if (maxLocation && maxLocation !== "inPlace") {
                        let dataDocs = DocListCast(CollectionDockingView.Instance.props.Document.data);
                        if (dataDocs) {
                            expandedDocs.forEach(maxDoc =>
                                (!CollectionDockingView.Instance.CloseRightSplit(Doc.GetProto(maxDoc)) &&
                                    this.props.addDocTab(getDispDoc(maxDoc), maxLocation)));
                        }
                    } else {
                        this.toggleIcon(expandedProtoDocs);
                    }
                }
                else if (linkedToDocs.length || linkedFromDocs.length) {
                    let linkedFwdDocs = [
                        linkedToDocs.length ? linkedToDocs[0].linkedTo as Doc : linkedFromDocs.length ? linkedFromDocs[0].linkedFrom as Doc : expandedDocs[0],
                        linkedFromDocs.length ? linkedFromDocs[0].linkedFrom as Doc : linkedToDocs.length ? linkedToDocs[0].linkedTo as Doc : expandedDocs[0]];

                    let linkedFwdPage = [
                        linkedToDocs.length ? NumCast(linkedToDocs[0].linkedToPage, undefined) : linkedFromDocs.length ? NumCast(linkedFromDocs[0].linkedFromPage, undefined) : undefined,
                        linkedFromDocs.length ? NumCast(linkedFromDocs[0].linkedFromPage, undefined) : linkedToDocs.length ? NumCast(linkedToDocs[0].linkedToPage, undefined) : undefined];
                    if (!linkedFwdDocs.some(l => l instanceof Promise)) {
                        let maxLocation = StrCast(linkedFwdDocs[altKey ? 1 : 0].maximizeLocation, "inTab");
                        DocumentManager.Instance.jumpToDocument(linkedFwdDocs[altKey ? 1 : 0], ctrlKey, document => this.props.addDocTab(document, maxLocation), linkedFwdPage[altKey ? 1 : 0]);
                    }
                }
            }
        }
    }

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
        // let transform = this.getTransform().scale(this.contentScaling()).inverse();
        // var [sptX, sptY] = transform.transformPoint(0, 0);
        // let [bptX, bptY] = transform.transformPoint(this.props.PanelWidth(), this.props.PanelHeight());
        // let w = bptX - sptX;
        //zoomFade = area < 100 || area > 800 ? Math.max(0, Math.min(1, 2 - 5 * (zoom < this.scale ? this.scale / zoom : zoom / this.scale))) : 1;
        const screenWidth = Math.min(50 * NumCast(this.props.Document.nativeWidth, 0), 1800);
        let fadeUp = .75 * screenWidth;
        let fadeDown = (maximizedDoc ? .0075 : .075) * screenWidth;
        // zoomFade = w < fadeDown  /* || w > fadeUp */ ? Math.max(0.1, Math.min(1, 2 - (w < fadeDown ? Math.sqrt(Math.sqrt(fadeDown / w)) : w / fadeUp))) : 1;

        return (
            <div className="collectionFreeFormDocumentView-container" ref={this._mainCont}
                onPointerDown={this.onPointerDown}
                onClick={this.onClick}
                style={{
                    opacity: zoomFade,
                    borderRadius: `${this.borderRounding()}px`,
                    transformOrigin: "left top",
                    transform: this.transform,
                    pointerEvents: (zoomFade < 0.09 ? "none" : "all"),
                    width: this.width,
                    height: this.height,
                    position: "absolute",
                    zIndex: this.Document.zIndex || 0,
                    backgroundColor: "transparent"
                }} >
                {this.docView}
            </div>
        );
    }
}