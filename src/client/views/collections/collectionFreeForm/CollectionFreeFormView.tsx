import { library } from "@fortawesome/fontawesome-svg-core";
import { faEye, faEyeSlash } from "@fortawesome/free-regular-svg-icons";
import { faBraille, faChalkboard, faCompass, faCompressArrowsAlt, faExpandArrowsAlt, faFileUpload, faPaintBrush, faTable, faUpload } from "@fortawesome/free-solid-svg-icons";
import { action, computed, IReactionDisposer, observable, ObservableMap, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { computedFn } from "mobx-utils";
import { Doc, HeightSym, Opt, WidthSym, DocListCast } from "../../../../new_fields/Doc";
import { documentSchema, collectionSchema } from "../../../../new_fields/documentSchemas";
import { Id } from "../../../../new_fields/FieldSymbols";
import { InkData, InkField, InkTool, PointData } from "../../../../new_fields/InkField";
import { List } from "../../../../new_fields/List";
import { RichTextField } from "../../../../new_fields/RichTextField";
import { createSchema, listSpec, makeInterface } from "../../../../new_fields/Schema";
import { ScriptField } from "../../../../new_fields/ScriptField";
import { BoolCast, Cast, FieldValue, NumCast, ScriptCast, StrCast } from "../../../../new_fields/Types";
import { TraceMobx } from "../../../../new_fields/util";
import { GestureUtils } from "../../../../pen-gestures/GestureUtils";
import { aggregateBounds, intersectRect, returnOne, Utils, returnZero, returnFalse } from "../../../../Utils";
import { CognitiveServices } from "../../../cognitive_services/CognitiveServices";
import { DocServer } from "../../../DocServer";
import { Docs } from "../../../documents/Documents";
import { DocumentManager } from "../../../util/DocumentManager";
import { DragManager, dropActionType } from "../../../util/DragManager";
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
import { DocumentViewProps, DocumentView } from "../../nodes/DocumentView";
import { FormattedTextBox } from "../../nodes/formattedText/FormattedTextBox";
import { pageSchema } from "../../nodes/ImageBox";
import PDFMenu from "../../pdf/PDFMenu";
import { CollectionDockingView } from "../CollectionDockingView";
import { CollectionSubView } from "../CollectionSubView";
import { computePivotLayout, computeTimelineLayout, PoolData, ViewDefBounds, ViewDefResult, computerStarburstLayout, computerPassLayout } from "./CollectionFreeFormLayoutEngines";
import { CollectionFreeFormRemoteCursors } from "./CollectionFreeFormRemoteCursors";
import "./CollectionFreeFormView.scss";
import MarqueeOptionsMenu from "./MarqueeOptionsMenu";
import { MarqueeView } from "./MarqueeView";
import React = require("react");
import { CollectionViewType } from "../CollectionView";
import { Timeline } from "../../animationtimeline/Timeline";
import { SnappingManager } from "../../../util/SnappingManager";

library.add(faEye as any, faTable, faPaintBrush, faExpandArrowsAlt, faCompressArrowsAlt, faCompass, faUpload, faBraille, faChalkboard, faFileUpload);

export const panZoomSchema = createSchema({
    _panX: "number",
    _panY: "number",
    scale: "number",
    arrangeScript: ScriptField,
    arrangeInit: ScriptField,
    useClusters: "boolean",
    fitToBox: "boolean",
    _xPadding: "number",         // pixels of padding on left/right of collectionfreeformview contents when fitToBox is set
    _yPadding: "number",         // pixels of padding on left/right of collectionfreeformview contents when fitToBox is set
    panTransformType: "string",
    scrollHeight: "number",
    fitX: "number",
    fitY: "number",
    fitW: "number",
    fitH: "number"
});

type PanZoomDocument = makeInterface<[typeof panZoomSchema, typeof collectionSchema, typeof documentSchema, typeof pageSchema]>;
const PanZoomDocument = makeInterface(panZoomSchema, collectionSchema, documentSchema, pageSchema);
export type collectionFreeformViewProps = {
    forceScaling?: boolean; // whether to force scaling of content (needed by ImageBox)
    viewDefDivClick?: ScriptField;
};

@observer
export class CollectionFreeFormView extends CollectionSubView<PanZoomDocument, Partial<collectionFreeformViewProps>>(PanZoomDocument) {
    private _lastX: number = 0;
    private _lastY: number = 0;
    private _downX: number = 0;
    private _downY: number = 0;
    private _inkToTextStartX: number | undefined;
    private _inkToTextStartY: number | undefined;
    private _wordPalette: Map<string, string> = new Map<string, string>();
    private _clusterDistance: number = 75;
    private _hitCluster = false;
    private _layoutComputeReaction: IReactionDisposer | undefined;
    private _layoutPoolData = new ObservableMap<string, PoolData>();
    private _layoutSizeData = new ObservableMap<string, { width?: number, height?: number }>();
    private _cachedPool: Map<string, PoolData> = new Map();
    @observable private _pullCoords: number[] = [0, 0];
    @observable private _pullDirection: string = "";

    public get displayName() { return "CollectionFreeFormView(" + this.props.Document.title?.toString() + ")"; } // this makes mobx trace() statements more descriptive
    @observable.shallow _layoutElements: ViewDefResult[] = []; // shallow because some layout items (eg pivot labels) are just generated 'divs' and can't be frozen as observables
    @observable _clusterSets: (Doc[])[] = [];
    @observable _timelineRef = React.createRef<Timeline>();

    @computed get fitToContentScaling() { return this.fitToContent ? NumCast(this.layoutDoc.fitToContentScaling, 1) : 1; }
    @computed get fitToContent() { return (this.props.fitToBox || this.Document._fitToBox) && !this.isAnnotationOverlay; }
    @computed get parentScaling() { return this.props.ContentScaling && this.fitToContent && !this.isAnnotationOverlay ? this.props.ContentScaling() : 1; }
    @computed get contentBounds() { return aggregateBounds(this._layoutElements.filter(e => e.bounds && !e.bounds.z).map(e => e.bounds!), NumCast(this.layoutDoc._xPadding, 10), NumCast(this.layoutDoc._yPadding, 10)); }
    @computed get nativeWidth() { return this.fitToContent ? 0 : NumCast(this.Document._nativeWidth, this.props.NativeWidth()); }
    @computed get nativeHeight() { return this.fitToContent ? 0 : NumCast(this.Document._nativeHeight, this.props.NativeHeight()); }
    private get isAnnotationOverlay() { return this.props.isAnnotationOverlay; }
    private get borderWidth() { return this.isAnnotationOverlay ? 0 : COLLECTION_BORDER_WIDTH; }
    private easing = () => this.props.Document.panTransformType === "Ease";
    private panX = () => this.fitToContent ? (this.contentBounds.x + this.contentBounds.r) / 2 : this.Document._panX || 0;
    private panY = () => this.fitToContent ? (this.contentBounds.y + this.contentBounds.b) / 2 : this.Document._panY || 0;
    private zoomScaling = () => (this.fitToContentScaling / this.parentScaling) * (this.fitToContent ?
        Math.min(this.props.PanelHeight() / (this.contentBounds.b - this.contentBounds.y),
            this.props.PanelWidth() / (this.contentBounds.r - this.contentBounds.x)) :
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
    private addDocument = (newBox: Doc | Doc[]) => {
        if (newBox instanceof Doc) {
            const added = this.props.addDocument(newBox);
            added && this.bringToFront(newBox);
            added && this.updateCluster(newBox);
            return added;
        } else {
            return this.props.addDocument(newBox);
            // bcz: deal with clusters
        }
    }
    private selectDocuments = (docs: Doc[]) => {
        SelectionManager.DeselectAll();
        docs.map(doc => DocumentManager.Instance.getDocumentView(doc)).map(dv => dv && SelectionManager.SelectDoc(dv, true));
    }
    public isCurrent(doc: Doc) { return (Math.abs(NumCast(doc.displayTimecode, -1) - NumCast(this.Document.currentTimecode, -1)) < 1.5 || NumCast(doc.displayTimecode, -1) === -1); }

    public getActiveDocuments = () => {
        return this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map(pair => pair.layout);
    }

    @action
    onExternalDrop = (e: React.DragEvent): Promise<void> => {
        const pt = this.getTransform().transformPoint(e.pageX, e.pageY);
        return super.onExternalDrop(e, { x: pt[0], y: pt[1] });
    }

    @undoBatch
    @action
    onInternalDrop = (e: Event, de: DragManager.DropEvent) => {
        // if (this.props.Document.isBackground) return false;
        const xf = this.getTransform();
        const xfo = this.getTransformOverlay();
        const [xp, yp] = xf.transformPoint(de.x, de.y);
        const [xpo, ypo] = xfo.transformPoint(de.x, de.y);
        const zsorted = this.childLayoutPairs.map(pair => pair.layout).slice().sort((doc1, doc2) => NumCast(doc1.zIndex) - NumCast(doc2.zIndex));
        if (super.onInternalDrop(e, de)) {
            if (de.complete.docDragData) {
                if (de.complete.docDragData.droppedDocuments.length) {
                    const firstDoc = de.complete.docDragData.droppedDocuments[0];
                    const z = NumCast(firstDoc.z);
                    const x = (z ? xpo : xp) - de.complete.docDragData.offset[0];
                    const y = (z ? ypo : yp) - de.complete.docDragData.offset[1];
                    const dropX = NumCast(firstDoc.x);
                    const dropY = NumCast(firstDoc.y);
                    const droppedDocs = de.complete.docDragData.droppedDocuments;
                    runInAction(() => {
                        zsorted.forEach((doc, index) => doc.zIndex = index + 1);
                        for (let i = 0; i < droppedDocs.length; i++) {
                            const d = droppedDocs[i];
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
                            d.isBackground === undefined && (d.zIndex = zsorted.length + 1 + i); // bringToFront
                        }
                    });

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
    @action
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
        let clusterColor = this.props.backgroundColor?.(doc);
        const cluster = NumCast(doc.cluster);
        if (this.Document.useClusters) {
            if (this._clusterSets.length <= cluster) {
                setTimeout(() => this.updateCluster(doc), 0);
            } else {
                // choose a cluster color from a palette
                const colors = ["#da42429e", "#31ea318c", "rgba(197, 87, 20, 0.55)", "#4a7ae2c4", "rgba(216, 9, 255, 0.5)", "#ff7601", "#1dffff", "yellow", "rgba(27, 130, 49, 0.55)", "rgba(0, 0, 0, 0.268)"];
                clusterColor = colors[cluster % colors.length];
                const set = this._clusterSets[cluster]?.filter(s => s.backgroundColor);
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
            // if not using a pen and in no ink mode
            if (InkingControl.Instance.selectedTool === InkTool.None) {
                this._downX = this._lastX = e.pageX;
                this._downY = this._lastY = e.pageY;
            }
            // eraser plus anything else mode
            else {
                e.stopPropagation();
                e.preventDefault();
            }
        }
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
                e.stopPropagation();
                break;
            case GestureUtils.Gestures.StartBracket:
                const start = this.getTransform().transformPoint(Math.min(...ge.points.map(p => p.X)), Math.min(...ge.points.map(p => p.Y)));
                this._inkToTextStartX = start[0];
                this._inkToTextStartY = start[1];
                console.log("start");
                break;
            case GestureUtils.Gestures.EndBracket:
                console.log("end");
                if (this._inkToTextStartX && this._inkToTextStartY) {
                    const end = this.getTransform().transformPoint(Math.max(...ge.points.map(p => p.X)), Math.max(...ge.points.map(p => p.Y)));
                    const setDocs = this.getActiveDocuments().filter(s => s.proto?.type === "text" && s.color);
                    const sets = setDocs.map((sd) => {
                        return Cast(sd.data, RichTextField)?.Text as string;
                    });
                    if (sets.length && sets[0]) {
                        this._wordPalette.clear();
                        const colors = setDocs.map(sd => FieldValue(sd.color) as string);
                        sets.forEach((st: string, i: number) => {
                            const words = st.split(",");
                            words.forEach(word => {
                                this._wordPalette.set(word, colors[i]);
                            });
                        });
                    }
                    const inks = this.getActiveDocuments().filter(doc => {
                        if (doc.type === "ink") {
                            const l = NumCast(doc.x);
                            const r = l + doc[WidthSym]();
                            const t = NumCast(doc.y);
                            const b = t + doc[HeightSym]();
                            const pass = !(this._inkToTextStartX! > r || end[0] < l || this._inkToTextStartY! > b || end[1] < t);
                            return pass;
                        }
                        return false;
                    });
                    // const inkFields = inks.map(i => Cast(i.data, InkField));
                    const strokes: InkData[] = [];
                    inks.forEach(i => {
                        const d = Cast(i.data, InkField);
                        const x = NumCast(i.x);
                        const y = NumCast(i.y);
                        const left = Math.min(...d?.inkData.map(pd => pd.X) ?? [0]);
                        const top = Math.min(...d?.inkData.map(pd => pd.Y) ?? [0]);
                        if (d) {
                            strokes.push(d.inkData.map(pd => ({ X: pd.X + x - left, Y: pd.Y + y - top })));
                        }
                    });

                    CognitiveServices.Inking.Appliers.InterpretStrokes(strokes).then((results) => {
                        console.log(results);
                        const wordResults = results.filter((r: any) => r.category === "inkWord");
                        for (const word of wordResults) {
                            const indices: number[] = word.strokeIds;
                            indices.forEach(i => {
                                const otherInks: Doc[] = [];
                                indices.forEach(i2 => i2 !== i && otherInks.push(inks[i2]));
                                inks[i].relatedInks = new List<Doc>(otherInks);
                                const uniqueColors: string[] = [];
                                Array.from(this._wordPalette.values()).forEach(c => uniqueColors.indexOf(c) === -1 && uniqueColors.push(c));
                                inks[i].alternativeColors = new List<string>(uniqueColors);
                                if (this._wordPalette.has(word.recognizedText.toLowerCase())) {
                                    inks[i].color = this._wordPalette.get(word.recognizedText.toLowerCase());
                                }
                                else if (word.alternates) {
                                    for (const alt of word.alternates) {
                                        if (this._wordPalette.has(alt.recognizedString.toLowerCase())) {
                                            inks[i].color = this._wordPalette.get(alt.recognizedString.toLowerCase());
                                            break;
                                        }
                                    }
                                }
                            });
                        }
                    });
                    this._inkToTextStartX = end[0];
                }
                break;
            case GestureUtils.Gestures.Text:
                if (ge.text) {
                    const B = this.getTransform().transformPoint(ge.points[0].X, ge.points[0].Y);
                    this.addDocument(Docs.Create.TextDocument(ge.text, { title: ge.text, x: B[0], y: B[1] }));
                    e.stopPropagation();
                }
        }
    }

    _lastTap = 0;

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)) return;

        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        this.removeMoveListeners();
        this.removeEndListeners();
    }

    onClick = (e: React.MouseEvent) => {
        if (this.layoutDoc.targetScale && (Math.abs(e.pageX - this._downX) < 3 && Math.abs(e.pageY - this._downY) < 3)) {
            if (Date.now() - this._lastTap < 300) {
                const docpt = this.getTransform().transformPoint(e.clientX, e.clientY);
                this.scaleAtPt(docpt, 1);
                e.stopPropagation();
                e.preventDefault();
            }
            this._lastTap = Date.now();
        }
    }

    @action
    pan = (e: PointerEvent | React.Touch | { clientX: number, clientY: number }): void => {
        // bcz: theres should be a better way of doing these than referencing these static instances directly
        MarqueeOptionsMenu.Instance?.fadeOut(true);// I think it makes sense for the marquee menu to go away when panned. -syip2
        PDFMenu.Instance.fadeOut(true);

        const [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
        this.setPan((this.Document._panX || 0) - dx, (this.Document._panY || 0) - dy, undefined, true);
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
                (!MarqueeView.DragMarquee || e.altKey) && this.pan(e);
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
                        // const transformed = this.getTransform().inverse().transformPoint(centerX, centerY);

                        if (!this._pullDirection) { // if we are not bezel movement
                            this.pan({ clientX: centerX, clientY: centerY });
                        } else {
                            this._pullCoords = [centerX, centerY];
                        }

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
                const screenBox = this._mainCont?.getBoundingClientRect();


                // determine if we are using a bezel movement
                if (screenBox) {
                    if ((screenBox.right - centerX) < 100) {
                        this._pullCoords = [centerX, centerY];
                        this._pullDirection = "right";
                    } else if (centerX - screenBox.left < 100) {
                        this._pullCoords = [centerX, centerY];
                        this._pullDirection = "left";
                    } else if (screenBox.bottom - centerY < 100) {
                        this._pullCoords = [centerX, centerY];
                        this._pullDirection = "bottom";
                    } else if (centerY - screenBox.top < 100) {
                        this._pullCoords = [centerX, centerY];
                        this._pullDirection = "top";
                    }
                }


                this.removeMoveListeners();
                this.addMoveListeners();
                this.removeEndListeners();
                this.addEndListeners();
                e.stopPropagation();
            }
        }
    }

    cleanUpInteractions = () => {
        switch (this._pullDirection) {
            case "left":
            case "right":
            case "top":
            case "bottom":
                CollectionDockingView.AddSplit(Docs.Create.FreeformDocument([], { title: "New Collection" }), this._pullDirection);
        }

        this._pullDirection = "";
        this._pullCoords = [0, 0];

        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        this.removeMoveListeners();
        this.removeEndListeners();
    }


    @action
    zoom = (pointX: number, pointY: number, deltaY: number): void => {
        let deltaScale = deltaY > 0 ? (1 / 1.05) : 1.05;
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
            if (!e.ctrlKey && MarqueeView.DragMarquee) this.setPan(this.panX() + e.deltaX, this.panY() + e.deltaY, "None", true);
            else this.zoom(e.clientX, e.clientY, e.deltaY);
        }
        this.props.Document.targetScale = NumCast(this.props.Document.scale);
    }

    @action
    setPan(panX: number, panY: number, panType: string = "None", clamp: boolean = false) {
        if (!this.isAnnotationOverlay && clamp) {
            // this section wraps the pan position, horizontally and/or vertically whenever the content is panned out of the viewing bounds
            const docs = this.childLayoutPairs.filter(pair => pair.layout instanceof Doc).map(pair => pair.layout);
            const measuredDocs = docs.filter(doc => doc && this.childDataProvider(doc, "")).map(doc => this.childDataProvider(doc, ""));
            if (measuredDocs.length) {
                const ranges = measuredDocs.reduce(({ xrange, yrange }, { x, y, width, height }) =>  // computes range of content
                    ({
                        xrange: { min: Math.min(xrange.min, x), max: Math.max(xrange.max, x + width) },
                        yrange: { min: Math.min(yrange.min, y), max: Math.max(yrange.max, y + height) }
                    })
                    , {
                        xrange: { min: Number.MAX_VALUE, max: -Number.MAX_VALUE },
                        yrange: { min: Number.MAX_VALUE, max: -Number.MAX_VALUE }
                    });

                const panelDim = [this.props.PanelWidth() / this.zoomScaling(), this.props.PanelHeight() / this.zoomScaling()];
                if (ranges.xrange.min >= (panX + panelDim[0] / 2)) panX = ranges.xrange.max + panelDim[0] / 2;  // snaps pan position of range of content goes out of bounds
                else if (ranges.xrange.max <= (panX - panelDim[0] / 2)) panX = ranges.xrange.min - panelDim[0] / 2;
                if (ranges.yrange.min >= (panY + panelDim[1] / 2)) panY = ranges.yrange.max + panelDim[1] / 2;
                else if (ranges.yrange.max <= (panY - panelDim[1] / 2)) panY = ranges.yrange.min - panelDim[1] / 2;
            }
        }
        if (!this.Document.lockedTransform || this.Document.inOverlay) {
            this.Document.panTransformType = panType;
            const scale = this.getLocalTransform().inverse().Scale;
            const newPanX = Math.min((1 - 1 / scale) * this.nativeWidth, Math.max(0, panX));
            const newPanY = Math.min((this.props.Document.scrollHeight !== undefined ? NumCast(this.Document.scrollHeight) : (1 - 1 / scale) * this.nativeHeight), Math.max(0, panY));
            this.Document._panX = this.isAnnotationOverlay ? newPanX : panX;
            this.Document._panY = this.isAnnotationOverlay ? newPanY : panY;
        }
    }

    bringToFront = action((doc: Doc, sendToBack?: boolean) => {
        if (sendToBack || doc.isBackground) {
            doc.zIndex = 0;
        }
        else {
            const docs = this.childLayoutPairs.map(pair => pair.layout);
            docs.slice().sort((doc1, doc2) => NumCast(doc1.zIndex) - NumCast(doc2.zIndex));
            let zlast = docs.length ? NumCast(docs[docs.length - 1].zIndex) : 1;
            if (zlast - docs.length > 100) {
                for (let i = 0; i < docs.length; i++) doc.zIndex = i + 1;
                zlast = docs.length + 1;
            }
            doc.zIndex = zlast + 1;
        }
    });

    scaleAtPt(docpt: number[], scale: number) {
        const screenXY = this.getTransform().inverse().transformPoint(docpt[0], docpt[1]);
        this.Document.panTransformType = "Ease";
        this.layoutDoc.scale = scale;
        const newScreenXY = this.getTransform().inverse().transformPoint(docpt[0], docpt[1]);
        const scrDelta = { x: screenXY[0] - newScreenXY[0], y: screenXY[1] - newScreenXY[1] };
        const newpan = this.getTransform().transformDirection(scrDelta.x, scrDelta.y);
        this.layoutDoc._panX = NumCast(this.layoutDoc._panX) - newpan[0];
        this.layoutDoc._panY = NumCast(this.layoutDoc._panY) - newpan[1];
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
                const contextHgt = Doc.AreProtosEqual(annotOn, this.props.Document) && this.props.VisibleHeight ? this.props.VisibleHeight() : NumCast(annotOn._height);
                const offset = annotOn && (contextHgt / 2 * 96 / 72);
                this.props.Document.scrollY = NumCast(doc.y) - offset;
            }

            afterFocus && setTimeout(afterFocus, 1000);
        } else {
            const layoutdoc = Doc.Layout(doc);
            const newPanX = NumCast(doc.x) + NumCast(layoutdoc._width) / 2;
            const newPanY = NumCast(doc.y) + NumCast(layoutdoc._height) / 2;
            const newState = HistoryUtil.getState();
            newState.initializers![this.Document[Id]] = { panX: newPanX, panY: newPanY };
            HistoryUtil.pushState(newState);

            const savedState = { px: this.Document._panX, py: this.Document._panY, s: this.Document.scale, pt: this.Document.panTransformType };

            // if (!willZoom && DocumentView._focusHack.length) {
            //     Doc.BrushDoc(this.props.Document);
            //     !doc.z && NumCast(this.layoutDoc.scale) < 1 && this.scaleAtPt(DocumentView._focusHack, 1); // [NumCast(doc.x), NumCast(doc.y)], 1);
            // } else {
            if (DocListCast(this.dataDoc[this.props.fieldKey]).includes(doc)) {
                if (!doc.z) this.setPan(newPanX, newPanY, "Ease", true); // docs that are floating in their collection can't be panned to from their collection -- need to propagate the pan to a parent freeform somehow
            }
            Doc.BrushDoc(this.props.Document);
            this.props.focus(this.props.Document);
            willZoom && this.setScaleToZoom(layoutdoc, scale);
            Doc.linkFollowHighlight(doc);
            //}

            afterFocus && setTimeout(() => {
                if (afterFocus?.()) {
                    this.Document._panX = savedState.px;
                    this.Document._panY = savedState.py;
                    this.Document.scale = savedState.s;
                    this.Document.panTransformType = savedState.pt;
                }
            }, 500);
        }

    }

    setScaleToZoom = (doc: Doc, scale: number = 0.75) => {
        this.Document.scale = scale * Math.min(this.props.PanelWidth() / NumCast(doc._width), this.props.PanelHeight() / NumCast(doc._height));
    }

    @computed get libraryPath() { return this.props.LibraryPath ? [...this.props.LibraryPath, this.props.Document] : []; }
    @computed get onChildClickHandler() { return this.props.childClickScript || ScriptCast(this.Document.onChildClick); }
    @computed get onChildDoubleClickHandler() { return this.props.childDoubleClickScript || ScriptCast(this.Document.onChildDoubleClick); }
    @computed get backgroundActive() { return this.layoutDoc.isBackground && (this.props.ContainingCollectionView?.active() || this.props.active()); }
    backgroundHalo = () => BoolCast(this.Document.useClusters);
    parentActive = (outsideReaction: boolean) => this.props.active(outsideReaction) || this.backgroundActive ? true : false;
    getChildDocumentViewProps(childLayout: Doc, childData?: Doc): DocumentViewProps {
        return {
            ...this.props,
            NativeHeight: returnZero,
            NativeWidth: returnZero,
            fitToBox: false,
            DataDoc: childData,
            Document: childLayout,
            LibraryPath: this.libraryPath,
            LayoutTemplate: this.props.ChildLayoutTemplate,
            LayoutTemplateString: this.props.ChildLayoutString,
            FreezeDimensions: this.props.freezeChildDimensions,
            layoutKey: undefined,
            setupDragLines: this.setupDragLines,
            rootSelected: childData ? this.rootSelected : returnFalse,
            dropAction: StrCast(this.props.Document.childDropAction) as dropActionType,
            onClick: this.onChildClickHandler,
            onDoubleClick: this.onChildDoubleClickHandler,
            ScreenToLocalTransform: childLayout.z ? this.getTransformOverlay : this.getTransform,
            renderDepth: this.props.renderDepth + 1,
            PanelWidth: childLayout[WidthSym],
            PanelHeight: childLayout[HeightSym],
            ContentScaling: returnOne,
            ContainingCollectionView: this.props.CollectionView,
            ContainingCollectionDoc: this.props.Document,
            focus: this.focusDocument,
            backgroundColor: this.getClusterColor,
            backgroundHalo: this.backgroundHalo,
            parentActive: this.parentActive,
            bringToFront: this.bringToFront,
            addDocTab: this.addDocTab,
        };
    }

    addDocTab = action((doc: Doc, where: string) => {
        if (where === "inParent") {
            if (doc instanceof Doc) {
                const pt = this.getTransform().transformPoint(NumCast(doc.x), NumCast(doc.y));
                doc.x = pt[0];
                doc.y = pt[1];
                return this.props.addDocument(doc);
            } else {
                (doc as any as Doc[]).forEach(doc => {
                    const pt = this.getTransform().transformPoint(NumCast(doc.x), NumCast(doc.y));
                    doc.x = pt[0];
                    doc.y = pt[1];
                });
                return this.props.addDocument(doc);
            }
        }
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = doc instanceof Doc ? doc : new List<Doc>(doc as any as Doc[]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    });
    getCalculatedPositions(params: { pair: { layout: Doc, data?: Doc }, index: number, collection: Doc, docs: Doc[], state: any }): PoolData {
        const result = this.Document.arrangeScript?.script.run(params, console.log);
        if (result?.success) {
            return { x: 0, y: 0, transition: "transform 1s", ...result, pair: params.pair, replica: "" };
        }
        const layoutDoc = Doc.Layout(params.pair.layout);
        const { x, y, z, color, zIndex } = params.pair.layout;
        return {
            x: NumCast(x), y: NumCast(y), z: Cast(z, "number"), color: StrCast(color), zIndex: Cast(zIndex, "number"),
            width: Cast(layoutDoc._width, "number"), height: Cast(layoutDoc._height, "number"), pair: params.pair, replica: ""
        };
    }

    viewDefsToJSX = (views: ViewDefBounds[]) => {
        return !Array.isArray(views) ? [] : views.filter(ele => this.viewDefToJSX(ele)).map(ele => this.viewDefToJSX(ele)!);
    }

    onViewDefDivClick = (e: React.MouseEvent, payload: any) => {
        (this.props.viewDefDivClick || ScriptCast(this.props.Document.onViewDefDivClick))?.script.run({ this: this.props.Document, payload });
        e.stopPropagation();
    }
    private viewDefToJSX(viewDef: ViewDefBounds): Opt<ViewDefResult> {
        const { x, y, z } = viewDef;
        const color = StrCast(viewDef.color);
        const width = Cast(viewDef.width, "number");
        const height = Cast(viewDef.height, "number");
        const transform = `translate(${x}px, ${y}px)`;
        if (viewDef.type === "text") {
            const text = Cast(viewDef.text, "string"); // don't use NumCast, StrCast, etc since we want to test for undefined below
            const fontSize = Cast(viewDef.fontSize, "number");
            return [text, x, y].some(val => val === undefined) ? undefined :
                {
                    ele: <div className="collectionFreeform-customText" key={(text || "") + x + y + z + color} style={{ width, height, color, fontSize, transform }}>
                        {text}
                    </div>,
                    bounds: viewDef
                };
        } else if (viewDef.type === "div") {
            return [x, y].some(val => val === undefined) ? undefined :
                {
                    ele: <div className="collectionFreeform-customDiv" title={viewDef.payload?.join(" ")} key={"div" + x + y + z} onClick={e => this.onViewDefDivClick(e, viewDef)}
                        style={{ width, height, backgroundColor: color, transform }} />,
                    bounds: viewDef
                };
        }
    }

    childDataProvider = computedFn(function childDataProvider(this: any, doc: Doc, replica: string) {
        return this._layoutPoolData.get(doc[Id] + (replica || ""));
    }.bind(this));
    childSizeProvider = computedFn(function childSizeProvider(this: any, doc: Doc, replica: string) {
        return this._layoutSizeData.get(doc[Id] + (replica || ""));
    }.bind(this));

    doEngineLayout(poolData: Map<string, PoolData>,
        engine: (
            poolData: Map<string, PoolData>,
            pivotDoc: Doc,
            childPairs: { layout: Doc, data?: Doc }[],
            panelDim: number[],
            viewDefsToJSX: ((views: ViewDefBounds[]) => ViewDefResult[])) => ViewDefResult[]
    ) {
        return engine(poolData, this.props.Document, this.childLayoutPairs, [this.props.PanelWidth(), this.props.PanelHeight()], this.viewDefsToJSX);
    }

    doFreeformLayout(poolData: Map<string, PoolData>) {
        const layoutDocs = this.childLayoutPairs.map(pair => pair.layout);
        const initResult = this.Document.arrangeInit && this.Document.arrangeInit.script.run({ docs: layoutDocs, collection: this.Document }, console.log);
        const state = initResult && initResult.success ? initResult.result.scriptState : undefined;
        const elements = initResult && initResult.success ? this.viewDefsToJSX(initResult.result.views) : [];

        this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map((pair, i) => {
            const pos = this.getCalculatedPositions({ pair, index: i, collection: this.Document, docs: layoutDocs, state });
            poolData.set(pair.layout[Id], pos);
        });
        return elements;
    }

    @computed get doInternalLayoutComputation() {
        TraceMobx();


        const newPool = new Map<string, PoolData>();
        const engine = this.props.layoutEngine?.() || StrCast(this.layoutDoc._layoutEngine);
        switch (engine) {
            case "pass": return { newPool, computedElementData: this.doEngineLayout(newPool, computerPassLayout) };
            case "timeline": return { newPool, computedElementData: this.doEngineLayout(newPool, computeTimelineLayout) };
            case "pivot": return { newPool, computedElementData: this.doEngineLayout(newPool, computePivotLayout) };
            case "starburst": return { newPool, computedElementData: this.doEngineLayout(newPool, computerStarburstLayout) };
        }
        return { newPool, computedElementData: this.doFreeformLayout(newPool) };
    }

    get doLayoutComputation() {
        const { newPool, computedElementData } = this.doInternalLayoutComputation;
        const array = Array.from(newPool.entries());
        runInAction(() => {
            for (let i = 0; i < array.length; i++) {
                const entry = array[i];
                const lastPos = this._cachedPool.get(entry[0]); // last computed pos
                const newPos = entry[1];
                if (!lastPos || newPos.x !== lastPos.x || newPos.y !== lastPos.y || newPos.z !== lastPos.z || newPos.zIndex !== lastPos.zIndex) {
                    this._layoutPoolData.set(entry[0], newPos);
                }
                if (!lastPos || newPos.height !== lastPos.height || newPos.width !== lastPos.width) {
                    this._layoutSizeData.set(entry[0], { width: newPos.width, height: newPos.height });
                }
            }
        });
        this._cachedPool.clear();
        Array.from(newPool.entries()).forEach(k => this._cachedPool.set(k[0], k[1]));
        const elements: ViewDefResult[] = computedElementData.slice();
        const engine = this.props.layoutEngine?.() || StrCast(this.props.Document._layoutEngine);
        Array.from(newPool.entries()).filter(entry => this.isCurrent(entry[1].pair.layout)).forEach(entry =>
            elements.push({
                ele: <CollectionFreeFormDocumentView
                    key={entry[1].pair.layout[Id] + (entry[1].replica || "")}
                    {...this.getChildDocumentViewProps(entry[1].pair.layout, entry[1].pair.data)}
                    replica={entry[1].replica}
                    dataProvider={this.childDataProvider}
                    sizeProvider={this.childSizeProvider}
                    pointerEvents={
                        this.backgroundActive ?
                            true :
                            (this.props.viewDefDivClick || (engine === "pass" && !this.props.isSelected(true))) ? false : undefined}
                    jitterRotation={NumCast(this.props.Document._jitterRotation)}
                    //fitToBox={this.props.fitToBox || BoolCast(this.props.freezeChildDimensions)} // bcz: check this
                    fitToBox={BoolCast(this.props.freezeChildDimensions)} // bcz: check this
                    FreezeDimensions={BoolCast(this.props.freezeChildDimensions)}
                />,
                bounds: this.childDataProvider(entry[1].pair.layout, entry[1].replica)
            }));

        return elements;
    }

    componentDidMount() {
        super.componentDidMount?.();
        this._layoutComputeReaction = reaction(() => this.doLayoutComputation,
            (elements) => this._layoutElements = elements || [],
            { fireImmediately: true, name: "doLayout" });
    }
    componentWillUnmount() {
        this._layoutComputeReaction?.();
    }
    @computed get views() { return this._layoutElements.filter(ele => ele.bounds && !ele.bounds.z).map(ele => ele.ele); }
    elementFunc = () => this._layoutElements;

    @action
    onCursorMove = (e: React.PointerEvent) => {
        super.setCursorPosition(this.getTransform().transformPoint(e.clientX, e.clientY));
    }

    promoteCollection = undoBatch(action(() => {
        const childDocs = this.childDocs.slice();
        childDocs.forEach(doc => {
            const scr = this.getTransform().inverse().transformPoint(NumCast(doc.x), NumCast(doc.y));
            doc.x = scr?.[0];
            doc.y = scr?.[1];
        });
        this.props.addDocTab(childDocs as any as Doc, "inParent");
        this.props.ContainingCollectionView?.removeDocument(this.props.Document);
    }));
    layoutDocsInGrid = () => {
        UndoManager.RunInBatch(() => {
            const docs = this.childLayoutPairs;
            const startX = this.Document._panX || 0;
            let x = startX;
            let y = this.Document._panY || 0;
            let i = 0;
            const width = Math.max(...docs.map(doc => NumCast(doc.layout._width)));
            const height = Math.max(...docs.map(doc => NumCast(doc.layout._height)));
            docs.forEach(pair => {
                pair.layout.x = x;
                pair.layout.y = y;
                x += width + 20;
                if (++i === 6) {
                    i = 0;
                    x = startX;
                    y += height + 20;
                }
            });
        }, "arrange contents");
    }

    private thumbIdentifier?: number;

    onContextMenu = (e: React.MouseEvent) => {
        if (this.props.children && this.props.annotationsKey) return;
        const options = ContextMenu.Instance.findByDescription("Options...");
        const optionItems: ContextMenuProps[] = options && "subitems" in options ? options.subitems : [];

        optionItems.push({ description: "reset view", event: () => { this.props.Document._panX = this.props.Document._panY = 0; this.props.Document.scale = 1; }, icon: "compress-arrows-alt" });
        optionItems.push({ description: `${this.Document._LODdisable ? "Enable LOD" : "Disable LOD"}`, event: () => this.Document._LODdisable = !this.Document._LODdisable, icon: "table" });
        optionItems.push({ description: `${this.fitToContent ? "Unset" : "Set"} Fit To Container`, event: () => this.Document._fitToBox = !this.fitToContent, icon: !this.fitToContent ? "expand-arrows-alt" : "compress-arrows-alt" });
        optionItems.push({ description: `${this.Document.useClusters ? "Uncluster" : "Use Clusters"}`, event: () => this.updateClusters(!this.Document.useClusters), icon: "braille" });
        this.props.ContainingCollectionView && optionItems.push({ description: "Promote Collection", event: this.promoteCollection, icon: "table" });
        optionItems.push({ description: "Arrange contents in grid", event: this.layoutDocsInGrid, icon: "table" });
        // layoutItems.push({ description: "Analyze Strokes", event: this.analyzeStrokes, icon: "paint-brush" });
        optionItems.push({ description: "Jitter Rotation", event: action(() => this.props.Document._jitterRotation = (this.props.Document._jitterRotation ? 0 : 10)), icon: "paint-brush" });
        optionItems.push({
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
                                this.props.addDocument?.(doc);
                            }
                        }
                    }
                };
                input.click();
            }
        });
        ContextMenu.Instance.addItem({ description: "Options...", subitems: optionItems, icon: "eye" });


        ContextMenu.Instance.addItem({
            description: (this._timelineVisible ? "Close" : "Open") + " Animation Timeline", event: action(() => {
                this._timelineVisible = !this._timelineVisible;
            }), icon: this._timelineVisible ? faEyeSlash : faEye
        });
    }
    @observable _timelineVisible = false;

    intersectRect(r1: { left: number, top: number, width: number, height: number },
        r2: { left: number, top: number, width: number, height: number }) {
        return !(r2.left > r1.left + r1.width || r2.left + r2.width < r1.left || r2.top > r1.top + r1.height || r2.top + r2.height < r1.top);
    }

    @action
    setupDragLines = () => {
        const activeDocs = this.getActiveDocuments();
        if (activeDocs.length > 50) {
            DragManager.SetSnapLines([], []);
            return;
        }
        const size = this.getTransform().transformDirection(this.props.PanelWidth(), this.props.PanelHeight());
        const selRect = { left: this.panX() - size[0] / 2, top: this.panY() - size[1] / 2, width: size[0], height: size[1] };
        const docDims = (doc: Doc) => ({ left: NumCast(doc.x), top: NumCast(doc.y), width: NumCast(doc._width), height: NumCast(doc._height) });
        const isDocInView = (doc: Doc, rect: { left: number, top: number, width: number, height: number }) => {
            if (this.intersectRect(docDims(doc), rect)) {
                snappableDocs.push(doc);
            }
        };
        const snappableDocs: Doc[] = [];  // the set of documents in the visible viewport that we will try to snap to;
        const otherBounds = { left: this.panX(), top: this.panY(), width: Math.abs(size[0]), height: Math.abs(size[1]) };
        this.getActiveDocuments().filter(doc => !doc.isBackground && doc.z === undefined).map(doc => isDocInView(doc, selRect));  // first see if there are any foreground docs to snap to
        !snappableDocs.length && this.getActiveDocuments().filter(doc => doc.z === undefined).map(doc => isDocInView(doc, selRect)); // if not, see if there are background docs to snap to
        !snappableDocs.length && this.getActiveDocuments().filter(doc => doc.z !== undefined).map(doc => isDocInView(doc, otherBounds)); // if not, then why not snap to floating docs

        const horizLines: number[] = [];
        const vertLines: number[] = [];
        snappableDocs.filter(doc => !DragManager.docsBeingDragged.includes(Cast(doc.rootDocument, Doc, null) || doc)).forEach(doc => {
            const { left, top, width, height } = docDims(doc);
            const topLeftInScreen = this.getTransform().inverse().transformPoint(left, top);
            const docSize = this.getTransform().inverse().transformDirection(width, height);

            horizLines.push(topLeftInScreen[1], topLeftInScreen[1] + docSize[1] / 2, topLeftInScreen[1] + docSize[1]); // horiz center line
            vertLines.push(topLeftInScreen[0], topLeftInScreen[0] + docSize[0] / 2, topLeftInScreen[0] + docSize[0]);// right line
        });
        DragManager.SetSnapLines(horizLines, vertLines);
    }
    onPointerOver = (e: React.PointerEvent) => {
        if (SnappingManager.GetIsDragging()) {
            this.setupDragLines();
        }
        e.stopPropagation();
    }

    @observable private _hLines: number[] | undefined;
    @observable private _vLines: number[] | undefined;

    private childViews = () => {
        const children = typeof this.props.children === "function" ? (this.props.children as any)() as JSX.Element[] : [];
        return [
            ...children,
            ...this.views,
        ];
    }

    children = () => {
        const eles: JSX.Element[] = [];
        eles.push(...this.childViews());
        eles.push(<CollectionFreeFormRemoteCursors {...this.props} key="remoteCursors" />);
        return eles;
    }
    @computed get placeholder() {
        return <div className="collectionfreeformview-placeholder" style={{ background: this.Document.backgroundColor }}>
            <span className="collectionfreeformview-placeholderSpan">{this.props.Document.title?.toString()}</span>
        </div>;
    }

    _nudgeTime = 0;
    nudge = action((x: number, y: number) => {
        if (this.props.ContainingCollectionDoc?._viewType !== CollectionViewType.Freeform) { // bcz: this isn't ideal, but want to try it out...
            this.setPan(NumCast(this.layoutDoc._panX) + this.props.PanelWidth() / 2 * x / this.zoomScaling(),
                NumCast(this.layoutDoc._panY) + this.props.PanelHeight() / 2 * (-y) / this.zoomScaling(), "Ease", true);
            this._nudgeTime = Date.now();
            setTimeout(() => (Date.now() - this._nudgeTime >= 500) && (this.Document.panTransformType = undefined), 500);
            return true;
        }
        return false;
    });
    @computed get marqueeView() {
        return <MarqueeView {...this.props} nudge={this.nudge} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments} addDocument={this.addDocument}
            addLiveTextDocument={this.addLiveTextBox} getContainerTransform={this.getContainerTransform} getTransform={this.getTransform} isAnnotationOverlay={this.isAnnotationOverlay}>
            <CollectionFreeFormViewPannableContents centeringShiftX={this.centeringShiftX} centeringShiftY={this.centeringShiftY} shifted={!this.nativeHeight && !this.isAnnotationOverlay}
                easing={this.easing} viewDefDivClick={this.props.viewDefDivClick} zoomScaling={this.zoomScaling} panX={this.panX} panY={this.panY}>
                {this.children}
            </CollectionFreeFormViewPannableContents>
            {this._timelineVisible ? <Timeline ref={this._timelineRef} {...this.props} /> : (null)}
        </MarqueeView>;
    }

    @computed get contentScaling() {
        if (this.props.annotationsKey && !this.props.forceScaling) return 0;
        const nw = NumCast(this.Document._nativeWidth, this.props.NativeWidth());
        const nh = NumCast(this.Document._nativeHeight, this.props.NativeHeight());
        const hscale = nh ? this.props.PanelHeight() / nh : 1;
        const wscale = nw ? this.props.PanelWidth() / nw : 1;
        return wscale < hscale ? wscale : hscale;
    }
    @computed get backgroundEvents() { return this.layoutDoc.isBackground && SnappingManager.GetIsDragging(); }
    render() {
        TraceMobx();
        const clientRect = this._mainCont?.getBoundingClientRect();
        // update the actual dimensions of the collection so that they can inquired (e.g., by a minimap)
        // this.Document.fitX = this.contentBounds && this.contentBounds.x;
        // this.Document.fitY = this.contentBounds && this.contentBounds.y;
        // this.Document.fitW = this.contentBounds && (this.contentBounds.r - this.contentBounds.x);
        // this.Document.fitH = this.contentBounds && (this.contentBounds.b - this.contentBounds.y);
        // if isAnnotationOverlay is set, then children will be stored in the extension document for the fieldKey.
        // otherwise, they are stored in fieldKey.  All annotations to this document are stored in the extension document
        return <div className={"collectionfreeformview-container"}
            ref={this.createDashEventsTarget}
            onPointerOver={this.onPointerOver}
            onWheel={this.onPointerWheel} onClick={this.onClick}  //pointerEvents: DraggingManager.GetIsDragging() ? "all" : undefined,
            onPointerDown={this.onPointerDown} onPointerMove={this.onCursorMove} onDrop={this.onExternalDrop.bind(this)} onContextMenu={this.onContextMenu}
            style={{
                pointerEvents: this.backgroundEvents ? "all" : undefined,
                transform: this.contentScaling ? `scale(${this.contentScaling})` : "",
                transformOrigin: this.contentScaling ? "left top" : "",
                width: this.contentScaling ? `${100 / this.contentScaling}%` : "",
                height: this.contentScaling ? `${100 / this.contentScaling}%` : this.isAnnotationOverlay ? (this.props.Document.scrollHeight ? this.Document.scrollHeight : "100%") : this.props.PanelHeight()
            }}>
            {!this.Document._LODdisable && !this.props.active() && !this.props.isAnnotationOverlay && !this.props.annotationsKey && this.props.renderDepth > 0 ?
                this.placeholder : this.marqueeView}
            <CollectionFreeFormOverlayView elements={this.elementFunc} />

            <div className={"pullpane-indicator"}
                style={{
                    display: this._pullDirection ? "block" : "none",
                    top: clientRect ? this._pullDirection === "bottom" ? this._pullCoords[1] - clientRect.y : 0 : "auto",
                    // left: clientRect ? this._pullDirection === "right" ? this._pullCoords[0] - clientRect.x - MainView.Instance.flyoutWidth : 0 : "auto",
                    left: clientRect ? this._pullDirection === "right" ? this._pullCoords[0] - clientRect.x : 0 : "auto",
                    width: clientRect ? this._pullDirection === "left" ? this._pullCoords[0] - clientRect.left : this._pullDirection === "right" ? clientRect.right - this._pullCoords[0] : clientRect.width : 0,
                    height: clientRect ? this._pullDirection === "top" ? this._pullCoords[1] - clientRect.top : this._pullDirection === "bottom" ? clientRect.bottom - this._pullCoords[1] : clientRect.height : 0,

                }}>
            </div>
            {// uncomment to show snap lines
                <div className="snapLines" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                    <svg style={{ width: "100%", height: "100%" }}>
                        {this._hLines?.map(l => <line x1="0" y1={l} x2="1000" y2={l} stroke="black" />)}
                        {this._vLines?.map(l => <line y1="0" x1={l} y2="1000" x2={l} stroke="black" />)}
                    </svg>
                </div>}
        </div >;
    }
}

interface CollectionFreeFormOverlayViewProps {
    elements: () => ViewDefResult[];
}

@observer
class CollectionFreeFormOverlayView extends React.Component<CollectionFreeFormOverlayViewProps>{
    render() {
        return this.props.elements().filter(ele => ele.bounds?.z).map(ele => ele.ele);
    }
}

interface CollectionFreeFormViewPannableContentsProps {
    centeringShiftX: () => number;
    centeringShiftY: () => number;
    panX: () => number;
    panY: () => number;
    zoomScaling: () => number;
    easing: () => boolean;
    viewDefDivClick?: ScriptField;
    children: () => JSX.Element[];
    shifted: boolean;
}

@observer
class CollectionFreeFormViewPannableContents extends React.Component<CollectionFreeFormViewPannableContentsProps>{
    render() {
        const freeformclass = "collectionfreeformview" + (this.props.viewDefDivClick ? "-viewDef" : (this.props.easing() ? "-ease" : "-none"));
        const cenx = this.props.centeringShiftX();
        const ceny = this.props.centeringShiftY();
        const panx = -this.props.panX();
        const pany = -this.props.panY();
        const zoom = this.props.zoomScaling();
        return <div className={freeformclass}
            style={{
                width: this.props.shifted ? 0 : undefined, height: this.props.shifted ? 0 : undefined,
                transform: `translate(${cenx}px, ${ceny}px) scale(${zoom}) translate(${panx}px, ${pany}px)`
            }}>
            {this.props.children()}
        </div>;
    }
}