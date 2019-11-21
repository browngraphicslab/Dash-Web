import { library } from "@fortawesome/fontawesome-svg-core";
import { faEye } from "@fortawesome/free-regular-svg-icons";
import { faBraille, faChalkboard, faCompass, faCompressArrowsAlt, faExpandArrowsAlt, faFileUpload, faPaintBrush, faTable, faUpload } from "@fortawesome/free-solid-svg-icons";
import { action, computed, observable, trace, ObservableMap, untracked, reaction, runInAction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, Opt, WidthSym } from "../../../../new_fields/Doc";
import { documentSchema, positionSchema } from "../../../../new_fields/documentSchemas";
import { Id } from "../../../../new_fields/FieldSymbols";
import { InkTool } from "../../../../new_fields/InkField";
import { createSchema, makeInterface } from "../../../../new_fields/Schema";
import { ScriptField } from "../../../../new_fields/ScriptField";
import { BoolCast, Cast, DateCast, NumCast, StrCast } from "../../../../new_fields/Types";
import { CurrentUserUtils } from "../../../../server/authentication/models/current_user_utils";
import { aggregateBounds, emptyFunction, intersectRect, returnOne, Utils } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs } from "../../../documents/Documents";
import { DocumentType } from "../../../documents/DocumentTypes";
import { DocumentManager } from "../../../util/DocumentManager";
import { DragManager } from "../../../util/DragManager";
import { HistoryUtil } from "../../../util/History";
import { InteractionUtils } from "../../../util/InteractionUtils";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch, UndoManager } from "../../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from "../../../views/globalCssVariables.scss";
import { ContextMenu } from "../../ContextMenu";
import { ContextMenuProps } from "../../ContextMenuItem";
import { InkingControl } from "../../InkingControl";
import { CreatePolyline } from "../../InkingStroke";
import { CollectionFreeFormDocumentView } from "../../nodes/CollectionFreeFormDocumentView";
import { DocumentViewProps } from "../../nodes/DocumentView";
import { FormattedTextBox } from "../../nodes/FormattedTextBox";
import { pageSchema } from "../../nodes/ImageBox";
import PDFMenu from "../../pdf/PDFMenu";
import { CollectionSubView } from "../CollectionSubView";
import { computePivotLayout, ViewDefResult } from "./CollectionFreeFormLayoutEngines";
import { CollectionFreeFormRemoteCursors } from "./CollectionFreeFormRemoteCursors";
import "./CollectionFreeFormView.scss";
import MarqueeOptionsMenu from "./MarqueeOptionsMenu";
import { MarqueeView } from "./MarqueeView";
import React = require("react");
import { computedFn, keepAlive } from "mobx-utils";
import { TraceMobx } from "../../../../new_fields/util";

library.add(faEye as any, faTable, faPaintBrush, faExpandArrowsAlt, faCompressArrowsAlt, faCompass, faUpload, faBraille, faChalkboard, faFileUpload);

export const panZoomSchema = createSchema({
    panX: "number",
    panY: "number",
    scale: "number",
    arrangeScript: ScriptField,
    arrangeInit: ScriptField,
    useClusters: "boolean",
    isRuleProvider: "boolean",
    fitToBox: "boolean",
    panTransformType: "string",
    scrollHeight: "number",
    fitX: "number",
    fitY: "number",
    fitW: "number",
    fitH: "number"
});

type PanZoomDocument = makeInterface<[typeof panZoomSchema, typeof documentSchema, typeof positionSchema, typeof pageSchema]>;
const PanZoomDocument = makeInterface(panZoomSchema, documentSchema, positionSchema, pageSchema);

@observer
export class CollectionFreeFormView extends CollectionSubView(PanZoomDocument) {
    private _lastX: number = 0;
    private _lastY: number = 0;
    private _clusterDistance: number = 75;
    private _hitCluster = false;
    private _layoutComputeReaction: IReactionDisposer | undefined;
    private _layoutPoolData = new ObservableMap<string, any>();

    public get displayName() { return "CollectionFreeFormView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    @observable.shallow _layoutElements: ViewDefResult[] = []; // shallow because some layout items (eg pivot labels) are just generated 'divs' and can't be frozen as observables
    @observable _clusterSets: (Doc[])[] = [];

    @computed get fitToContent() { return (this.props.fitToBox || this.Document.fitToBox) && !this.isAnnotationOverlay; }
    @computed get parentScaling() { return this.props.ContentScaling && this.fitToContent && !this.isAnnotationOverlay ? this.props.ContentScaling() : 1; }
    @computed get contentBounds() { return aggregateBounds(this._layoutElements.filter(e => e.bounds && !e.bounds.z).map(e => e.bounds!)); }
    @computed get nativeWidth() { return this.Document.fitToContent ? 0 : this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.fitToContent ? 0 : this.Document.nativeHeight || 0; }
    private get isAnnotationOverlay() { return this.props.isAnnotationOverlay; }
    private get borderWidth() { return this.isAnnotationOverlay ? 0 : COLLECTION_BORDER_WIDTH; }
    private easing = () => this.props.Document.panTransformType === "Ease";
    private panX = () => this.fitToContent ? (this.contentBounds.x + this.contentBounds.r) / 2 : this.Document.panX || 0;
    private panY = () => this.fitToContent ? (this.contentBounds.y + this.contentBounds.b) / 2 : this.Document.panY || 0;
    private zoomScaling = () => (1 / this.parentScaling) * (this.fitToContent ?
        Math.min(this.props.PanelHeight() / (this.contentBounds.b - this.contentBounds.y), this.props.PanelWidth() / (this.contentBounds.r - this.contentBounds.x)) :
        this.Document.scale || 1)
    private centeringShiftX = () => !this.nativeWidth && !this.isAnnotationOverlay ? this.props.PanelWidth() / 2 / this.parentScaling : 0;  // shift so pan position is at center of window for non-overlay collections
    private centeringShiftY = () => !this.nativeHeight && !this.isAnnotationOverlay ? this.props.PanelHeight() / 2 / this.parentScaling : 0;// shift so pan position is at center of window for non-overlay collections
    private getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth + 1, -this.borderWidth + 1).translate(-this.centeringShiftX(), -this.centeringShiftY()).transform(this.getLocalTransform());
    private getTransformOverlay = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth + 1, -this.borderWidth + 1);
    private getContainerTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth, -this.borderWidth);
    private getLocalTransform = (): Transform => Transform.Identity().scale(1 / this.zoomScaling()).translate(this.panX(), this.panY());
    private addLiveTextBox = (newBox: Doc) => {
        FormattedTextBox.SelectOnLoad = newBox[Id];// track the new text box so we can give it a prop that tells it to focus itself when it's displayed
        let maxHeading = this.childDocs.reduce((maxHeading, doc) => NumCast(doc.heading) > maxHeading ? NumCast(doc.heading) : maxHeading, 0);
        let heading = maxHeading === 0 || this.childDocs.length === 0 ? 1 : maxHeading === 1 ? 2 : 0;
        if (heading === 0) {
            let sorted = this.childDocs.filter(d => d.type === DocumentType.TEXT && d.data_ext instanceof Doc && d.data_ext.lastModified).sort((a, b) => DateCast((Cast(a.data_ext, Doc) as Doc).lastModified).date > DateCast((Cast(b.data_ext, Doc) as Doc).lastModified).date ? 1 :
                DateCast((Cast(a.data_ext, Doc) as Doc).lastModified).date < DateCast((Cast(b.data_ext, Doc) as Doc).lastModified).date ? -1 : 0);
            heading = !sorted.length ? Math.max(1, maxHeading) : NumCast(sorted[sorted.length - 1].heading) === 1 ? 2 : NumCast(sorted[sorted.length - 1].heading);
        }
        !this.Document.isRuleProvider && (newBox.heading = heading);
        this.addDocument(newBox);
    }
    private addDocument = (newBox: Doc) => {
        let added = this.props.addDocument(newBox);
        added && this.bringToFront(newBox);
        added && this.updateCluster(newBox);
        return added;
    }
    private selectDocuments = (docs: Doc[]) => {
        SelectionManager.DeselectAll();
        docs.map(doc => DocumentManager.Instance.getDocumentView(doc)).map(dv => dv && SelectionManager.SelectDoc(dv, true));
    }
    public isCurrent(doc: Doc) { return !doc.isMinimized && (Math.abs(NumCast(doc.displayTimecode, -1) - NumCast(this.Document.currentTimecode, -1)) < 1.5 || NumCast(doc.displayTimecode, -1) === -1); }

    public getActiveDocuments = () => {
        return this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map(pair => pair.layout);
    }

    @action
    onDrop = (e: React.DragEvent): Promise<void> => {
        var pt = this.getTransform().transformPoint(e.pageX, e.pageY);
        return super.onDrop(e, { x: pt[0], y: pt[1] });
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        let xf = this.getTransform();
        let xfo = this.getTransformOverlay();
        let [xp, yp] = xf.transformPoint(de.x, de.y);
        let [xpo, ypo] = xfo.transformPoint(de.x, de.y);
        if (super.drop(e, de)) {
            if (de.data instanceof DragManager.DocumentDragData) {
                if (de.data.droppedDocuments.length) {
                    let firstDoc = de.data.droppedDocuments[0];
                    let z = NumCast(firstDoc.z);
                    let x = (z ? xpo : xp) - de.data.offset[0];
                    let y = (z ? ypo : yp) - de.data.offset[1];
                    let dropX = NumCast(firstDoc.x);
                    let dropY = NumCast(firstDoc.y);
                    de.data.droppedDocuments.forEach(action((d: Doc) => {
                        let layoutDoc = Doc.Layout(d);
                        d.x = x + NumCast(d.x) - dropX;
                        d.y = y + NumCast(d.y) - dropY;
                        if (!NumCast(layoutDoc.width)) {
                            layoutDoc.width = 300;
                        }
                        if (!NumCast(layoutDoc.height)) {
                            let nw = NumCast(layoutDoc.nativeWidth);
                            let nh = NumCast(layoutDoc.nativeHeight);
                            layoutDoc.height = nw && nh ? nh / nw * NumCast(layoutDoc.width) : 300;
                        }
                        this.bringToFront(d);
                    }));

                    de.data.droppedDocuments.length === 1 && this.updateCluster(de.data.droppedDocuments[0]);
                }
            }
            else if (de.data instanceof DragManager.AnnotationDragData) {
                if (de.data.dropDocument) {
                    let dragDoc = de.data.dropDocument;
                    let x = xp - de.data.offset[0];
                    let y = yp - de.data.offset[1];
                    let dropX = NumCast(dragDoc.x);
                    let dropY = NumCast(dragDoc.y);
                    dragDoc.x = x + NumCast(dragDoc.x) - dropX;
                    dragDoc.y = y + NumCast(dragDoc.y) - dropY;
                    de.data.targetContext = this.props.Document; // dropped a PDF annotation, so we need to set the targetContext on the dragData which the PDF view uses at the end of the drop operation
                    this.bringToFront(dragDoc);
                }
            }
        }
        return false;
    }

    pickCluster(probe: number[]) {
        return this.childLayoutPairs.map(pair => pair.layout).reduce((cluster, cd) => {
            let layoutDoc = Doc.Layout(cd);
            let cx = NumCast(cd.x) - this._clusterDistance;
            let cy = NumCast(cd.y) - this._clusterDistance;
            let cw = NumCast(layoutDoc.width) + 2 * this._clusterDistance;
            let ch = NumCast(layoutDoc.height) + 2 * this._clusterDistance;
            return !layoutDoc.z && intersectRect({ left: cx, top: cy, width: cw, height: ch }, { left: probe[0], top: probe[1], width: 1, height: 1 }) ?
                NumCast(cd.cluster) : cluster;
        }, -1);
    }
    tryDragCluster(e: PointerEvent | TouchEvent) {
        let ptsParent = e instanceof PointerEvent ? e : e.targetTouches.item(0);
        if (ptsParent) {
            let cluster = this.pickCluster(this.getTransform().transformPoint(ptsParent.clientX, ptsParent.clientY));
            if (cluster !== -1) {
                let eles = this.childLayoutPairs.map(pair => pair.layout).filter(cd => NumCast(cd.cluster) === cluster);
                let clusterDocs = eles.map(ele => DocumentManager.Instance.getDocumentView(ele, this.props.CollectionView)!);
                let de = new DragManager.DocumentDragData(eles);
                de.moveDocument = this.props.moveDocument;
                const [left, top] = clusterDocs[0].props.ScreenToLocalTransform().scale(clusterDocs[0].props.ContentScaling()).inverse().transformPoint(0, 0);
                de.offset = this.getTransform().transformDirection(ptsParent.clientX - left, ptsParent.clientY - top);
                de.dropAction = e.ctrlKey || e.altKey ? "alias" : undefined;
                DragManager.StartDocumentDrag(clusterDocs.map(v => v.ContentDiv!), de, ptsParent.clientX, ptsParent.clientY, {
                    handlers: { dragComplete: action(emptyFunction) },
                    hideSource: !de.dropAction
                });
                return true;
            }
        }

        return false;
    }

    @undoBatch
    updateClusters(useClusters: boolean) {
        this.props.Document.useClusters = useClusters;
        this._clusterSets.length = 0;
        this.childLayoutPairs.map(pair => pair.layout).map(c => this.updateCluster(c));
    }

    @undoBatch
    @action
    updateCluster(doc: Doc) {
        let childLayouts = this.childLayoutPairs.map(pair => pair.layout);
        if (this.props.Document.useClusters) {
            this._clusterSets.map(set => Doc.IndexOf(doc, set) !== -1 && set.splice(Doc.IndexOf(doc, set), 1));
            let preferredInd = NumCast(doc.cluster);
            doc.cluster = -1;
            this._clusterSets.map((set, i) => set.map(member => {
                if (doc.cluster === -1 && Doc.IndexOf(member, childLayouts) !== -1 && Doc.overlapping(doc, member, this._clusterDistance)) {
                    doc.cluster = i;
                }
            }));
            if (doc.cluster === -1 && preferredInd !== -1 && (!this._clusterSets[preferredInd] || !this._clusterSets[preferredInd].filter(member => Doc.IndexOf(member, childLayouts) !== -1).length)) {
                doc.cluster = preferredInd;
            }
            this._clusterSets.map((set, i) => {
                if (doc.cluster === -1 && !set.filter(member => Doc.IndexOf(member, childLayouts) !== -1).length) {
                    doc.cluster = i;
                }
            });
            if (doc.cluster === -1) {
                doc.cluster = this._clusterSets.length;
                this._clusterSets.push([doc]);
            } else {
                for (let i = this._clusterSets.length; i <= doc.cluster; i++) !this._clusterSets[i] && this._clusterSets.push([]);
                this._clusterSets[doc.cluster].push(doc);
            }
        }
    }

    getClusterColor = (doc: Doc) => {
        let clusterColor = "";
        let cluster = NumCast(doc.cluster);
        if (this.Document.useClusters) {
            if (this._clusterSets.length <= cluster) {
                setTimeout(() => this.updateCluster(doc), 0);
            } else {
                // choose a cluster color from a palette
                let colors = ["#da42429e", "#31ea318c", "#8c4000", "#4a7ae2c4", "#d809ff", "#ff7601", "#1dffff", "yellow", "#1b8231f2", "#000000ad"];
                clusterColor = colors[cluster % colors.length];
                let set = this._clusterSets[cluster] && this._clusterSets[cluster].filter(s => s.backgroundColor && (s.backgroundColor !== s.defaultBackgroundColor));
                // override the cluster color with an explicitly set color on a non-background document.  then override that with an explicitly set color on a background document
                set && set.filter(s => !s.isBackground).map(s => clusterColor = StrCast(s.backgroundColor));
                set && set.filter(s => s.isBackground).map(s => clusterColor = StrCast(s.backgroundColor));
            }
        }
        return clusterColor;
    }

    @observable private _points: { x: number, y: number }[] = [];

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.nativeEvent.cancelBubble) return;
        this._hitCluster = this.props.Document.useClusters ? this.pickCluster(this.getTransform().transformPoint(e.clientX, e.clientY)) !== -1 : false;
        if (e.button === 0 && !e.shiftKey && !e.altKey && !e.ctrlKey && this.props.active(true)) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);
            if (InkingControl.Instance.selectedTool === InkTool.None) {
                this._lastX = e.pageX;
                this._lastY = e.pageY;
            }
            else {
                e.stopPropagation();
                e.preventDefault();

                if (InkingControl.Instance.selectedTool !== InkTool.Eraser && InkingControl.Instance.selectedTool !== InkTool.Scrubber) {
                    let point = this.getTransform().transformPoint(e.pageX, e.pageY);
                    this._points.push({ x: point[0], y: point[1] });
                }
            }
        }
    }

    @action
    handle1PointerDown = (e: React.TouchEvent) => {
        let pt = e.targetTouches.item(0);
        if (pt) {
            this._hitCluster = this.props.Document.useCluster ? this.pickCluster(this.getTransform().transformPoint(pt.clientX, pt.clientY)) !== -1 : false;
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (InteractionUtils.IsType(e, InteractionUtils.TOUCH) && this._points.length <= 1) return;

        if (this._points.length > 1) {
            let B = this.svgBounds;
            let points = this._points.map(p => ({ x: p.x - B.left, y: p.y - B.top }));
            let inkDoc = Docs.Create.InkDocument(InkingControl.Instance.selectedColor, InkingControl.Instance.selectedTool, parseInt(InkingControl.Instance.selectedWidth), points, { width: B.width, height: B.height, x: B.left, y: B.top });
            this.addDocument(inkDoc);
            this._points = [];
        }

        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.removeEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchend", this.onTouchEnd);
    }

    @action
    pan = (e: PointerEvent | React.Touch | { clientX: number, clientY: number }): void => {
        // I think it makes sense for the marquee menu to go away when panned. -syip2
        MarqueeOptionsMenu.Instance.fadeOut(true);

        let x = this.Document.panX || 0;
        let y = this.Document.panY || 0;
        let docs = this.childLayoutPairs.map(pair => pair.layout);
        let [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
        if (!this.isAnnotationOverlay) {
            PDFMenu.Instance.fadeOut(true);
            let minx = docs.length ? NumCast(docs[0].x) : 0;
            let maxx = docs.length ? NumCast(docs[0].width) + minx : minx;
            let miny = docs.length ? NumCast(docs[0].y) : 0;
            let maxy = docs.length ? NumCast(docs[0].height) + miny : miny;
            let ranges = docs.filter(doc => doc).reduce((range, doc) => {
                let layoutDoc = Doc.Layout(doc);
                let x = NumCast(doc.x);
                let xe = x + NumCast(layoutDoc.width);
                let y = NumCast(doc.y);
                let ye = y + NumCast(layoutDoc.height);
                return [[range[0][0] > x ? x : range[0][0], range[0][1] < xe ? xe : range[0][1]],
                [range[1][0] > y ? y : range[1][0], range[1][1] < ye ? ye : range[1][1]]];
            }, [[minx, maxx], [miny, maxy]]);

            let cscale = this.props.ContainingCollectionDoc ? NumCast(this.props.ContainingCollectionDoc.scale) : 1;
            let panelDim = this.props.ScreenToLocalTransform().transformDirection(this.props.PanelWidth() / this.zoomScaling() * cscale,
                this.props.PanelHeight() / this.zoomScaling() * cscale);
            if (ranges[0][0] - dx > (this.panX() + panelDim[0] / 2)) x = ranges[0][1] + panelDim[0] / 2;
            if (ranges[0][1] - dx < (this.panX() - panelDim[0] / 2)) x = ranges[0][0] - panelDim[0] / 2;
            if (ranges[1][0] - dy > (this.panY() + panelDim[1] / 2)) y = ranges[1][1] + panelDim[1] / 2;
            if (ranges[1][1] - dy < (this.panY() - panelDim[1] / 2)) y = ranges[1][0] - panelDim[1] / 2;
        }
        this.setPan(x - dx, y - dy);
        this._lastX = e.clientX;
        this._lastY = e.clientY;
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (InteractionUtils.IsType(e, InteractionUtils.TOUCH)) {
            if (this.props.active(true)) {
                e.stopPropagation();
            }
            return;
        }
        if (!e.cancelBubble) {
            if (InkingControl.Instance.selectedTool === InkTool.None) {
                if (this._hitCluster && this.tryDragCluster(e)) {
                    e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
                    e.preventDefault();
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                    return;
                }
                this.pan(e);
            }
            else if (InkingControl.Instance.selectedTool !== InkTool.Eraser && InkingControl.Instance.selectedTool !== InkTool.Scrubber) {
                let point = this.getTransform().transformPoint(e.clientX, e.clientY);
                this._points.push({ x: point[0], y: point[1] });
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }

    handle1PointerMove = (e: TouchEvent) => {
        // panning a workspace
        if (!e.cancelBubble) {
            let pt = e.targetTouches.item(0);
            if (pt) {
                if (InkingControl.Instance.selectedTool === InkTool.None) {
                    if (this._hitCluster && this.tryDragCluster(e)) {
                        e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
                        e.preventDefault();
                        document.removeEventListener("pointermove", this.onPointerMove);
                        document.removeEventListener("pointerup", this.onPointerUp);
                        return;
                    }
                    this.pan(pt);
                }
                else if (InkingControl.Instance.selectedTool !== InkTool.Eraser && InkingControl.Instance.selectedTool !== InkTool.Scrubber) {
                    let point = this.getTransform().transformPoint(pt.clientX, pt.clientY);
                    this._points.push({ x: point[0], y: point[1] });
                }
            }
            e.stopPropagation();
            e.preventDefault();
        }
    }

    handle2PointersMove = (e: TouchEvent) => {
        // pinch zooming
        if (!e.cancelBubble) {
            let pt1: Touch | null = e.targetTouches.item(0);
            let pt2: Touch | null = e.targetTouches.item(1);
            if (!pt1 || !pt2) return;

            if (this.prevPoints.size === 2) {
                let oldPoint1 = this.prevPoints.get(pt1.identifier);
                let oldPoint2 = this.prevPoints.get(pt2.identifier);
                if (oldPoint1 && oldPoint2) {
                    let dir = InteractionUtils.Pinching(pt1, pt2, oldPoint1, oldPoint2);

                    // if zooming, zoom
                    if (dir !== 0) {
                        let d1 = Math.sqrt(Math.pow(pt1.clientX - oldPoint1.clientX, 2) + Math.pow(pt1.clientY - oldPoint1.clientY, 2));
                        let d2 = Math.sqrt(Math.pow(pt2.clientX - oldPoint2.clientX, 2) + Math.pow(pt2.clientY - oldPoint2.clientY, 2));
                        let centerX = Math.min(pt1.clientX, pt2.clientX) + Math.abs(pt2.clientX - pt1.clientX) / 2;
                        let centerY = Math.min(pt1.clientY, pt2.clientY) + Math.abs(pt2.clientY - pt1.clientY) / 2;

                        // calculate the raw delta value
                        let rawDelta = (dir * (d1 + d2));

                        // this floors and ceils the delta value to prevent jitteriness
                        let delta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), 16);
                        this.zoom(centerX, centerY, delta);
                        this.prevPoints.set(pt1.identifier, pt1);
                        this.prevPoints.set(pt2.identifier, pt2);
                    }
                    // this is not zooming. derive some form of panning from it.
                    else {
                        // use the centerx and centery as the "new mouse position"
                        let centerX = Math.min(pt1.clientX, pt2.clientX) + Math.abs(pt2.clientX - pt1.clientX) / 2;
                        let centerY = Math.min(pt1.clientY, pt2.clientY) + Math.abs(pt2.clientY - pt1.clientY) / 2;
                        this.pan({ clientX: centerX, clientY: centerY });
                        this._lastX = centerX;
                        this._lastY = centerY;
                    }
                }
            }
        }
        e.stopPropagation();
        e.preventDefault();
    }

    handle2PointersDown = (e: React.TouchEvent) => {
        let pt1: React.Touch | null = e.targetTouches.item(0);
        let pt2: React.Touch | null = e.targetTouches.item(1);
        if (!pt1 || !pt2) return;

        let centerX = Math.min(pt1.clientX, pt2.clientX) + Math.abs(pt2.clientX - pt1.clientX) / 2;
        let centerY = Math.min(pt1.clientY, pt2.clientY) + Math.abs(pt2.clientY - pt1.clientY) / 2;
        this._lastX = centerX;
        this._lastY = centerY;
    }

    cleanUpInteractions = () => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.removeEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchend", this.onTouchEnd);
    }

    @action
    zoom = (pointX: number, pointY: number, deltaY: number): void => {
        let deltaScale = deltaY > 0 ? (1 / 1.1) : 1.1;
        if (deltaScale * this.zoomScaling() < 1 && this.isAnnotationOverlay) {
            deltaScale = 1 / this.zoomScaling();
        }
        if (deltaScale < 0) deltaScale = -deltaScale;
        let [x, y] = this.getTransform().transformPoint(pointX, pointY);
        let localTransform = this.getLocalTransform().inverse().scaleAbout(deltaScale, x, y);

        if (localTransform.Scale >= 0.15) {
            let safeScale = Math.min(Math.max(0.15, localTransform.Scale), 40);
            this.props.Document.scale = Math.abs(safeScale);
            this.setPan(-localTransform.TranslateX / safeScale, -localTransform.TranslateY / safeScale);
        }
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        if (this.props.Document.lockedTransform || this.props.Document.inOverlay) return;
        if (!e.ctrlKey && this.props.Document.scrollHeight !== undefined) { // things that can scroll vertically should do that instead of zooming
            e.stopPropagation();
        }
        else if (this.props.active(true)) {
            e.stopPropagation();
            this.zoom(e.clientX, e.clientY, e.deltaY);
        }
    }

    @action
    setPan(panX: number, panY: number, panType: string = "None") {
        if (!this.Document.lockedTransform || this.Document.inOverlay) {
            this.Document.panTransformType = panType;
            var scale = this.getLocalTransform().inverse().Scale;
            const newPanX = Math.min((1 - 1 / scale) * this.nativeWidth, Math.max(0, panX));
            const newPanY = Math.min((this.props.Document.scrollHeight !== undefined ? NumCast(this.Document.scrollHeight) : (1 - 1 / scale) * this.nativeHeight), Math.max(0, panY));
            this.Document.panX = this.isAnnotationOverlay ? newPanX : panX;
            this.Document.panY = this.isAnnotationOverlay ? newPanY : panY;
        }
    }

    bringToFront = (doc: Doc, sendToBack?: boolean) => {
        if (sendToBack || doc.isBackground) {
            doc.zIndex = 0;
        }
        else {
            const docs = this.childLayoutPairs.map(pair => pair.layout);
            docs.slice().sort((doc1, doc2) => {
                if (doc1 === doc) return 1;
                if (doc2 === doc) return -1;
                return NumCast(doc1.zIndex) - NumCast(doc2.zIndex);
            }).forEach((doc, index) => doc.zIndex = index + 1);
            doc.zIndex = docs.length + 1;
        }
    }

    focusDocument = (doc: Doc, willZoom: boolean, scale?: number, afterFocus?: () => boolean) => {
        const state = HistoryUtil.getState();
        // TODO This technically isn't correct if type !== "doc", as 
        // currently nothing is done, but we should probably push a new state
        if (state.type === "doc" && this.Document.panX !== undefined && this.Document.panY !== undefined) {
            const init = state.initializers![this.Document[Id]];
            if (!init) {
                state.initializers![this.Document[Id]] = { panX: this.Document.panX, panY: this.Document.panY };
                HistoryUtil.pushState(state);
            } else if (init.panX !== this.Document.panX || init.panY !== this.Document.panY) {
                init.panX = this.Document.panX;
                init.panY = this.Document.panY;
                HistoryUtil.pushState(state);
            }
        }
        SelectionManager.DeselectAll();
        if (this.props.Document.scrollHeight) {
            let annotOn = Cast(doc.annotationOn, Doc) as Doc;
            if (!annotOn) {
                this.props.focus(doc);
            } else {
                let contextHgt = Doc.AreProtosEqual(annotOn, this.props.Document) && this.props.VisibleHeight ? this.props.VisibleHeight() : NumCast(annotOn.height);
                let offset = annotOn && (contextHgt / 2 * 96 / 72);
                this.props.Document.scrollY = NumCast(doc.y) - offset;
            }
        } else {
            let layoutdoc = Doc.Layout(doc);
            const newPanX = NumCast(doc.x) + NumCast(layoutdoc.width) / 2;
            const newPanY = NumCast(doc.y) + NumCast(layoutdoc.height) / 2;
            const newState = HistoryUtil.getState();
            newState.initializers![this.Document[Id]] = { panX: newPanX, panY: newPanY };
            HistoryUtil.pushState(newState);

            let savedState = { px: this.Document.panX, py: this.Document.panY, s: this.Document.scale, pt: this.Document.panTransformType };

            this.setPan(newPanX, newPanY, "Ease");
            Doc.BrushDoc(this.props.Document);
            this.props.focus(this.props.Document);
            willZoom && this.setScaleToZoom(layoutdoc, scale);

            afterFocus && setTimeout(() => {
                if (afterFocus && afterFocus()) {
                    this.Document.panX = savedState.px;
                    this.Document.panY = savedState.py;
                    this.Document.scale = savedState.s;
                    this.Document.panTransformType = savedState.pt;
                }
            }, 1000);
        }

    }

    setScaleToZoom = (doc: Doc, scale: number = 0.5) => {
        this.Document.scale = scale * Math.min(this.props.PanelWidth() / NumCast(doc.width), this.props.PanelHeight() / NumCast(doc.height));
    }

    zoomToScale = (scale: number) => {
        this.Document.scale = scale;
    }

    getScale = () => this.Document.scale || 1;

    getChildDocumentViewProps(childLayout: Doc, childData?: Doc): DocumentViewProps {
        return {
            ...this.props,
            DataDoc: childData,
            Document: childLayout,
            layoutKey: undefined,
            ruleProvider: this.Document.isRuleProvider && childLayout.type !== DocumentType.TEXT ? this.props.Document : this.props.ruleProvider, //bcz: hack! - currently ruleProviders apply to documents in nested colleciton, not direct children of themselves
            onClick: undefined, // this.props.onClick,  // bcz: check this out -- I don't think we want to inherit click handlers, or we at least need a way to ignore them
            ScreenToLocalTransform: childLayout.z ? this.getTransformOverlay : this.getTransform,
            renderDepth: this.props.renderDepth + 1,
            PanelWidth: childLayout[WidthSym],
            PanelHeight: childLayout[HeightSym],
            ContentScaling: returnOne,
            ContainingCollectionView: this.props.CollectionView,
            ContainingCollectionDoc: this.props.Document,
            focus: this.focusDocument,
            backgroundColor: this.getClusterColor,
            parentActive: this.props.active,
            bringToFront: this.bringToFront,
            zoomToScale: this.zoomToScale,
            getScale: this.getScale
        };
    }

    getCalculatedPositions(params: { doc: Doc, index: number, collection: Doc, docs: Doc[], state: any }): { x?: number, y?: number, z?: number, width?: number, height?: number, transition?: string, state?: any } {
        const result = this.Document.arrangeScript?.script.run(params, console.log);
        if (result?.success) {
            return { ...result, transition: "transform 1s" };
        }
        const layoutDoc = Doc.Layout(params.doc);
        return { x: Cast(params.doc.x, "number"), y: Cast(params.doc.y, "number"), z: Cast(params.doc.z, "number"), width: Cast(layoutDoc.width, "number"), height: Cast(layoutDoc.height, "number") };
    }

    viewDefsToJSX = (views: any[]) => {
        return !Array.isArray(views) ? [] : views.filter(ele => this.viewDefToJSX(ele)).map(ele => this.viewDefToJSX(ele)!);
    }

    private viewDefToJSX(viewDef: any): Opt<ViewDefResult> {
        if (viewDef.type === "text") {
            const text = Cast(viewDef.text, "string"); // don't use NumCast, StrCast, etc since we want to test for undefined below
            const x = Cast(viewDef.x, "number");
            const y = Cast(viewDef.y, "number");
            const z = Cast(viewDef.z, "number");
            const width = Cast(viewDef.width, "number");
            const height = Cast(viewDef.height, "number");
            const fontSize = Cast(viewDef.fontSize, "number");
            return [text, x, y, width, height].some(val => val === undefined) ? undefined :
                {
                    ele: <div className="collectionFreeform-customText" style={{ width, height, fontSize, transform: `translate(${x}px, ${y}px)` }}>
                        {text}
                    </div>,
                    bounds: { x: x!, y: y!, z: z, width: width!, height: height! }
                };
        }
    }

    childDataProvider = computedFn(function childDataProvider(doc: Doc) { return (this as any)._layoutPoolData.get(doc[Id]); }.bind(this));

    doPivotLayout(poolData: ObservableMap<string, any>) {
        return computePivotLayout(poolData, this.props.Document, this.childDocs,
            this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)), this.viewDefsToJSX);
    }

    doFreeformLayout(poolData: ObservableMap<string, any>) {
        let layoutDocs = this.childLayoutPairs.map(pair => pair.layout);
        const initResult = this.Document.arrangeInit && this.Document.arrangeInit.script.run({ docs: layoutDocs, collection: this.Document }, console.log);
        let state = initResult && initResult.success ? initResult.result.scriptState : undefined;
        let elements = initResult && initResult.success ? this.viewDefsToJSX(initResult.result.views) : [];

        this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map((pair, i) => {
            const data = poolData.get(pair.layout[Id]);
            const pos = this.getCalculatedPositions({ doc: pair.layout, index: i, collection: this.Document, docs: layoutDocs, state });
            state = pos.state === undefined ? state : pos.state;
            if (!data || pos.x !== data.x || pos.y !== data.y || pos.z !== data.z || pos.width !== data.width || pos.height !== data.height || pos.transition !== data.transition) {
                runInAction(() => poolData.set(pair.layout[Id], pos));
            }
        });
        return { elements: elements };
    }

    get doLayoutComputation() {
        let computedElementData: { elements: ViewDefResult[] };
        switch (this.Document.freeformLayoutEngine) {
            case "pivot": computedElementData = this.doPivotLayout(this._layoutPoolData); break;
            default: computedElementData = this.doFreeformLayout(this._layoutPoolData); break;
        }
        this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).forEach(pair =>
            computedElementData.elements.push({
                ele: <CollectionFreeFormDocumentView key={pair.layout[Id]} dataProvider={this.childDataProvider}
                    ruleProvider={this.Document.isRuleProvider ? this.props.Document : this.props.ruleProvider}
                    jitterRotation={NumCast(this.props.Document.jitterRotation)} {...this.getChildDocumentViewProps(pair.layout, pair.data)} />,
                bounds: this.childDataProvider(pair.layout)
            }));

        return computedElementData;
    }

    componentDidMount() {
        this._layoutComputeReaction = reaction(() => { TraceMobx(); return this.doLayoutComputation },
            action((computation: { elements: ViewDefResult[] }) => computation && (this._layoutElements = computation.elements)),
            { fireImmediately: true, name: "doLayout" });
    }
    componentWillUnmount() {
        this._layoutComputeReaction && this._layoutComputeReaction();
    }
    @computed get views() { return this._layoutElements.filter(ele => ele.bounds && !ele.bounds.z).map(ele => ele.ele); }
    elementFunc = () => this._layoutElements;

    @action
    onCursorMove = (e: React.PointerEvent) => {
        super.setCursorPosition(this.getTransform().transformPoint(e.clientX, e.clientY));
    }

    layoutDocsInGrid = () => {
        UndoManager.RunInBatch(() => {
            const docs = DocListCast(this.Document[this.props.fieldKey]);
            let startX = this.Document.panX || 0;
            let x = startX;
            let y = this.Document.panY || 0;
            let i = 0;
            const width = Math.max(...docs.map(doc => NumCast(doc.width)));
            const height = Math.max(...docs.map(doc => NumCast(doc.height)));
            for (const doc of docs) {
                doc.x = x;
                doc.y = y;
                x += width + 20;
                if (++i === 6) {
                    i = 0;
                    x = startX;
                    y += height + 20;
                }
            }
        }, "arrange contents");
    }

    autoFormat = () => {
        this.Document.isRuleProvider = !this.Document.isRuleProvider;
        // find rule colorations when rule providing is turned on by looking at each document to see if it has a coloring -- if so, use it's color as the rule for its associated heading.
        this.Document.isRuleProvider && this.childLayoutPairs.map(pair =>
            // iterate over the children of a displayed document (or if the displayed document is a template, iterate over the children of that template)
            DocListCast(Doc.Layout(pair.layout).data).map(heading => {
                let headingPair = Doc.GetLayoutDataDocPair(this.props.Document, this.props.DataDoc, this.props.fieldKey, heading);
                let headingLayout = headingPair.layout && (pair.layout.data_ext instanceof Doc) && (pair.layout.data_ext[`Layout[${headingPair.layout[Id]}]`] as Doc) || headingPair.layout;
                if (headingLayout && NumCast(headingLayout.heading) > 0 && headingLayout.backgroundColor !== headingLayout.defaultBackgroundColor) {
                    Doc.GetProto(this.props.Document)["ruleColor_" + NumCast(headingLayout.heading)] = headingLayout.backgroundColor;
                }
            })
        );
    }

    analyzeStrokes = async () => {
        //  CognitiveServices.Inking.Appliers.ConcatenateHandwriting(this.dataDoc, ["inkAnalysis", "handwriting"], data.inkData);
    }

    onContextMenu = (e: React.MouseEvent) => {
        let layoutItems: ContextMenuProps[] = [];

        if (this.childDocs.some(d => BoolCast(d.isTemplateDoc))) {
            layoutItems.push({ description: "Template Layout Instance", event: () => this.props.addDocTab(Doc.ApplyTemplate(this.props.Document)!, undefined, "onRight"), icon: "project-diagram" });
        }
        layoutItems.push({ description: "reset view", event: () => { this.props.Document.panX = this.props.Document.panY = 0; this.props.Document.scale = 1; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: `${this.fitToContent ? "Unset" : "Set"} Fit To Container`, event: async () => this.Document.fitToBox = !this.fitToContent, icon: !this.fitToContent ? "expand-arrows-alt" : "compress-arrows-alt" });
        layoutItems.push({ description: `${this.Document.useClusters ? "Uncluster" : "Use Clusters"}`, event: () => this.updateClusters(!this.Document.useClusters), icon: "braille" });
        layoutItems.push({ description: `${this.Document.isRuleProvider ? "Stop Auto Format" : "Auto Format"}`, event: this.autoFormat, icon: "chalkboard" });
        layoutItems.push({ description: "Arrange contents in grid", event: this.layoutDocsInGrid, icon: "table" });
        layoutItems.push({ description: "Analyze Strokes", event: this.analyzeStrokes, icon: "paint-brush" });
        layoutItems.push({ description: "Jitter Rotation", event: action(() => this.props.Document.jitterRotation = 10), icon: "paint-brush" });
        layoutItems.push({
            description: "Import document", icon: "upload", event: ({ x, y }) => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".zip";
                input.onchange = async _e => {
                    const upload = Utils.prepend("/uploadDoc");
                    let formData = new FormData();
                    const file = input.files && input.files[0];
                    if (file) {
                        formData.append('file', file);
                        formData.append('remap', "true");
                        const response = await fetch(upload, { method: "POST", body: formData });
                        const json = await response.json();
                        if (json !== "error") {
                            const doc = await DocServer.GetRefField(json);
                            if (doc instanceof Doc) {
                                const [xx, yy] = this.props.ScreenToLocalTransform().transformPoint(x, y);
                                doc.x = xx, doc.y = yy;
                                this.props.addDocument && this.props.addDocument(doc);
                            }
                        }
                    }
                };
                input.click();
            }
        });

        layoutItems.push({
            description: "Add Note ...",
            subitems: DocListCast((CurrentUserUtils.UserDocument.noteTypes as Doc).data).map((note, i) => ({
                description: (i + 1) + ": " + StrCast(note.title),
                event: (args: { x: number, y: number }) => this.addLiveTextBox(Docs.Create.TextDocument({ width: 200, height: 100, x: this.getTransform().transformPoint(args.x, args.y)[0], y: this.getTransform().transformPoint(args.x, args.y)[1], autoHeight: true, layout: note, title: StrCast(note.title) })),
                icon: "eye"
            })) as ContextMenuProps[],
            icon: "eye"
        });
        ContextMenu.Instance.addItem({ description: "Freeform Options ...", subitems: layoutItems, icon: "eye" });
    }


    private childViews = () => {
        let children = typeof this.props.children === "function" ? (this.props.children as any)() as JSX.Element[] : [];
        return [
            ...children,
            ...this.views,
        ];
    }

    @computed get svgBounds() {
        let xs = this._points.map(p => p.x);
        let ys = this._points.map(p => p.y);
        let right = Math.max(...xs);
        let left = Math.min(...xs);
        let bottom = Math.max(...ys);
        let top = Math.min(...ys);
        return { right: right, left: left, bottom: bottom, top: top, width: right - left, height: bottom - top };
    }

    @computed get currentStroke() {
        if (this._points.length <= 1) {
            return (null);
        }

        let B = this.svgBounds;

        return (
            <svg width={B.width} height={B.height} style={{ transform: `translate(${B.left}px, ${B.top}px)` }}>
                {CreatePolyline(this._points, B.left, B.top)}
            </svg>
        );
    }

    children = () => {
        let eles: JSX.Element[] = [];
        this.extensionDoc && (eles.push(...this.childViews()));
        this.currentStroke && (eles.push(this.currentStroke));
        eles.push(<CollectionFreeFormRemoteCursors {...this.props} key="remoteCursors" />);
        return eles;
    }
    render() {
        TraceMobx();
        // update the actual dimensions of the collection so that they can inquired (e.g., by a minimap)
        // this.Document.fitX = this.contentBounds && this.contentBounds.x;
        // this.Document.fitY = this.contentBounds && this.contentBounds.y;
        // this.Document.fitW = this.contentBounds && (this.contentBounds.r - this.contentBounds.x);
        // this.Document.fitH = this.contentBounds && (this.contentBounds.b - this.contentBounds.y);
        // if isAnnotationOverlay is set, then children will be stored in the extension document for the fieldKey.
        // otherwise, they are stored in fieldKey.  All annotations to this document are stored in the extension document
        return !this.extensionDoc ? (null) :
            <div className={"collectionfreeformview-container"} ref={this.createDropTarget} onWheel={this.onPointerWheel}//pointerEvents: SelectionManager.GetIsDragging() ? "all" : undefined,
                style={{ height: this.isAnnotationOverlay ? (this.props.Document.scrollHeight ? this.Document.scrollHeight : "100%") : this.props.PanelHeight() }}
                onPointerDown={this.onPointerDown} onPointerMove={this.onCursorMove} onDrop={this.onDrop.bind(this)} onContextMenu={this.onContextMenu} onTouchStart={this.onTouchStart}>
                <MarqueeView {...this.props} extensionDoc={this.extensionDoc} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments} addDocument={this.addDocument}
                    addLiveTextDocument={this.addLiveTextBox} getContainerTransform={this.getContainerTransform} getTransform={this.getTransform} isAnnotationOverlay={this.isAnnotationOverlay}>
                    <CollectionFreeFormViewPannableContents centeringShiftX={this.centeringShiftX} centeringShiftY={this.centeringShiftY}
                        easing={this.easing} zoomScaling={this.zoomScaling} panX={this.panX} panY={this.panY}>
                        {this.children}
                    </CollectionFreeFormViewPannableContents>
                </MarqueeView>
                <CollectionFreeFormOverlayView elements={this.elementFunc} />
            </div>;
    }
}

interface CollectionFreeFormOverlayViewProps {
    elements: () => ViewDefResult[];
}

@observer
class CollectionFreeFormOverlayView extends React.Component<CollectionFreeFormOverlayViewProps>{
    render() {
        return this.props.elements().filter(ele => ele.bounds && ele.bounds.z).map(ele => ele.ele);
    }
}

interface CollectionFreeFormViewPannableContentsProps {
    centeringShiftX: () => number;
    centeringShiftY: () => number;
    panX: () => number;
    panY: () => number;
    zoomScaling: () => number;
    easing: () => boolean;
    children: () => JSX.Element[];
}

@observer
class CollectionFreeFormViewPannableContents extends React.Component<CollectionFreeFormViewPannableContentsProps>{
    render() {
        let freeformclass = "collectionfreeformview" + (this.props.easing() ? "-ease" : "-none");
        const cenx = this.props.centeringShiftX();
        const ceny = this.props.centeringShiftY();
        const panx = -this.props.panX();
        const pany = -this.props.panY();
        const zoom = this.props.zoomScaling();
        return <div className={freeformclass} style={{ transform: `translate(${cenx}px, ${ceny}px) scale(${zoom}) translate(${panx}px, ${pany}px)` }}>
            {this.props.children()}
        </div>;
    }
}