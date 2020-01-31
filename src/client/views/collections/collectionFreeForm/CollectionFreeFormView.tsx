import { library } from "@fortawesome/fontawesome-svg-core";
import { faEye } from "@fortawesome/free-regular-svg-icons";
import { faBraille, faChalkboard, faCompass, faCompressArrowsAlt, faExpandArrowsAlt, faFileUpload, faPaintBrush, faTable, faUpload } from "@fortawesome/free-solid-svg-icons";
import { action, computed, observable, ObservableMap, reaction, runInAction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, Opt, WidthSym, DocListCastAsync, Field } from "../../../../new_fields/Doc";
import { documentSchema, positionSchema } from "../../../../new_fields/documentSchemas";
import { Id } from "../../../../new_fields/FieldSymbols";
import { InkTool, InkField, InkData } from "../../../../new_fields/InkField";
import { createSchema, makeInterface } from "../../../../new_fields/Schema";
import { ScriptField } from "../../../../new_fields/ScriptField";
import { BoolCast, Cast, DateCast, NumCast, StrCast, ScriptCast } from "../../../../new_fields/Types";
import { CurrentUserUtils } from "../../../../server/authentication/models/current_user_utils";
import { aggregateBounds, emptyFunction, intersectRect, returnOne, Utils } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs, DocUtils } from "../../../documents/Documents";
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
import { computedFn } from "mobx-utils";
import { TraceMobx } from "../../../../new_fields/util";
import { GestureUtils } from "../../../../pen-gestures/GestureUtils";
import { CognitiveServices } from "../../../cognitive_services/CognitiveServices";

library.add(faEye as any, faTable, faPaintBrush, faExpandArrowsAlt, faCompressArrowsAlt, faCompass, faUpload, faBraille, faChalkboard, faFileUpload);

export const panZoomSchema = createSchema({
    _panX: "number",
    _panY: "number",
    scale: "number",
    arrangeScript: ScriptField,
    arrangeInit: ScriptField,
    useClusters: "boolean",
    fitToBox: "boolean",
    xPadding: "number",         // pixels of padding on left/right of collectionfreeformview contents when fitToBox is set
    yPadding: "number",         // pixels of padding on left/right of collectionfreeformview contents when fitToBox is set
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

    public get displayName() { return "CollectionFreeFormView(" + this.props.Document.title?.toString() + ")"; } // this makes mobx trace() statements more descriptive
    @observable.shallow _layoutElements: ViewDefResult[] = []; // shallow because some layout items (eg pivot labels) are just generated 'divs' and can't be frozen as observables
    @observable _clusterSets: (Doc[])[] = [];

    @computed get fitToContent() { return (this.props.fitToBox || this.Document._fitToBox) && !this.isAnnotationOverlay; }
    @computed get parentScaling() { return this.props.ContentScaling && this.fitToContent && !this.isAnnotationOverlay ? this.props.ContentScaling() : 1; }
    @computed get contentBounds() { return aggregateBounds(this._layoutElements.filter(e => e.bounds && !e.bounds.z).map(e => e.bounds!), NumCast(this.layoutDoc.xPadding, 10), NumCast(this.layoutDoc.yPadding, 10)); }
    @computed get nativeWidth() { return this.Document._fitToContent ? 0 : NumCast(this.Document._nativeWidth); }
    @computed get nativeHeight() { return this.fitToContent ? 0 : NumCast(this.Document._nativeHeight); }
    private get isAnnotationOverlay() { return this.props.isAnnotationOverlay; }
    private get borderWidth() { return this.isAnnotationOverlay ? 0 : COLLECTION_BORDER_WIDTH; }
    private easing = () => this.props.Document.panTransformType === "Ease";
    private panX = () => this.fitToContent ? (this.contentBounds.x + this.contentBounds.r) / 2 : this.Document._panX || 0;
    private panY = () => this.fitToContent ? (this.contentBounds.y + this.contentBounds.b) / 2 : this.Document._panY || 0;
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
        this.addDocument(newBox);
    }
    private addDocument = (newBox: Doc) => {
        const added = this.props.addDocument(newBox);
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
        const pt = this.getTransform().transformPoint(e.pageX, e.pageY);
        const mutator = (doc: Doc) => {
            doc.x = pt[0];
            doc.y = pt[1];
            return doc;
        };
        return super.onDrop(e, {}, undefined, mutator);
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        const xf = this.getTransform();
        const xfo = this.getTransformOverlay();
        const [xp, yp] = xf.transformPoint(de.x, de.y);
        const [xpo, ypo] = xfo.transformPoint(de.x, de.y);
        if (super.drop(e, de)) {
            if (de.complete.docDragData) {
                if (de.complete.docDragData.droppedDocuments.length) {
                    const firstDoc = de.complete.docDragData.droppedDocuments[0];
                    const z = NumCast(firstDoc.z);
                    const x = (z ? xpo : xp) - de.complete.docDragData.offset[0];
                    const y = (z ? ypo : yp) - de.complete.docDragData.offset[1];
                    const dropX = NumCast(firstDoc.x);
                    const dropY = NumCast(firstDoc.y);
                    de.complete.docDragData.droppedDocuments.forEach(action((d: Doc) => {
                        const layoutDoc = Doc.Layout(d);
                        d.x = x + NumCast(d.x) - dropX;
                        d.y = y + NumCast(d.y) - dropY;
                        if (!NumCast(layoutDoc._width)) {
                            layoutDoc._width = 300;
                        }
                        if (!NumCast(layoutDoc._height)) {
                            const nw = NumCast(layoutDoc._nativeWidth);
                            const nh = NumCast(layoutDoc._nativeHeight);
                            layoutDoc._height = nw && nh ? nh / nw * NumCast(layoutDoc._width) : 300;
                        }
                        this.bringToFront(d);
                    }));

                    (de.complete.docDragData.droppedDocuments.length === 1 || de.shiftKey) && this.updateClusterDocs(de.complete.docDragData.droppedDocuments);
                }
            }
            else if (de.complete.annoDragData) {
                if (de.complete.annoDragData.dropDocument) {
                    const dragDoc = de.complete.annoDragData.dropDocument;
                    const x = xp - de.complete.annoDragData.offset[0];
                    const y = yp - de.complete.annoDragData.offset[1];
                    const dropX = NumCast(dragDoc.x);
                    const dropY = NumCast(dragDoc.y);
                    dragDoc.x = x + NumCast(dragDoc.x) - dropX;
                    dragDoc.y = y + NumCast(dragDoc.y) - dropY;
                    de.complete.annoDragData.targetContext = this.props.Document; // dropped a PDF annotation, so we need to set the targetContext on the dragData which the PDF view uses at the end of the drop operation
                    this.bringToFront(dragDoc);
                }
            }
        }
        return false;
    }

    pickCluster(probe: number[]) {
        return this.childLayoutPairs.map(pair => pair.layout).reduce((cluster, cd) => {
            const layoutDoc = Doc.Layout(cd);
            const cx = NumCast(cd.x) - this._clusterDistance;
            const cy = NumCast(cd.y) - this._clusterDistance;
            const cw = NumCast(layoutDoc._width) + 2 * this._clusterDistance;
            const ch = NumCast(layoutDoc._height) + 2 * this._clusterDistance;
            return !layoutDoc.z && intersectRect({ left: cx, top: cy, width: cw, height: ch }, { left: probe[0], top: probe[1], width: 1, height: 1 }) ?
                NumCast(cd.cluster) : cluster;
        }, -1);
    }
    tryDragCluster(e: PointerEvent | TouchEvent) {
        const ptsParent = e instanceof PointerEvent ? e : e.targetTouches.item(0);
        if (ptsParent) {
            const cluster = this.pickCluster(this.getTransform().transformPoint(ptsParent.clientX, ptsParent.clientY));
            if (cluster !== -1) {
                const eles = this.childLayoutPairs.map(pair => pair.layout).filter(cd => NumCast(cd.cluster) === cluster);
                const clusterDocs = eles.map(ele => DocumentManager.Instance.getDocumentView(ele, this.props.CollectionView)!);
                const de = new DragManager.DocumentDragData(eles);
                de.moveDocument = this.props.moveDocument;
                const [left, top] = clusterDocs[0].props.ScreenToLocalTransform().scale(clusterDocs[0].props.ContentScaling()).inverse().transformPoint(0, 0);
                de.offset = this.getTransform().transformDirection(ptsParent.clientX - left, ptsParent.clientY - top);
                de.dropAction = e.ctrlKey || e.altKey ? "alias" : undefined;
                DragManager.StartDocumentDrag(clusterDocs.map(v => v.ContentDiv!), de, ptsParent.clientX, ptsParent.clientY, { hideSource: !de.dropAction });
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

    @action
    updateClusterDocs(docs: Doc[]) {
        const childLayouts = this.childLayoutPairs.map(pair => pair.layout);
        if (this.props.Document.useClusters) {
            const docFirst = docs[0];
            docs.map(doc => this._clusterSets.map(set => Doc.IndexOf(doc, set) !== -1 && set.splice(Doc.IndexOf(doc, set), 1)));
            const preferredInd = NumCast(docFirst.cluster);
            docs.map(doc => doc.cluster = -1);
            docs.map(doc => this._clusterSets.map((set, i) => set.map(member => {
                if (docFirst.cluster === -1 && Doc.IndexOf(member, childLayouts) !== -1 && Doc.overlapping(doc, member, this._clusterDistance)) {
                    docFirst.cluster = i;
                }
            })));
            if (docFirst.cluster === -1 && preferredInd !== -1 && (!this._clusterSets[preferredInd] || !this._clusterSets[preferredInd].filter(member => Doc.IndexOf(member, childLayouts) !== -1).length)) {
                docFirst.cluster = preferredInd;
            }
            this._clusterSets.map((set, i) => {
                if (docFirst.cluster === -1 && !set.filter(member => Doc.IndexOf(member, childLayouts) !== -1).length) {
                    docFirst.cluster = i;
                }
            });
            if (docFirst.cluster === -1) {
                docs.map(doc => {
                    doc.cluster = this._clusterSets.length;
                    this._clusterSets.push([doc]);
                });
            } else {
                for (let i = this._clusterSets.length; i <= NumCast(docFirst.cluster); i++) !this._clusterSets[i] && this._clusterSets.push([]);
                docs.map(doc => this._clusterSets[doc.cluster = NumCast(docFirst.cluster)].push(doc));
            }
            childLayouts.map(child => !this._clusterSets.some((set, i) => Doc.IndexOf(child, set) !== -1 && child.cluster === i) && this.updateCluster(child));
            childLayouts.map(child => Doc.GetProto(child).clusterStr = child.cluster?.toString());
        }
    }

    @undoBatch
    @action
    updateCluster(doc: Doc) {
        const childLayouts = this.childLayoutPairs.map(pair => pair.layout);
        if (this.props.Document.useClusters) {
            this._clusterSets.map(set => Doc.IndexOf(doc, set) !== -1 && set.splice(Doc.IndexOf(doc, set), 1));
            const preferredInd = NumCast(doc.cluster);
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
        const cluster = NumCast(doc.cluster);
        if (this.Document.useClusters) {
            if (this._clusterSets.length <= cluster) {
                setTimeout(() => this.updateCluster(doc), 0);
            } else {
                // choose a cluster color from a palette
                const colors = ["#da42429e", "#31ea318c", "#8c4000", "#4a7ae2c4", "#d809ff", "#ff7601", "#1dffff", "yellow", "#1b8231f2", "#000000ad"];
                clusterColor = colors[cluster % colors.length];
                const set = this._clusterSets[cluster] && this._clusterSets[cluster].filter(s => s.backgroundColor && (s.backgroundColor !== s.defaultBackgroundColor));
                // override the cluster color with an explicitly set color on a non-background document.  then override that with an explicitly set color on a background document
                set && set.filter(s => !s.isBackground).map(s => clusterColor = StrCast(s.backgroundColor));
                set && set.filter(s => s.isBackground).map(s => clusterColor = StrCast(s.backgroundColor));
            }
        }
        return clusterColor;
    }


    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.nativeEvent.cancelBubble || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE) || InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || (InkingControl.Instance.selectedTool === InkTool.Highlighter || InkingControl.Instance.selectedTool === InkTool.Pen)) {
            return;
        }
        this._hitCluster = this.props.Document.useClusters ? this.pickCluster(this.getTransform().transformPoint(e.clientX, e.clientY)) !== -1 : false;
        if (e.button === 0 && (!e.shiftKey || this._hitCluster) && !e.altKey && !e.ctrlKey && this.props.active(true)) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);
            // if physically using a pen or we're in pen or highlighter mode
            // if (InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || (InkingControl.Instance.selectedTool === InkTool.Highlighter || InkingControl.Instance.selectedTool === InkTool.Pen)) {
            //     e.stopPropagation();
            //     e.preventDefault();
            //     const point = this.getTransform().transformPoint(e.pageX, e.pageY);
            //     this._points.push({ X: point[0], Y: point[1] });
            // }
            // if not using a pen and in no ink mode
            if (InkingControl.Instance.selectedTool === InkTool.None) {
                this._lastX = e.pageX;
                this._lastY = e.pageY;
            }
            // eraser or scrubber plus anything else mode
            else {
                e.stopPropagation();
                e.preventDefault();
            }
        }
        // if (e.button === 0 && !e.shiftKey && !e.altKey && !e.ctrlKey && this.props.active(true)) {
        //     document.removeEventListener("pointermove", this.onPointerMove);
        //     document.removeEventListener("pointerup", this.onPointerUp);
        //     document.addEventListener("pointermove", this.onPointerMove);
        //     document.addEventListener("pointerup", this.onPointerUp);
        //     if (InkingControl.Instance.selectedTool === InkTool.None) {
        //         this._lastX = e.pageX;
        //         this._lastY = e.pageY;
        //     }
        //     else {
        //         e.stopPropagation();
        //         e.preventDefault();

        //         if (InkingControl.Instance.selectedTool !== InkTool.Eraser && InkingControl.Instance.selectedTool !== InkTool.Scrubber) {
        //             let point = this.getTransform().transformPoint(e.pageX, e.pageY);
        //             this._points.push({ x: point[0], y: point[1] });
        //         }
        //     }
        // }
    }

    @action
    handle1PointerDown = (e: React.TouchEvent, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>) => {
        if (!e.nativeEvent.cancelBubble) {
            // const myTouches = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true);
            const pt = me.changedTouches[0];
            if (pt) {
                this._hitCluster = this.props.Document.useCluster ? this.pickCluster(this.getTransform().transformPoint(pt.clientX, pt.clientY)) !== -1 : false;
                if (!e.shiftKey && !e.altKey && !e.ctrlKey && this.props.active(true)) {
                    this.removeMoveListeners();
                    this.addMoveListeners();
                    this.removeEndListeners();
                    this.addEndListeners();
                    // if (InkingControl.Instance.selectedTool === InkTool.Highlighter || InkingControl.Instance.selectedTool === InkTool.Pen) {
                    //     e.stopPropagation();
                    //     e.preventDefault();
                    //     const point = this.getTransform().transformPoint(pt.pageX, pt.pageY);
                    //     this._points.push({ X: point[0], Y: point[1] });
                    // }
                    if (InkingControl.Instance.selectedTool === InkTool.None) {
                        this._lastX = pt.pageX;
                        this._lastY = pt.pageY;
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    else {
                        e.preventDefault();
                    }
                }
            }
        }
    }

    @undoBatch
    onGesture = (e: Event, ge: GestureUtils.GestureEvent) => {
        switch (ge.gesture) {
            case GestureUtils.Gestures.Stroke:
                const points = ge.points;
                const B = this.getTransform().transformBounds(ge.bounds.left, ge.bounds.top, ge.bounds.width, ge.bounds.height);
                const inkDoc = Docs.Create.InkDocument(InkingControl.Instance.selectedColor, InkingControl.Instance.selectedTool, parseInt(InkingControl.Instance.selectedWidth), points, { title: "ink stroke", x: B.x, y: B.y, _width: B.width, _height: B.height });
                this.addDocument(inkDoc);
                e.stopPropagation();
                break;
            case GestureUtils.Gestures.Box:
                const lt = this.getTransform().transformPoint(Math.min(...ge.points.map(p => p.X)), Math.min(...ge.points.map(p => p.Y)));
                const rb = this.getTransform().transformPoint(Math.max(...ge.points.map(p => p.X)), Math.max(...ge.points.map(p => p.Y)));
                const bounds = { x: lt[0], r: rb[0], y: lt[1], b: rb[1] };
                const bWidth = bounds.r - bounds.x;
                const bHeight = bounds.b - bounds.y;
                const sel = this.getActiveDocuments().filter(doc => {
                    const l = NumCast(doc.x);
                    const r = l + doc[WidthSym]();
                    const t = NumCast(doc.y);
                    const b = t + doc[HeightSym]();
                    const pass = !(bounds.x > r || bounds.r < l || bounds.y > b || bounds.b < t);
                    if (pass) {
                        doc.x = l - bounds.x - bWidth / 2;
                        doc.y = t - bounds.y - bHeight / 2;
                    }
                    return pass;
                });
                this.addDocument(Docs.Create.FreeformDocument(sel, { title: "nested collection", x: bounds.x, y: bounds.y, _width: bWidth, _height: bHeight, _panX: 0, _panY: 0 }));
                sel.forEach(d => this.props.removeDocument(d));
                break;

        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)) return;

        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        this.removeMoveListeners();
        this.removeEndListeners();
    }

    @action
    pan = (e: PointerEvent | React.Touch | { clientX: number, clientY: number }): void => {
        // I think it makes sense for the marquee menu to go away when panned. -syip2
        MarqueeOptionsMenu.Instance.fadeOut(true);

        let x = this.Document._panX || 0;
        let y = this.Document._panY || 0;
        const docs = this.childLayoutPairs.filter(pair => pair.layout instanceof Doc && !pair.layout.isMinimized).map(pair => pair.layout);
        const [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
        if (!this.isAnnotationOverlay && docs.length) {
            PDFMenu.Instance.fadeOut(true);
            const minx = this.childDataProvider(docs[0]).x;//docs.length ? NumCast(docs[0].x) : 0;
            const miny = this.childDataProvider(docs[0]).y;//docs.length ? NumCast(docs[0].y) : 0;
            const maxx = this.childDataProvider(docs[0]).width + minx;//docs.length ? NumCast(docs[0].width) + minx : minx;
            const maxy = this.childDataProvider(docs[0]).height + miny;//docs.length ? NumCast(docs[0].height) + miny : miny;
            const ranges = docs.filter(doc => doc).reduce((range, doc) => {
                const x = this.childDataProvider(doc).x;//NumCast(doc.x);
                const y = this.childDataProvider(doc).y;//NumCast(doc.y);
                const xe = this.childDataProvider(doc).width + x;//x + NumCast(layoutDoc.width);
                const ye = this.childDataProvider(doc).height + y; //y + NumCast(layoutDoc.height);
                return [[range[0][0] > x ? x : range[0][0], range[0][1] < xe ? xe : range[0][1]],
                [range[1][0] > y ? y : range[1][0], range[1][1] < ye ? ye : range[1][1]]];
            }, [[minx, maxx], [miny, maxy]]);

            const cscale = this.props.ContainingCollectionDoc ? NumCast(this.props.ContainingCollectionDoc.scale) : 1;
            const panelDim = this.props.ScreenToLocalTransform().transformDirection(this.props.PanelWidth() / this.zoomScaling() * cscale,
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
        if (InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)) {
            if (this.props.active(true)) {
                e.stopPropagation();
            }
            return;
        }
        if (InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
            return;
        }
        if (!e.cancelBubble) {
            const selectedTool = InkingControl.Instance.selectedTool;
            if (selectedTool === InkTool.None) {
                if (this._hitCluster && this.tryDragCluster(e)) {
                    e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
                    e.preventDefault();
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                    return;
                }
                this.pan(e);
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }

    handle1PointerMove = (e: TouchEvent, me: InteractionUtils.MultiTouchEvent<TouchEvent>) => {
        // panning a workspace
        if (!e.cancelBubble) {
            const myTouches = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true);
            const pt = myTouches[0];
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
            }
            // e.stopPropagation();
            e.preventDefault();
        }
    }

    handle2PointersMove = (e: TouchEvent, me: InteractionUtils.MultiTouchEvent<TouchEvent>) => {
        // pinch zooming
        if (!e.cancelBubble) {
            const myTouches = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true);
            const pt1 = myTouches[0];
            const pt2 = myTouches[1];

            if (this.prevPoints.size === 2) {
                const oldPoint1 = this.prevPoints.get(pt1.identifier);
                const oldPoint2 = this.prevPoints.get(pt2.identifier);
                if (oldPoint1 && oldPoint2) {
                    const dir = InteractionUtils.Pinching(pt1, pt2, oldPoint1, oldPoint2);

                    // if zooming, zoom
                    if (dir !== 0) {
                        const d1 = Math.sqrt(Math.pow(pt1.clientX - oldPoint1.clientX, 2) + Math.pow(pt1.clientY - oldPoint1.clientY, 2));
                        const d2 = Math.sqrt(Math.pow(pt2.clientX - oldPoint2.clientX, 2) + Math.pow(pt2.clientY - oldPoint2.clientY, 2));
                        const centerX = Math.min(pt1.clientX, pt2.clientX) + Math.abs(pt2.clientX - pt1.clientX) / 2;
                        const centerY = Math.min(pt1.clientY, pt2.clientY) + Math.abs(pt2.clientY - pt1.clientY) / 2;

                        // calculate the raw delta value
                        const rawDelta = (dir * (d1 + d2));

                        // this floors and ceils the delta value to prevent jitteriness
                        const delta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), 8);
                        this.zoom(centerX, centerY, delta * window.devicePixelRatio);
                        this.prevPoints.set(pt1.identifier, pt1);
                        this.prevPoints.set(pt2.identifier, pt2);
                    }
                    // this is not zooming. derive some form of panning from it.
                    else {
                        // use the centerx and centery as the "new mouse position"
                        const centerX = Math.min(pt1.clientX, pt2.clientX) + Math.abs(pt2.clientX - pt1.clientX) / 2;
                        const centerY = Math.min(pt1.clientY, pt2.clientY) + Math.abs(pt2.clientY - pt1.clientY) / 2;
                        this.pan({ clientX: centerX, clientY: centerY });
                        this._lastX = centerX;
                        this._lastY = centerY;
                    }
                }
            }
            // e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    handle2PointersDown = (e: React.TouchEvent, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>) => {
        if (!e.nativeEvent.cancelBubble && this.props.active(true)) {
            // const pt1: React.Touch | null = e.targetTouches.item(0);
            // const pt2: React.Touch | null = e.targetTouches.item(1);
            // // if (!pt1 || !pt2) return;
            const myTouches = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true);
            const pt1 = myTouches[0];
            const pt2 = myTouches[1];
            if (pt1 && pt2) {
                const centerX = Math.min(pt1.clientX, pt2.clientX) + Math.abs(pt2.clientX - pt1.clientX) / 2;
                const centerY = Math.min(pt1.clientY, pt2.clientY) + Math.abs(pt2.clientY - pt1.clientY) / 2;
                this._lastX = centerX;
                this._lastY = centerY;
                this.removeMoveListeners();
                this.addMoveListeners();
                this.removeEndListeners();
                this.addEndListeners();
                e.stopPropagation();
            }
        }
    }

    cleanUpInteractions = () => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        this.removeMoveListeners();
        this.removeEndListeners();
    }

    @action
    zoom = (pointX: number, pointY: number, deltaY: number): void => {
        let deltaScale = deltaY > 0 ? (1 / 1.1) : 1.1;
        if (deltaScale * this.zoomScaling() < 1 && this.isAnnotationOverlay) {
            deltaScale = 1 / this.zoomScaling();
        }
        if (deltaScale < 0) deltaScale = -deltaScale;
        const [x, y] = this.getTransform().transformPoint(pointX, pointY);
        const localTransform = this.getLocalTransform().inverse().scaleAbout(deltaScale, x, y);

        if (localTransform.Scale >= 0.15) {
            const safeScale = Math.min(Math.max(0.15, localTransform.Scale), 40);
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
            const scale = this.getLocalTransform().inverse().Scale;
            const newPanX = Math.min((1 - 1 / scale) * this.nativeWidth, Math.max(0, panX));
            const newPanY = Math.min((this.props.Document.scrollHeight !== undefined ? NumCast(this.Document.scrollHeight) : (1 - 1 / scale) * this.nativeHeight), Math.max(0, panY));
            this.Document._panX = this.isAnnotationOverlay ? newPanX : panX;
            this.Document._panY = this.isAnnotationOverlay ? newPanY : panY;
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
        if (state.type === "doc" && this.Document._panX !== undefined && this.Document._panY !== undefined) {
            const init = state.initializers![this.Document[Id]];
            if (!init) {
                state.initializers![this.Document[Id]] = { panX: this.Document._panX, panY: this.Document._panY };
                HistoryUtil.pushState(state);
            } else if (init.panX !== this.Document._panX || init.panY !== this.Document._panY) {
                init.panX = this.Document._panX;
                init.panY = this.Document._panY;
                HistoryUtil.pushState(state);
            }
        }
        SelectionManager.DeselectAll();
        if (this.props.Document.scrollHeight) {
            const annotOn = Cast(doc.annotationOn, Doc) as Doc;
            if (!annotOn) {
                this.props.focus(doc);
            } else {
                const contextHgt = Doc.AreProtosEqual(annotOn, this.props.Document) && this.props.VisibleHeight ? this.props.VisibleHeight() : NumCast(annotOn.height);
                const offset = annotOn && (contextHgt / 2 * 96 / 72);
                this.props.Document.scrollY = NumCast(doc.y) - offset;
            }
        } else {
            const layoutdoc = Doc.Layout(doc);
            const newPanX = NumCast(doc.x) + NumCast(layoutdoc._width) / 2;
            const newPanY = NumCast(doc.y) + NumCast(layoutdoc._height) / 2;
            const newState = HistoryUtil.getState();
            newState.initializers![this.Document[Id]] = { panX: newPanX, panY: newPanY };
            HistoryUtil.pushState(newState);

            const savedState = { px: this.Document._panX, py: this.Document._panY, s: this.Document.scale, pt: this.Document.panTransformType };

            if (!doc.z) this.setPan(newPanX, newPanY, "Ease"); // docs that are floating in their collection can't be panned to from their collection -- need to propagate the pan to a parent freeform somehow
            Doc.BrushDoc(this.props.Document);
            this.props.focus(this.props.Document);
            willZoom && this.setScaleToZoom(layoutdoc, scale);
            Doc.linkFollowHighlight(doc);

            afterFocus && setTimeout(() => {
                if (afterFocus && afterFocus()) {
                    this.Document._panX = savedState.px;
                    this.Document._panY = savedState.py;
                    this.Document.scale = savedState.s;
                    this.Document.panTransformType = savedState.pt;
                }
            }, 1000);
        }

    }

    setScaleToZoom = (doc: Doc, scale: number = 0.5) => {
        this.Document.scale = scale * Math.min(this.props.PanelWidth() / NumCast(doc._width), this.props.PanelHeight() / NumCast(doc._height));
    }

    zoomToScale = (scale: number) => {
        this.Document.scale = scale;
    }

    getScale = () => this.Document.scale || 1;

    @computed get libraryPath() { return this.props.LibraryPath ? [...this.props.LibraryPath, this.props.Document] : []; }
    @computed get onChildClickHandler() { return ScriptCast(this.Document.onChildClick); }

    getChildDocumentViewProps(childLayout: Doc, childData?: Doc): DocumentViewProps {
        return {
            ...this.props,
            DataDoc: childData,
            Document: childLayout,
            LibraryPath: this.libraryPath,
            layoutKey: undefined,
            //onClick: undefined, // this.props.onClick,  // bcz: check this out -- I don't think we want to inherit click handlers, or we at least need a way to ignore them
            onClick: this.onChildClickHandler,
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
        return { x: Cast(params.doc.x, "number"), y: Cast(params.doc.y, "number"), z: Cast(params.doc.z, "number"), width: Cast(layoutDoc._width, "number"), height: Cast(layoutDoc._height, "number") };
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
                    ele: <div className="collectionFreeform-customText" key={(text || "") + x + y + z} style={{ width, height, fontSize, transform: `translate(${x}px, ${y}px)` }}>
                        {text}
                    </div>,
                    bounds: { x: x!, y: y!, z: z, width: width!, height: height! }
                };
        }
    }

    childDataProvider = computedFn(function childDataProvider(this: any, doc: Doc) {
        if (!doc) {
            console.log(doc);
        }
        return this._layoutPoolData.get(doc[Id]);
    }.bind(this));

    doPivotLayout(poolData: ObservableMap<string, any>) {
        return computePivotLayout(poolData, this.props.Document, this.childDocs,
            this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)), [this.props.PanelWidth(), this.props.PanelHeight()], this.viewDefsToJSX);
    }

    doFreeformLayout(poolData: ObservableMap<string, any>) {
        const layoutDocs = this.childLayoutPairs.map(pair => pair.layout);
        const initResult = this.Document.arrangeInit && this.Document.arrangeInit.script.run({ docs: layoutDocs, collection: this.Document }, console.log);
        let state = initResult && initResult.success ? initResult.result.scriptState : undefined;
        const elements = initResult && initResult.success ? this.viewDefsToJSX(initResult.result.views) : [];

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
        switch (this.Document._freeformLayoutEngine) {
            case "pivot": computedElementData = this.doPivotLayout(this._layoutPoolData); break;
            default: computedElementData = this.doFreeformLayout(this._layoutPoolData); break;
        }
        this.childLayoutPairs.filter((pair, i) => this.isCurrent(pair.layout)).forEach(pair =>
            computedElementData.elements.push({
                ele: <CollectionFreeFormDocumentView key={pair.layout[Id]}  {...this.getChildDocumentViewProps(pair.layout, pair.data)}
                    dataProvider={this.childDataProvider}
                    jitterRotation={NumCast(this.props.Document.jitterRotation)}
                    fitToBox={this.props.fitToBox || this.Document._freeformLayoutEngine === "pivot"} />,
                bounds: this.childDataProvider(pair.layout)
            }));

        return computedElementData;
    }

    componentDidMount() {
        super.componentDidMount();
        this._layoutComputeReaction = reaction(() => { TraceMobx(); return this.doLayoutComputation; },
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
            const startX = this.Document._panX || 0;
            let x = startX;
            let y = this.Document._panY || 0;
            let i = 0;
            const width = Math.max(...docs.map(doc => NumCast(doc._width)));
            const height = Math.max(...docs.map(doc => NumCast(doc._height)));
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

    private thumbIdentifier?: number;

    // @action
    // handleHandDown = (e: React.TouchEvent) => {
    //     const fingers = InteractionUtils.GetMyTargetTouches(e, this.prevPoints, true);
    //     const thumb = fingers.reduce((a, v) => a.clientY > v.clientY ? a : v, fingers[0]);
    //     this.thumbIdentifier = thumb?.identifier;
    //     const others = fingers.filter(f => f !== thumb);
    //     const minX = Math.min(...others.map(f => f.clientX));
    //     const minY = Math.min(...others.map(f => f.clientY));
    //     const t = this.getTransform().transformPoint(minX, minY);
    //     const th = this.getTransform().transformPoint(thumb.clientX, thumb.clientY);

    //     const thumbDoc = FieldValue(Cast(CurrentUserUtils.setupThumbDoc(CurrentUserUtils.UserDocument), Doc));
    //     if (thumbDoc) {
    //         this._palette = <Palette x={t[0]} y={t[1]} thumb={th} thumbDoc={thumbDoc} />;
    //     }

    //     document.removeEventListener("touchmove", this.onTouch);
    //     document.removeEventListener("touchmove", this.handleHandMove);
    //     document.addEventListener("touchmove", this.handleHandMove);
    //     document.removeEventListener("touchend", this.handleHandUp);
    //     document.addEventListener("touchend", this.handleHandUp);
    // }

    // @action
    // handleHandMove = (e: TouchEvent) => {
    //     for (let i = 0; i < e.changedTouches.length; i++) {
    //         const pt = e.changedTouches.item(i);
    //         if (pt?.identifier === this.thumbIdentifier) {
    //         }
    //     }
    // }

    // @action
    // handleHandUp = (e: TouchEvent) => {
    //     this.onTouchEnd(e);
    //     if (this.prevPoints.size < 3) {
    //         this._palette = undefined;
    //         document.removeEventListener("touchend", this.handleHandUp);
    //     }
    // }

    onContextMenu = (e: React.MouseEvent) => {
        const layoutItems: ContextMenuProps[] = [];

        layoutItems.push({ description: "reset view", event: () => { this.props.Document._panX = this.props.Document._panY = 0; this.props.Document.scale = 1; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: `${this.Document._LODdisable ? "Enable LOD" : "Disable LOD"}`, event: () => this.Document._LODdisable = !this.Document._LODdisable, icon: "table" });
        layoutItems.push({ description: `${this.fitToContent ? "Unset" : "Set"} Fit To Container`, event: () => this.Document._fitToBox = !this.fitToContent, icon: !this.fitToContent ? "expand-arrows-alt" : "compress-arrows-alt" });
        layoutItems.push({ description: `${this.Document.useClusters ? "Uncluster" : "Use Clusters"}`, event: () => this.updateClusters(!this.Document.useClusters), icon: "braille" });
        layoutItems.push({ description: "Arrange contents in grid", event: this.layoutDocsInGrid, icon: "table" });
        // layoutItems.push({ description: "Analyze Strokes", event: this.analyzeStrokes, icon: "paint-brush" });
        layoutItems.push({ description: "Jitter Rotation", event: action(() => this.props.Document.jitterRotation = 10), icon: "paint-brush" });
        layoutItems.push({
            description: "Import document", icon: "upload", event: ({ x, y }) => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".zip";
                input.onchange = async _e => {
                    const upload = Utils.prepend("/uploadDoc");
                    const formData = new FormData();
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
                event: (args: { x: number, y: number }) => this.addLiveTextBox(Docs.Create.TextDocument("", { _width: 200, _height: 100, x: this.getTransform().transformPoint(args.x, args.y)[0], y: this.getTransform().transformPoint(args.x, args.y)[1], _autoHeight: true, layout: note, title: StrCast(note.title) })),
                icon: "eye"
            })) as ContextMenuProps[],
            icon: "eye"
        });
        ContextMenu.Instance.addItem({ description: "Freeform Options ...", subitems: layoutItems, icon: "eye" });
    }


    private childViews = () => {
        const children = typeof this.props.children === "function" ? (this.props.children as any)() as JSX.Element[] : [];
        return [
            ...children,
            ...this.views,
        ];
    }

    // @observable private _palette?: JSX.Element;

    children = () => {
        const eles: JSX.Element[] = [];
        eles.push(...this.childViews());
        // this._palette && (eles.push(this._palette));
        // this.currentStroke && (eles.push(this.currentStroke));
        eles.push(<CollectionFreeFormRemoteCursors {...this.props} key="remoteCursors" />);
        return eles;
    }
    @computed get placeholder() {
        return <div className="collectionfreeformview-placeholder" style={{ background: this.Document.backgroundColor }}>
            <span className="collectionfreeformview-placeholderSpan">{this.props.Document.title?.toString()}</span>
        </div>;
    }
    @computed get marqueeView() {
        return <MarqueeView {...this.props} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments} addDocument={this.addDocument}
            addLiveTextDocument={this.addLiveTextBox} getContainerTransform={this.getContainerTransform} getTransform={this.getTransform} isAnnotationOverlay={this.isAnnotationOverlay}>
            <CollectionFreeFormViewPannableContents centeringShiftX={this.centeringShiftX} centeringShiftY={this.centeringShiftY}
                easing={this.easing} zoomScaling={this.zoomScaling} panX={this.panX} panY={this.panY}>
                {this.children}
            </CollectionFreeFormViewPannableContents>
        </MarqueeView>;
    }
    @computed get contentScaling() {
        if (this.props.annotationsKey) return 0;
        const hscale = this.nativeHeight ? this.props.PanelHeight() / this.nativeHeight : 1;
        const wscale = this.nativeWidth ? this.props.PanelWidth() / this.nativeWidth : 1;
        return wscale < hscale ? wscale : hscale;
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
        // let lodarea = this.Document[WidthSym]() * this.Document[HeightSym]() / this.props.ScreenToLocalTransform().Scale / this.props.ScreenToLocalTransform().Scale;
        return <div className={"collectionfreeformview-container"}
            ref={this.createDashEventsTarget}
            onWheel={this.onPointerWheel}//pointerEvents: SelectionManager.GetIsDragging() ? "all" : undefined,
            onPointerDown={this.onPointerDown} onPointerMove={this.onCursorMove} onDrop={this.onDrop.bind(this)} onContextMenu={this.onContextMenu}
            style={{
                pointerEvents: SelectionManager.GetIsDragging() ? "all" : undefined,
                transform: this.contentScaling ? `scale(${this.contentScaling})` : "",
                transformOrigin: this.contentScaling ? "left top" : "",
                width: this.contentScaling ? `${100 / this.contentScaling}%` : "",
                height: this.contentScaling ? `${100 / this.contentScaling}%` : this.isAnnotationOverlay ? (this.props.Document.scrollHeight ? this.Document.scrollHeight : "100%") : this.props.PanelHeight()
            }}>
            {!this.Document._LODdisable && !this.props.active() && !this.props.isAnnotationOverlay && !this.props.annotationsKey && this.props.renderDepth > 0 ? // && this.props.CollectionView && lodarea < NumCast(this.Document.LODarea, 100000) ?
                this.placeholder : this.marqueeView}
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
        const freeformclass = "collectionfreeformview" + (this.props.easing() ? "-ease" : "-none");
        const cenx = this.props.centeringShiftX();
        const ceny = this.props.centeringShiftY();
        const panx = -this.props.panX();
        const pany = -this.props.panY();
        const zoom = this.props.zoomScaling();
        return <div className={freeformclass} style={{ touchAction: "none", borderRadius: "inherit", transform: `translate(${cenx}px, ${ceny}px) scale(${zoom}) translate(${panx}px, ${pany}px)` }}>
            {this.props.children()}
        </div>;
    }
}