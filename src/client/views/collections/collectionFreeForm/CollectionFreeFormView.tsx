import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { computedFn } from "mobx-utils";
import { Doc, HeightSym, Opt, StrListCast, WidthSym } from "../../../../fields/Doc";
import { collectionSchema, documentSchema } from "../../../../fields/documentSchemas";
import { Id } from "../../../../fields/FieldSymbols";
import { InkData, InkField, InkTool } from "../../../../fields/InkField";
import { List } from "../../../../fields/List";
import { ObjectField } from "../../../../fields/ObjectField";
import { RichTextField } from "../../../../fields/RichTextField";
import { createSchema, listSpec, makeInterface } from "../../../../fields/Schema";
import { ScriptField } from "../../../../fields/ScriptField";
import { BoolCast, Cast, FieldValue, NumCast, ScriptCast, StrCast } from "../../../../fields/Types";
import { TraceMobx } from "../../../../fields/util";
import { GestureUtils } from "../../../../pen-gestures/GestureUtils";
import { aggregateBounds, emptyFunction, intersectRect, returnFalse, setupMoveUpEvents, Utils } from "../../../../Utils";
import { CognitiveServices } from "../../../cognitive_services/CognitiveServices";
import { DocServer } from "../../../DocServer";
import { Docs, DocUtils } from "../../../documents/Documents";
import { CurrentUserUtils } from "../../../util/CurrentUserUtils";
import { DocumentManager } from "../../../util/DocumentManager";
import { DragManager, dropActionType } from "../../../util/DragManager";
import { HistoryUtil } from "../../../util/History";
import { InteractionUtils } from "../../../util/InteractionUtils";
import { LinkManager } from "../../../util/LinkManager";
import { SearchUtil } from "../../../util/SearchUtil";
import { SelectionManager } from "../../../util/SelectionManager";
import { SnappingManager } from "../../../util/SnappingManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from "../../../views/globalCssVariables.scss";
import { Timeline } from "../../animationtimeline/Timeline";
import { ContextMenu } from "../../ContextMenu";
import { DocumentDecorations } from "../../DocumentDecorations";
import { ActiveArrowEnd, ActiveArrowStart, ActiveDash, ActiveFillColor, ActiveInkBezierApprox, ActiveInkColor, ActiveInkWidth } from "../../InkingStroke";
import { LightboxView } from "../../LightboxView";
import { CollectionFreeFormDocumentView } from "../../nodes/CollectionFreeFormDocumentView";
import { DocFocusOptions, DocumentView, DocumentViewProps, ViewAdjustment, ViewSpecPrefix } from "../../nodes/DocumentView";
import { FormattedTextBox } from "../../nodes/formattedText/FormattedTextBox";
import { pageSchema } from "../../nodes/ImageBox";
import { PresBox } from "../../nodes/PresBox";
import { StyleLayers, StyleProp } from "../../StyleProvider";
import { CollectionDockingView } from "../CollectionDockingView";
import { CollectionSubView } from "../CollectionSubView";
import { CollectionViewType } from "../CollectionView";
import { computePivotLayout, computerPassLayout, computerStarburstLayout, computeTimelineLayout, PoolData, ViewDefBounds, ViewDefResult } from "./CollectionFreeFormLayoutEngines";
import { CollectionFreeFormRemoteCursors } from "./CollectionFreeFormRemoteCursors";
import "./CollectionFreeFormView.scss";
import { MarqueeView } from "./MarqueeView";
import React = require("react");

export const panZoomSchema = createSchema({
    _panX: "number",
    _panY: "number",
    _currentTimecode: "number",
    _timecodeToShow: "number",
    _currentFrame: "number",
    _useClusters: "boolean",
    _viewTransition: "string",
    _xPadding: "number",         // pixels of padding on left/right of collectionfreeformview contents when fitToBox is set
    _yPadding: "number",         // pixels of padding on left/right of collectionfreeformview contents when fitToBox is set
    _fitToBox: "boolean",
    scrollHeight: "number"    // this will be set when the collection is an annotation overlay for a PDF/Webpage
});

type PanZoomDocument = makeInterface<[typeof panZoomSchema, typeof collectionSchema, typeof documentSchema, typeof pageSchema]>;
const PanZoomDocument = makeInterface(panZoomSchema, collectionSchema, documentSchema, pageSchema);
export type collectionFreeformViewProps = {
    annotationLayerHostsContent?: boolean; // whether to force scaling of content (needed by ImageBox)
    viewDefDivClick?: ScriptField;
    childPointerEvents?: boolean;
    scaleField?: string;
    noOverlay?: boolean; // used to suppress docs in the overlay (z) layer (ie, for minimap since overlay doesn't scale)
    engineProps?: any;
};

@observer
export class CollectionFreeFormView extends CollectionSubView<PanZoomDocument, Partial<collectionFreeformViewProps>>(PanZoomDocument) {
    public get displayName() { return "CollectionFreeFormView(" + this.props.Document.title?.toString() + ")"; } // this makes mobx trace() statements more descriptive

    private _lastNudge: any;
    private _lastX: number = 0;
    private _lastY: number = 0;
    private _downX: number = 0;
    private _downY: number = 0;
    private _inkToTextStartX: number | undefined;
    private _inkToTextStartY: number | undefined;
    private _wordPalette: Map<string, string> = new Map<string, string>();
    private _clusterDistance: number = 75;
    private _hitCluster: number = -1;
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _layoutPoolData = observable.map<string, PoolData>();
    private _layoutSizeData = observable.map<string, { width?: number, height?: number }>();
    private _cachedPool: Map<string, PoolData> = new Map();
    private _lastTap = 0;

    private get isAnnotationOverlay() { return this.props.isAnnotationOverlay; }
    private get scaleFieldKey() { return this.props.scaleField || "_viewScale"; }
    private get borderWidth() { return this.isAnnotationOverlay ? 0 : COLLECTION_BORDER_WIDTH; }

    @observable.shallow _layoutElements: ViewDefResult[] = []; // shallow because some layout items (eg pivot labels) are just generated 'divs' and can't be frozen as observables
    @observable _viewTransition: number = 0;  // sets the pan/zoom transform ease time- used by nudge(), focus() etc to smoothly zoom/pan.  set to 0 to use document's transition time or default of 0
    @observable _hLines: number[] | undefined;
    @observable _vLines: number[] | undefined;
    @observable _pullCoords: number[] = [0, 0];
    @observable _pullDirection: string = "";
    @observable _showAnimTimeline = false;
    @observable _clusterSets: (Doc[])[] = [];
    @observable _timelineRef = React.createRef<Timeline>();
    @observable _marqueeRef = React.createRef<HTMLDivElement>();
    @observable _keyframeEditing = false;
    @observable _focusFilters: Opt<string[]>; // docFilters that are overridden when previewing a link to an anchor which has docFilters set on it
    @observable _focusRangeFilters: Opt<string[]>; // docRangeFilters that are overridden when previewing a link to an anchor which has docRangeFilters set on it
    @observable ChildDrag: DocumentView | undefined; // child document view being dragged.  needed to update drop areas of groups when a group item is dragged.

    @computed get views() { return this._layoutElements.filter(ele => ele.bounds && !ele.bounds.z).map(ele => ele.ele); }
    @computed get backgroundEvents() { return this.props.layerProvider?.(this.layoutDoc) === false && SnappingManager.GetIsDragging(); }
    @computed get backgroundActive() { return this.props.layerProvider?.(this.layoutDoc) === false && (this.props.ContainingCollectionView?.isContentActive() || this.props.isContentActive()); }
    @computed get fitToContentVals() {
        return {
            bounds: { ...this.contentBounds, cx: (this.contentBounds.x + this.contentBounds.r) / 2, cy: (this.contentBounds.y + this.contentBounds.b) / 2 },
            scale: !this.childDocs.length ? 1 :
                Math.min(this.props.PanelHeight() / (this.contentBounds.b - this.contentBounds.y),
                    this.props.PanelWidth() / (this.contentBounds.r - this.contentBounds.x))
        };
    }
    @computed get fitToContent() { return (this.props.fitContentsToDoc?.() || this.Document._fitToBox) && !this.isAnnotationOverlay; }
    @computed get contentBounds() { return aggregateBounds(this._layoutElements.filter(e => e.bounds && !e.bounds.z).map(e => e.bounds!), NumCast(this.layoutDoc._xPadding, 10), NumCast(this.layoutDoc._yPadding, 10)); }
    @computed get nativeWidth() { return this.fitToContent ? 0 : Doc.NativeWidth(this.Document); }
    @computed get nativeHeight() { return this.fitToContent ? 0 : Doc.NativeHeight(this.Document); }
    @computed get cachedCenteringShiftX(): number {
        const scaling = this.fitToContent || !this.contentScaling ? 1 : this.contentScaling;
        return this.props.isAnnotationOverlay ? 0 : this.props.PanelWidth() / 2 / scaling;  // shift so pan position is at center of window for non-overlay collections
    }
    @computed get cachedCenteringShiftY(): number {
        const scaling = this.fitToContent || !this.contentScaling ? 1 : this.contentScaling;
        return this.props.isAnnotationOverlay ? 0 : this.props.PanelHeight() / 2 / scaling;// shift so pan position is at center of window for non-overlay collections
    }
    @computed get cachedGetLocalTransform(): Transform {
        return Transform.Identity().scale(1 / this.zoomScaling()).translate(this.panX(), this.panY());
    }
    @computed get cachedGetContainerTransform(): Transform {
        return this.props.ScreenToLocalTransform().translate(-this.borderWidth, -this.borderWidth);
    }
    @computed get cachedGetTransform(): Transform {
        return this.getTransformOverlay().translate(- this.cachedCenteringShiftX, - this.cachedCenteringShiftY).transform(this.cachedGetLocalTransform);
    }

    @action setKeyFrameEditing = (set: boolean) => this._keyframeEditing = set;
    getKeyFrameEditing = () => this._keyframeEditing;
    onChildClickHandler = () => this.props.childClickScript || ScriptCast(this.Document.onChildClick);
    onChildDoubleClickHandler = () => this.props.childDoubleClickScript || ScriptCast(this.Document.onChildDoubleClick);
    elementFunc = () => this._layoutElements;
    shrinkWrap = () => {
        const vals = this.fitToContentVals;
        this.layoutDoc._panX = vals.bounds.cx;
        this.layoutDoc._panY = vals.bounds.cy;
        this.layoutDoc._viewScale = vals.scale;
    }
    freeformData = (force?: boolean) => this.fitToContent || force ? this.fitToContentVals : undefined;
    freeformDocFilters = () => this._focusFilters || this.docFilters();
    freeformRangeDocFilters = () => this._focusRangeFilters || this.docRangeFilters();
    reverseNativeScaling = () => this.fitToContent ? true : false;
    panX = () => this.freeformData()?.bounds.cx ?? NumCast(this.Document._panX);
    panY = () => this.freeformData()?.bounds.cy ?? NumCast(this.Document._panY);
    zoomScaling = () => (this.freeformData()?.scale ?? NumCast(this.Document[this.scaleFieldKey], 1));
    contentTransform = () => `translate(${this.cachedCenteringShiftX}px, ${this.cachedCenteringShiftY}px) scale(${this.zoomScaling()}) translate(${-this.panX()}px, ${-this.panY()}px)`;
    getTransform = () => this.cachedGetTransform.copy();
    getLocalTransform = () => this.cachedGetLocalTransform.copy();
    getContainerTransform = () => this.cachedGetContainerTransform.copy();
    getTransformOverlay = () => this.getContainerTransform().translate(1, 1);
    getActiveDocuments = () => this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map(pair => pair.layout);
    addLiveTextBox = (newBox: Doc) => {
        FormattedTextBox.SelectOnLoad = newBox[Id];// track the new text box so we can give it a prop that tells it to focus itself when it's displayed
        this.addDocument(newBox);
    }
    selectDocuments = (docs: Doc[]) => {
        SelectionManager.DeselectAll();
        docs.map(doc => DocumentManager.Instance.getDocumentView(doc, this.props.CollectionView)).map(dv => dv && SelectionManager.SelectView(dv, true));
    }
    addDocument = (newBox: Doc | Doc[]) => {
        let retVal = false;
        if (newBox instanceof Doc) {
            if (retVal = this.props.addDocument?.(newBox) || false) {
                this.bringToFront(newBox);
                this.updateCluster(newBox);
            }
        } else {
            retVal = this.props.addDocument?.(newBox) || false;
            // bcz: deal with clusters
        }
        if (retVal) {
            const newBoxes = (newBox instanceof Doc) ? [newBox] : newBox;
            for (const newBox of newBoxes) {
                if (newBox.activeFrame !== undefined) {
                    const vals = CollectionFreeFormDocumentView.animFields.map(field => newBox[field]);
                    CollectionFreeFormDocumentView.animFields.forEach(field => delete newBox[`${field}-indexed`]);
                    CollectionFreeFormDocumentView.animFields.forEach(field => delete newBox[field]);
                    delete newBox.activeFrame;
                    CollectionFreeFormDocumentView.animFields.forEach((field, i) => field !== "opacity" && (newBox[field] = vals[i]));
                }
            }
            if (this.Document._currentFrame !== undefined && !this.props.isAnnotationOverlay) {
                CollectionFreeFormDocumentView.setupKeyframes(newBoxes, this.Document._currentFrame, true);
            }
        }
        return retVal;
    }

    updateGroupBounds = () => {
        if (!this.props.Document._isGroup) return;
        const clist = this.childDocs.map(cd => ({ x: NumCast(cd.x), y: NumCast(cd.y), width: cd[WidthSym](), height: cd[HeightSym]() }));
        const cbounds = aggregateBounds(clist, 0, 0);
        const c = [NumCast(this.layoutDoc.x) + this.layoutDoc[WidthSym]() / 2, NumCast(this.layoutDoc.y) + this.layoutDoc[HeightSym]() / 2];
        const p = [NumCast(this.layoutDoc._panX), NumCast(this.layoutDoc._panY)];
        const pbounds = {
            x: (cbounds.x - p[0]) * this.zoomScaling() + c[0], y: (cbounds.y - p[1]) * this.zoomScaling() + c[1],
            r: (cbounds.r - p[0]) * this.zoomScaling() + c[0], b: (cbounds.b - p[1]) * this.zoomScaling() + c[1]
        };

        this.layoutDoc._width = (pbounds.r - pbounds.x);
        this.layoutDoc._height = (pbounds.b - pbounds.y);
        this.layoutDoc._panX = (cbounds.r + cbounds.x) / 2;
        this.layoutDoc._panY = (cbounds.b + cbounds.y) / 2;
        this.layoutDoc.x = pbounds.x;
        this.layoutDoc.y = pbounds.y;
    }

    isCurrent(doc: Doc) {
        const dispTime = NumCast(doc._timecodeToShow, -1);
        const endTime = NumCast(doc._timecodeToHide, dispTime + 1.5);
        const curTime = NumCast(this.Document._currentTimecode, -1);
        return dispTime === -1 || ((curTime - dispTime) >= -1e-4 && curTime <= endTime);
    }

    @action
    internalDocDrop(e: Event, de: DragManager.DropEvent, docDragData: DragManager.DocumentDragData, xp: number, yp: number) {
        if (!de.embedKey && !this.ChildDrag && this.props.layerProvider?.(this.props.Document) !== false && this.props.Document._isGroup) return false;
        if (!super.onInternalDrop(e, de)) return false;
        const refDoc = docDragData.droppedDocuments[0];
        const [xpo, ypo] = this.getTransformOverlay().transformPoint(de.x, de.y);
        const z = NumCast(refDoc.z);
        const x = (z ? xpo : xp) - docDragData.offset[0];
        const y = (z ? ypo : yp) - docDragData.offset[1];
        const zsorted = this.childLayoutPairs.map(pair => pair.layout).slice().sort((doc1, doc2) => NumCast(doc1.zIndex) - NumCast(doc2.zIndex));
        zsorted.forEach((doc, index) => doc.zIndex = doc.isInkMask ? 5000 : index + 1);
        const dvals = CollectionFreeFormDocumentView.getValues(refDoc, NumCast(refDoc.activeFrame, 1000));
        const dropPos = this.Document._currentFrame !== undefined ? [dvals.x || 0, dvals.y || 0] : [NumCast(refDoc.x), NumCast(refDoc.y)];
        for (let i = 0; i < docDragData.droppedDocuments.length; i++) {
            const d = docDragData.droppedDocuments[i];
            const layoutDoc = Doc.Layout(d);
            if (this.Document._currentFrame !== undefined) {
                CollectionFreeFormDocumentView.setupKeyframes([d], this.Document._currentFrame, false);
                const vals = CollectionFreeFormDocumentView.getValues(d, NumCast(d.activeFrame, 1000));
                vals.x = x + (vals.x || 0) - dropPos[0];
                vals.y = y + (vals.y || 0) - dropPos[1];
                vals._scrollTop = this.Document.editScrollProgressivize ? vals._scrollTop : undefined;
                CollectionFreeFormDocumentView.setValues(this.Document._currentFrame, d, vals);
            } else {
                d.x = x + NumCast(d.x) - dropPos[0];
                d.y = y + NumCast(d.y) - dropPos[1];
            }
            const nd = [Doc.NativeWidth(layoutDoc), Doc.NativeHeight(layoutDoc)];
            layoutDoc._width = NumCast(layoutDoc._width, 300);
            layoutDoc._height = NumCast(layoutDoc._height, nd[0] && nd[1] ? nd[1] / nd[0] * NumCast(layoutDoc._width) : 300);
            !StrListCast(d._layerTags).includes(StyleLayers.Background) && (d._raiseWhenDragged === undefined ? Doc.UserDoc()._raiseWhenDragged : d._raiseWhenDragged) && (d.zIndex = zsorted.length + 1 + i); // bringToFront
        }

        this.updateGroupBounds();

        (docDragData.droppedDocuments.length === 1 || de.shiftKey) && this.updateClusterDocs(docDragData.droppedDocuments);
        return true;
    }

    @undoBatch
    internalAnchorAnnoDrop(e: Event, annoDragData: DragManager.AnchorAnnoDragData, xp: number, yp: number) {
        const dropCreator = annoDragData.dropDocCreator;
        annoDragData.dropDocCreator = (annotationOn: Doc | undefined) => {
            const dropDoc = dropCreator(annotationOn);
            if (dropDoc) {
                dropDoc.x = xp - annoDragData.offset[0];
                dropDoc.y = yp - annoDragData.offset[1];
                this.bringToFront(dropDoc);
            }
            return dropDoc || this.rootDoc;
        };
        return true;
    }

    @undoBatch
    internalLinkDrop(e: Event, de: DragManager.DropEvent, linkDragData: DragManager.LinkDragData, xp: number, yp: number) {
        if (linkDragData.linkDragView.props.docViewPath().includes(this.props.docViewPath().lastElement())) { // dragged document is a child of this collection
            if (!linkDragData.linkDragView.props.CollectionFreeFormDocumentView?.() || linkDragData.dragDocument.context !== this.props.Document) { // if the source doc view's context isn't this same freeformcollectionlinkDragData.dragDocument.context === this.props.Document
                const source = Docs.Create.TextDocument("", { _width: 200, _height: 75, x: xp, y: yp, title: "dropped annotation" });
                this.props.addDocument?.(source);
                de.complete.linkDocument = DocUtils.MakeLink({ doc: source }, { doc: linkDragData.linkSourceGetAnchor() }, "doc annotation", ""); // TODODO this is where in text links get passed
            }
            e.stopPropagation();  //  do nothing if link is dropped into any freeform view parent of dragged document
            return true;
        }
        return false;
    }

    onInternalDrop = (e: Event, de: DragManager.DropEvent) => {
        const [xp, yp] = this.getTransform().transformPoint(de.x, de.y);
        if (de.complete.annoDragData?.dragDocument && super.onInternalDrop(e, de)) return this.internalAnchorAnnoDrop(e, de.complete.annoDragData, xp, yp);
        else if (de.complete.linkDragData) return this.internalLinkDrop(e, de, de.complete.linkDragData, xp, yp);
        else if (de.complete.docDragData?.droppedDocuments.length) return this.internalDocDrop(e, de, de.complete.docDragData, xp, yp);
        return false;
    }

    onExternalDrop = (e: React.DragEvent) => {
        return (pt => super.onExternalDrop(e, { x: pt[0], y: pt[1] }))(this.getTransform().transformPoint(e.pageX, e.pageY));
    }

    pickCluster(probe: number[]) {
        return this.childLayoutPairs.map(pair => pair.layout).reduce((cluster, cd) => {
            const grouping = this.props.Document._useClusters ? NumCast(cd.cluster, -1) : NumCast(cd.group, -1);
            if (grouping !== -1) {
                const layoutDoc = Doc.Layout(cd);
                const cx = NumCast(cd.x) - this._clusterDistance;
                const cy = NumCast(cd.y) - this._clusterDistance;
                const cw = NumCast(layoutDoc._width) + 2 * this._clusterDistance;
                const ch = NumCast(layoutDoc._height) + 2 * this._clusterDistance;
                return !layoutDoc.z && intersectRect({ left: cx, top: cy, width: cw, height: ch }, { left: probe[0], top: probe[1], width: 1, height: 1 }) ? grouping : cluster;
            }
            return cluster;
        }, -1);
    }

    tryDragCluster(e: PointerEvent | TouchEvent, cluster: number) {
        if (cluster !== -1) {
            const ptsParent = e instanceof PointerEvent ? e : e.targetTouches.item(0);
            if (ptsParent) {
                const eles = this.childLayoutPairs.map(pair => pair.layout).filter(cd => (this.props.Document._useClusters ? NumCast(cd.cluster) : NumCast(cd.group, -1)) === cluster);
                const clusterDocs = eles.map(ele => DocumentManager.Instance.getDocumentView(ele, this.props.CollectionView)!);
                const { left, top } = clusterDocs[0].getBounds() || { left: 0, top: 0 };
                const de = new DragManager.DocumentDragData(eles, e.ctrlKey || e.altKey ? "alias" : undefined);
                de.moveDocument = this.props.moveDocument;
                de.offset = this.getTransform().transformDirection(ptsParent.clientX - left, ptsParent.clientY - top);
                DragManager.StartDocumentDrag(clusterDocs.map(v => v.ContentDiv!), de, ptsParent.clientX, ptsParent.clientY, { hideSource: !de.dropAction });
                return true;
            }
        }

        return false;
    }

    @undoBatch
    @action
    updateClusters(_useClusters: boolean) {
        this.props.Document._useClusters = _useClusters;
        this._clusterSets.length = 0;
        this.childLayoutPairs.map(pair => pair.layout).map(c => this.updateCluster(c));
    }

    @action
    updateClusterDocs(docs: Doc[]) {
        const childLayouts = this.childLayoutPairs.map(pair => pair.layout);
        if (this.props.Document._useClusters) {
            const docFirst = docs[0];
            docs.map(doc => this._clusterSets.map(set => Doc.IndexOf(doc, set) !== -1 && set.splice(Doc.IndexOf(doc, set), 1)));
            const preferredInd = NumCast(docFirst.cluster);
            docs.map(doc => doc.cluster = -1);
            docs.map(doc => this._clusterSets.map((set, i) => set.map(member => {
                if (docFirst.cluster === -1 && Doc.IndexOf(member, childLayouts) !== -1 && Doc.overlapping(doc, member, this._clusterDistance)) {
                    docFirst.cluster = i;
                }
            })));
            if (docFirst.cluster === -1 && preferredInd !== -1 && this._clusterSets.length > preferredInd && (!this._clusterSets[preferredInd] || !this._clusterSets[preferredInd].filter(member => Doc.IndexOf(member, childLayouts) !== -1).length)) {
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
            } else if (this._clusterSets.length) {
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
        if (this.props.Document._useClusters) {
            this._clusterSets.forEach(set => Doc.IndexOf(doc, set) !== -1 && set.splice(Doc.IndexOf(doc, set), 1));
            const preferredInd = NumCast(doc.cluster);
            doc.cluster = -1;
            this._clusterSets.forEach((set, i) => set.forEach(member => {
                if (doc.cluster === -1 && Doc.IndexOf(member, childLayouts) !== -1 && Doc.overlapping(doc, member, this._clusterDistance)) {
                    doc.cluster = i;
                }
            }));
            if (doc.cluster === -1 && preferredInd !== -1 && this._clusterSets.length > preferredInd && (!this._clusterSets[preferredInd] || !this._clusterSets[preferredInd].filter(member => Doc.IndexOf(member, childLayouts) !== -1).length)) {
                doc.cluster = preferredInd;
            }
            this._clusterSets.forEach((set, i) => {
                if (doc.cluster === -1 && !set.filter(member => Doc.IndexOf(member, childLayouts) !== -1).length) {
                    doc.cluster = i;
                }
            });
            if (doc.cluster === -1) {
                doc.cluster = this._clusterSets.length;
                this._clusterSets.push([doc]);
            } else if (this._clusterSets.length) {
                for (let i = this._clusterSets.length; i <= doc.cluster; i++) !this._clusterSets[i] && this._clusterSets.push([]);
                this._clusterSets[doc.cluster].push(doc);
            }
        }
    }

    getClusterColor = (doc: Opt<Doc>, props: Opt<DocumentViewProps>, property: string) => {
        let styleProp = this.props.styleProvider?.(doc, props, property);  // bcz: check 'props'  used to be renderDepth + 1
        if (property !== StyleProp.BackgroundColor) return styleProp;
        const cluster = NumCast(doc?.cluster);
        if (this.Document._useClusters) {
            if (this._clusterSets.length <= cluster) {
                setTimeout(() => doc && this.updateCluster(doc));
            } else {
                // choose a cluster color from a palette
                const colors = ["#da42429e", "#31ea318c", "rgba(197, 87, 20, 0.55)", "#4a7ae2c4", "rgba(216, 9, 255, 0.5)", "#ff7601", "#1dffff", "yellow", "rgba(27, 130, 49, 0.55)", "rgba(0, 0, 0, 0.268)"];
                styleProp = colors[cluster % colors.length];
                const set = this._clusterSets[cluster]?.filter(s => s.backgroundColor);
                // override the cluster color with an explicitly set color on a non-background document.  then override that with an explicitly set color on a background document
                set?.filter(s => !StrListCast(s._layerTags).includes(StyleLayers.Background)).map(s => styleProp = StrCast(s.backgroundColor));
                set?.filter(s => StrListCast(s._layerTags).includes(StyleLayers.Background)).map(s => styleProp = StrCast(s.backgroundColor));
            }
        } //else if (doc && NumCast(doc.group, -1) !== -1) styleProp = "gray";
        return styleProp;
    }

    trySelectCluster = (addToSel: boolean) => {
        if (this._hitCluster !== -1) {
            !addToSel && SelectionManager.DeselectAll();
            const eles = this.childLayoutPairs.map(pair => pair.layout).filter(cd => (this.props.Document._useClusters ? NumCast(cd.cluster) : NumCast(cd.group, -1)) === this._hitCluster);
            this.selectDocuments(eles);
            return true;
        }
        return false;
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.nativeEvent.cancelBubble || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE) || InteractionUtils.IsType(e, InteractionUtils.PENTYPE) ||
            ([InkTool.Pen, InkTool.Highlighter].includes(CurrentUserUtils.SelectedTool))) {
            return;
        }
        this._hitCluster = this.pickCluster(this.getTransform().transformPoint(e.clientX, e.clientY));
        if (e.button === 0 && !e.altKey && !e.ctrlKey && this.props.isContentActive(true)) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);
            // if not using a pen and in no ink mode
            if (CurrentUserUtils.SelectedTool === InkTool.None) {
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
                this._hitCluster = this.pickCluster(this.getTransform().transformPoint(pt.clientX, pt.clientY));
                if (!e.shiftKey && !e.altKey && !e.ctrlKey && this.props.isContentActive(true)) {
                    this.removeMoveListeners();
                    this.addMoveListeners();
                    this.removeEndListeners();
                    this.addEndListeners();
                    if (CurrentUserUtils.SelectedTool === InkTool.None) {
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
                const inkDoc = Docs.Create.InkDocument(ActiveInkColor(), CurrentUserUtils.SelectedTool, ActiveInkWidth(), ActiveInkBezierApprox(), ActiveFillColor(), ActiveArrowStart(), ActiveArrowEnd(), ActiveDash(), points,
                    { title: "ink stroke", x: B.x - Number(ActiveInkWidth()) / 2, y: B.y - Number(ActiveInkWidth()) / 2, _width: B.width + Number(ActiveInkWidth()), _height: B.height + Number(ActiveInkWidth()) });
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
                sel.forEach(d => this.props.removeDocument?.(d));
                e.stopPropagation();
                break;
            case GestureUtils.Gestures.StartBracket:
                const start = this.getTransform().transformPoint(Math.min(...ge.points.map(p => p.X)), Math.min(...ge.points.map(p => p.Y)));
                this._inkToTextStartX = start[0];
                this._inkToTextStartY = start[1];
                break;
            case GestureUtils.Gestures.EndBracket:
                if (this._inkToTextStartX && this._inkToTextStartY) {
                    const end = this.getTransform().transformPoint(Math.max(...ge.points.map(p => p.X)), Math.max(...ge.points.map(p => p.Y)));
                    const setDocs = this.getActiveDocuments().filter(s => s.proto?.type === "rtf" && s.color);
                    const sets = setDocs.map((sd) => {
                        return Cast(sd.text, RichTextField)?.Text as string;
                    });
                    if (sets.length && sets[0]) {
                        this._wordPalette.clear();
                        const colors = setDocs.map(sd => FieldValue(sd.color) as string);
                        sets.forEach((st: string, i: number) => st.split(",").forEach(word => this._wordPalette.set(word, colors[i])));
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

    onPointerUp = (e: PointerEvent): void => {
        if (!InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            this.removeMoveListeners();
            this.removeEndListeners();
        }
    }

    onClick = (e: React.MouseEvent) => {
        if ((Math.abs(e.pageX - this._downX) < 3 && Math.abs(e.pageY - this._downY) < 3)) {
            if (e.shiftKey) {
                if (Date.now() - this._lastTap < 300) { // reset zoom of freeform view to 1-to-1 on a shift + double click 
                    this.zoomSmoothlyAboutPt(this.getTransform().transformPoint(e.clientX, e.clientY), 1);
                }
                e.stopPropagation();
                e.preventDefault();
            }
            this._lastTap = Date.now();
        }
    }

    @action
    pan = (e: PointerEvent | React.Touch | { clientX: number, clientY: number }): void => {
        const [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
        this.setPan((this.Document._panX || 0) - dx, (this.Document._panY || 0) - dy, 0, true);
        this._lastX = e.clientX;
        this._lastY = e.clientY;
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (this.props.Document._isGroup) return; // groups don't pan when dragged -- instead let the event go through to allow the group itself to drag
        if (InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) return;
        if (InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)) {
            if (this.props.isContentActive(true)) e.stopPropagation();
        } else if (!e.cancelBubble) {
            if (CurrentUserUtils.SelectedTool === InkTool.None) {
                if (this.tryDragCluster(e, this._hitCluster)) {
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                }
                else this.pan(e);
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }

    handle1PointerMove = (e: TouchEvent, me: InteractionUtils.MultiTouchEvent<TouchEvent>) => {
        if (!e.cancelBubble) {
            const myTouches = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true);
            if (myTouches[0]) {
                if (CurrentUserUtils.SelectedTool === InkTool.None) {
                    if (this.tryDragCluster(e, this._hitCluster)) {
                        e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
                        e.preventDefault();
                        document.removeEventListener("pointermove", this.onPointerMove);
                        document.removeEventListener("pointerup", this.onPointerUp);
                        return;
                    }
                    this.pan(myTouches[0]);
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
        if (!e.nativeEvent.cancelBubble && this.props.isContentActive(true)) {
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
            case "left": case "right": case "top": case "bottom":
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
        if (this.Document._isGroup) return;
        let deltaScale = deltaY > 0 ? (1 / 1.05) : 1.05;
        if (deltaScale < 0) deltaScale = -deltaScale;
        const [x, y] = this.getTransform().transformPoint(pointX, pointY);
        const invTransform = this.getLocalTransform().inverse();
        if (deltaScale * invTransform.Scale > 20) {
            deltaScale = 20 / invTransform.Scale;
        }
        if (deltaScale * invTransform.Scale < 1 && this.isAnnotationOverlay) {
            deltaScale = 1 / invTransform.Scale;
        }

        const localTransform = this.getLocalTransform().inverse().scaleAbout(deltaScale, x, y);
        if (localTransform.Scale >= 0.05 || localTransform.Scale > this.zoomScaling()) {
            const safeScale = Math.min(Math.max(0.05, localTransform.Scale), 20);
            this.props.Document[this.scaleFieldKey] = Math.abs(safeScale);
            this.setPan(-localTransform.TranslateX / safeScale, -localTransform.TranslateY / safeScale);
        }
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        if (this.layoutDoc._lockedTransform || (this.layoutDoc._fitWidth && this.layoutDoc.nativeHeight) || CurrentUserUtils.OverlayDocs.includes(this.props.Document) || this.props.Document.treeViewOutlineMode === "outline") return;
        if (!e.ctrlKey && this.props.Document.scrollHeight !== undefined) { // things that can scroll vertically should do that instead of zooming
            e.stopPropagation();
        }
        else if (this.props.isContentActive(true) && !this.Document._isGroup) {
            e.stopPropagation();
            e.preventDefault();
            this.zoom(e.clientX, e.clientY, e.deltaY); // if (!this.props.isAnnotationOverlay) // bcz: do we want to zoom in on images/videos/etc?
        }
    }

    @action
    setPan(panX: number, panY: number, panTime: number = 0, clamp: boolean = false) {
        if (!this.isAnnotationOverlay && clamp) {
            // this section wraps the pan position, horizontally and/or vertically whenever the content is panned out of the viewing bounds
            const docs = this.childLayoutPairs.filter(pair => pair.layout instanceof Doc).map(pair => pair.layout);
            const measuredDocs = docs.filter(doc => doc && this.childDataProvider(doc, "") && this.childSizeProvider(doc, "")).
                map(doc => ({ ...this.childDataProvider(doc, ""), ...this.childSizeProvider(doc, "") }));
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
        if (!this.layoutDoc._lockedTransform || LightboxView.LightboxDoc || CurrentUserUtils.OverlayDocs.includes(this.Document)) {
            this._viewTransition = panTime;
            const scale = this.getLocalTransform().inverse().Scale;
            const newPanX = Math.min((1 - 1 / scale) * this.nativeWidth, Math.max(0, panX));
            const newPanY = Math.min((this.props.Document.scrollHeight !== undefined ? NumCast(this.Document.scrollHeight) : (1 - 1 / scale) * this.nativeHeight), Math.max(0, panY));
            !this.Document._verticalScroll && (this.Document._panX = this.isAnnotationOverlay ? newPanX : panX);
            !this.Document._horizontalScroll && (this.Document._panY = this.isAnnotationOverlay ? newPanY : panY);
        }
    }

    @action
    nudge = (x: number, y: number, nudgeTime: number = 500) => {
        if (this.props.ContainingCollectionDoc?._viewType !== CollectionViewType.Freeform ||
            this.props.ContainingCollectionDoc._panX !== undefined) { // bcz: this isn't ideal, but want to try it out...
            this.setPan(NumCast(this.layoutDoc._panX) + this.props.PanelWidth() / 2 * x / this.zoomScaling(),
                NumCast(this.layoutDoc._panY) + this.props.PanelHeight() / 2 * (-y) / this.zoomScaling(), nudgeTime, true);
            this._lastNudge && clearTimeout(this._lastNudge);
            this._lastNudge = setTimeout(action(() => this._viewTransition = 0), nudgeTime);
            return true;
        }
        return false;
    }

    @action
    bringToFront = (doc: Doc, sendToBack?: boolean) => {
        if (sendToBack || StrListCast(doc._layerTags).includes(StyleLayers.Background)) {
            doc.zIndex = 0;
        } else if (doc.isInkMask) {
            doc.zIndex = 5000;
        } else {
            const docs = this.childLayoutPairs.map(pair => pair.layout);
            docs.slice().sort((doc1, doc2) => NumCast(doc1.zIndex) - NumCast(doc2.zIndex));
            let zlast = docs.length ? Math.max(docs.length, NumCast(docs[docs.length - 1].zIndex)) : 1;
            if (zlast - docs.length > 100) {
                for (let i = 0; i < docs.length; i++) doc.zIndex = i + 1;
                zlast = docs.length + 1;
            }
            doc.zIndex = zlast + 1;
        }
    }

    @action
    zoomSmoothlyAboutPt(docpt: number[], scale: number, transitionTime = 500) {
        if (this.Document._isGroup) return;
        setTimeout(action(() => this._viewTransition = 0), this._viewTransition = transitionTime); // set transition to be smooth, then reset 
        const screenXY = this.getTransform().inverse().transformPoint(docpt[0], docpt[1]);
        this.layoutDoc[this.scaleFieldKey] = scale;
        const newScreenXY = this.getTransform().inverse().transformPoint(docpt[0], docpt[1]);
        const scrDelta = { x: screenXY[0] - newScreenXY[0], y: screenXY[1] - newScreenXY[1] };
        const newpan = this.getTransform().transformDirection(scrDelta.x, scrDelta.y);
        this.layoutDoc._panX = NumCast(this.layoutDoc._panX) - newpan[0];
        this.layoutDoc._panY = NumCast(this.layoutDoc._panY) - newpan[1];
    }

    focusDocument = (doc: Doc, options?: DocFocusOptions) => {
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
        if (this.props.Document.scrollHeight || this.props.Document.scrollTop !== undefined) {
            this.props.focus(doc, options);
        } else {
            const xfToCollection = options?.docTransform ?? Transform.Identity();
            const layoutdoc = Doc.Layout(doc);
            const savedState = { panX: NumCast(this.Document._panX), panY: NumCast(this.Document._panY), scale: this.Document[this.scaleFieldKey] };
            const newState = HistoryUtil.getState();
            const cantTransform = this.props.isAnnotationOverlay || ((this.rootDoc._isGroup || this.layoutDoc._lockedTransform) && !LightboxView.LightboxDoc);
            const { panX, panY, scale } = cantTransform ? savedState : this.calculatePanIntoView(layoutdoc, xfToCollection, options?.willZoom ? options?.scale || .75 : undefined);
            if (!cantTransform) {   // only pan and zoom to focus on a document if the document is not an annotation in an annotation overlay collection
                newState.initializers![this.Document[Id]] = { panX: panX, panY: panY };
                HistoryUtil.pushState(newState);
            }
            // focus on the document in the collection
            const didMove = !cantTransform && !doc.z && (panX !== savedState.panX || panY !== savedState.panY || scale !== undefined);
            const focusSpeed = options?.instant ? 0 : didMove ? (doc.focusSpeed !== undefined ? Number(doc.focusSpeed) : 500) : 0;
            // glr: freeform transform speed can be set by adjusting presTransition field - needs a way of knowing when presentation is not active...
            if (didMove) {
                this.setPan(panX, panY, focusSpeed, true); // docs that are floating in their collection can't be panned to from their collection -- need to propagate the pan to a parent freeform somehow
                scale && (this.Document[this.scaleFieldKey] = scale);
            }

            const startTime = Date.now();
            // focus on this collection within its parent view.  the parent view after focusing determines whether to reset the view change within the collection
            const endFocus = async (moved: boolean) => {
                doc.hidden && Doc.UnHighlightDoc(doc);
                const resetView = options?.afterFocus ? await options?.afterFocus(moved) : ViewAdjustment.doNothing;
                if (resetView) {
                    const restoreState = (!LightboxView.LightboxDoc || LightboxView.LightboxDoc === this.props.Document) && savedState;
                    if (typeof restoreState !== "boolean") {
                        this.Document._panX = restoreState.panX;
                        this.Document._panY = restoreState.panY;
                        this.Document[this.scaleFieldKey] = restoreState.scale;
                    }
                    runInAction(() => this._viewTransition = 0);
                }
                return resetView;
            };
            const xf = !cantTransform ? Transform.Identity() :
                this.props.isAnnotationOverlay ?
                    new Transform(NumCast(this.rootDoc.x), NumCast(this.rootDoc.y), this.rootDoc[WidthSym]() / Doc.NativeWidth(this.rootDoc))
                    :
                    new Transform(NumCast(this.rootDoc.x) + this.rootDoc[WidthSym]() / 2 - NumCast(this.rootDoc._panX),
                        NumCast(this.rootDoc.y) + this.rootDoc[HeightSym]() / 2 - NumCast(this.rootDoc._panY), 1);

            this.props.focus(cantTransform ? doc : this.rootDoc, {
                ...options,
                docTransform: xf,
                afterFocus: (didFocus: boolean) => new Promise<ViewAdjustment>(res =>
                    setTimeout(async () => res(await endFocus(didMove || didFocus)), Math.max(0, focusSpeed - (Date.now() - startTime))))
            });
        }
    }

    calculatePanIntoView = (doc: Doc, xf: Transform, scale?: number) => {
        const pw = this.props.PanelWidth() / NumCast(this.layoutDoc._viewScale, 1);
        const ph = this.props.PanelHeight() / NumCast(this.layoutDoc._viewScale, 1);
        const pt = xf.transformPoint(NumCast(doc.x), NumCast(doc.y));
        const pt2 = xf.transformPoint(NumCast(doc.x) + doc[WidthSym](), NumCast(doc.y) + doc[HeightSym]());
        const bounds = { left: pt[0], right: pt2[0], top: pt[1], bot: pt2[1] };
        const cx = NumCast(this.layoutDoc._panX);
        const cy = NumCast(this.layoutDoc._panY);
        const screen = { left: cx - pw / 2, right: cx + pw / 2, top: cy - ph / 2, bot: cy + ph / 2 };

        if (scale) {
            const maxZoom = 2; // sets the limit for how far we will zoom. this is useful for preventing small text boxes from filling the screen. So probably needs to be more sophisticated to consider more about the target and context
            return {
                panX: (bounds.left + bounds.right) / 2,
                panY: (bounds.top + bounds.bot) / 2,
                scale: Math.min(maxZoom, scale * Math.min(this.props.PanelWidth() / Math.abs(pt2[0] - pt[0]), this.props.PanelHeight() / Math.abs(pt2[1] - pt[1])))
            };
        }
        if ((screen.right - screen.left) < (bounds.right - bounds.left) ||
            (screen.bot - screen.top) < (bounds.bot - bounds.top)) {
            return {
                panX: (bounds.left + bounds.right) / 2,
                panY: (bounds.top + bounds.bot) / 2,
                scale: Math.min(this.props.PanelHeight() / (bounds.bot - bounds.top), this.props.PanelWidth() / (bounds.right - bounds.left)) / 1.1
            };
        }
        return {
            panX: cx + Math.min(0, bounds.left - pw / 10 - screen.left) + Math.max(0, bounds.right + pw / 10 - screen.right),
            panY: cy + Math.min(0, bounds.top - ph / 10 - screen.top) + Math.max(0, bounds.bot + ph / 10 - screen.bot),
        };
    }

    isContentActive = () => this.props.isSelected() || this.props.isContentActive();

    getChildDocView(entry: PoolData) {
        const childLayout = entry.pair.layout;
        const childData = entry.pair.data;
        const engine = this.props.layoutEngine?.() || StrCast(this.props.Document._layoutEngine);
        return <CollectionFreeFormDocumentView key={childLayout[Id] + (entry.replica || "")}
            DataDoc={childData}
            Document={childLayout}
            renderDepth={this.props.renderDepth + 1}
            replica={entry.replica}
            ContainingCollectionView={this.props.CollectionView}
            ContainingCollectionDoc={this.props.Document}
            CollectionFreeFormView={this}
            LayoutTemplate={childLayout.z ? undefined : this.props.childLayoutTemplate}
            LayoutTemplateString={childLayout.z ? undefined : this.props.childLayoutString}
            rootSelected={childData ? this.rootSelected : returnFalse}
            onClick={this.onChildClickHandler}
            onDoubleClick={this.onChildDoubleClickHandler}
            ScreenToLocalTransform={childLayout.z ? this.getTransformOverlay : this.getTransform}
            PanelWidth={childLayout[WidthSym]}
            PanelHeight={childLayout[HeightSym]}
            docFilters={this.freeformDocFilters}
            docRangeFilters={this.freeformRangeDocFilters}
            searchFilterDocs={this.searchFilterDocs}
            isContentActive={this.isAnnotationOverlay ? this.props.isContentActive : returnFalse}
            isDocumentActive={this.props.childDocumentsActive ? this.props.isDocumentActive : this.isContentActive}
            focus={this.focusDocument}
            addDocTab={this.addDocTab}
            addDocument={this.props.addDocument}
            removeDocument={this.props.removeDocument}
            moveDocument={this.props.moveDocument}
            pinToPres={this.props.pinToPres}
            whenChildContentsActiveChanged={this.props.whenChildContentsActiveChanged}
            docViewPath={this.props.docViewPath}
            styleProvider={this.getClusterColor}
            layerProvider={this.props.layerProvider}
            dataProvider={this.childDataProvider}
            sizeProvider={this.childSizeProvider}
            freezeDimensions={this.props.childFreezeDimensions}
            dropAction={StrCast(this.props.Document.childDropAction) as dropActionType}
            bringToFront={this.bringToFront}
            dontRegisterView={this.props.dontRegisterView}
            pointerEvents={this.backgroundActive || this.props.childPointerEvents ? "all" :
                (this.props.viewDefDivClick || (engine === "pass" && !this.props.isSelected(true))) ? "none" : undefined}
            jitterRotation={this.props.styleProvider?.(childLayout, this.props, StyleProp.JitterRotation) || 0}
        //fitToBox={this.props.fitToBox || BoolCast(this.props.freezeChildDimensions)} // bcz: check this
        />;
    }
    addDocTab = action((doc: Doc, where: string) => {
        if (where === "inParent") {
            ((doc instanceof Doc) ? [doc] : doc).forEach(doc => {
                const pt = this.getTransform().transformPoint(NumCast(doc.x), NumCast(doc.y));
                doc.x = pt[0];
                doc.y = pt[1];
            });
            return this.props.addDocument?.(doc) || false;
        }
        if (where === "inPlace" && this.layoutDoc.isInPlaceContainer) {
            this.dataDoc[this.props.fieldKey] = doc instanceof Doc ? doc : new List<Doc>(doc as any as Doc[]);
            return true;
        }
        return this.props.addDocTab(doc, where);
    });

    getCalculatedPositions(params: { pair: { layout: Doc, data?: Doc }, index: number, collection: Doc }): PoolData {
        const layoutDoc = Doc.Layout(params.pair.layout);
        const { z, color, zIndex } = params.pair.layout;
        const { x, y, opacity } = this.Document._currentFrame === undefined ?
            { x: params.pair.layout.x, y: params.pair.layout.y, opacity: this.props.styleProvider?.(params.pair.layout, this.props, StyleProp.Opacity) } :
            CollectionFreeFormDocumentView.getValues(params.pair.layout, this.Document._currentFrame);
        return {
            x: NumCast(x), y: NumCast(y), z: Cast(z, "number"), color: StrCast(color), zIndex: Cast(zIndex, "number"),
            transition: StrCast(layoutDoc.dataTransition), opacity: this._keyframeEditing ? 1 : Cast(opacity, "number", null),
            width: Cast(layoutDoc._width, "number"), height: Cast(layoutDoc._height, "number"), pair: params.pair, replica: ""
        };
    }

    onViewDefDivClick = (e: React.MouseEvent, payload: any) => {
        (this.props.viewDefDivClick || ScriptCast(this.props.Document.onViewDefDivClick))?.script.run({ this: this.props.Document, payload });
        e.stopPropagation();
    }

    viewDefsToJSX = (views: ViewDefBounds[]) => {
        return !Array.isArray(views) ? [] : views.filter(ele => this.viewDefToJSX(ele)).map(ele => this.viewDefToJSX(ele)!);
    }

    viewDefToJSX(viewDef: ViewDefBounds): Opt<ViewDefResult> {
        const { x, y, z } = viewDef;
        const color = StrCast(viewDef.color);
        const width = Cast(viewDef.width, "number");
        const height = Cast(viewDef.height, "number");
        const transform = `translate(${x}px, ${y}px)`;
        if (viewDef.type === "text") {
            const text = Cast(viewDef.text, "string"); // don't use NumCast, StrCast, etc since we want to test for undefined below
            const fontSize = Cast(viewDef.fontSize, "string");
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
                    ele: <div className="collectionFreeform-customDiv" title={viewDef.payload?.join(" ")} key={"div" + x + y + z + viewDef.payload} onClick={e => this.onViewDefDivClick(e, viewDef)}
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
            viewDefsToJSX: ((views: ViewDefBounds[]) => ViewDefResult[]),
            engineProps: any) => ViewDefResult[]
    ) {
        return engine(poolData, this.props.Document, this.childLayoutPairs, [this.props.PanelWidth(), this.props.PanelHeight()], this.viewDefsToJSX, this.props.engineProps);
    }

    doFreeformLayout(poolData: Map<string, PoolData>) {
        this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map((pair, i) =>
            poolData.set(pair.layout[Id], this.getCalculatedPositions({ pair, index: i, collection: this.Document })));
        return [] as ViewDefResult[];
    }

    @computed get doInternalLayoutComputation() {
        TraceMobx();
        const newPool = new Map<string, PoolData>();
        switch (this.props.layoutEngine?.() || StrCast(this.layoutDoc._layoutEngine)) {
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
            for (const entry of array) {
                const lastPos = this._cachedPool.get(entry[0]); // last computed pos
                const newPos = entry[1];
                if (!lastPos || newPos.opacity !== lastPos.opacity || newPos.x !== lastPos.x || newPos.y !== lastPos.y || newPos.z !== lastPos.z || newPos.zIndex !== lastPos.zIndex) {
                    this._layoutPoolData.set(entry[0], newPos);
                }
                if (!lastPos || newPos.height !== lastPos.height || newPos.width !== lastPos.width) {
                    this._layoutSizeData.set(entry[0], { width: newPos.width, height: newPos.height });
                }
            }
        });
        this._cachedPool.clear();
        Array.from(newPool.entries()).forEach(k => this._cachedPool.set(k[0], k[1]));
        const elements = computedElementData.slice();
        Array.from(newPool.entries()).filter(entry => this.isCurrent(entry[1].pair.layout)).forEach(entry =>
            elements.push({
                ele: this.getChildDocView(entry[1]),
                bounds: this.childDataProvider(entry[1].pair.layout, entry[1].replica)
            }));

        if (this.props.isAnnotationOverlay) {   // don't zoom out farther than 1-1 if it's a bounded item (image, video, pdf), otherwise don't allow zooming in closer than 1-1 if it's a text sidebar
            if (this.props.scaleField) this.props.Document[this.scaleFieldKey] = Math.min(1, NumCast(this.props.Document[this.scaleFieldKey], 1));
            else this.props.Document[this.scaleFieldKey] = Math.max(1, NumCast(this.props.Document[this.scaleFieldKey]));
        }

        this.Document._useClusters && !this._clusterSets.length && this.childDocs.length && this.updateClusters(true);
        return elements;
    }

    @action
    setViewSpec = (anchor: Doc, preview: boolean) => {
        if (preview) {
            this._focusFilters = StrListCast(Doc.GetProto(anchor).docFilters);
            this._focusRangeFilters = StrListCast(Doc.GetProto(anchor).docRangeFilters);
        } else if (anchor.pivotField !== undefined) {
            this.layoutDoc._docFilters = new List<string>(StrListCast(anchor.docFilters));
            this.layoutDoc._docRangeFilters = new List<string>(StrListCast(anchor.docRangeFilters));
        }
        return 0;
    }

    getAnchor = () => {
        const anchor = Docs.Create.TextanchorDocument({ title: StrCast(this.layoutDoc._viewType), annotationOn: this.rootDoc });
        const proto = Doc.GetProto(anchor);
        proto[ViewSpecPrefix + "_viewType"] = this.layoutDoc._viewType;
        proto.docFilters = ObjectField.MakeCopy(this.layoutDoc.docFilters as ObjectField) || new List<string>([]);
        if (Cast(this.dataDoc[this.props.fieldKey + "-annotations"], listSpec(Doc), null) !== undefined) {
            Cast(this.dataDoc[this.props.fieldKey + "-annotations"], listSpec(Doc), []).push(anchor);
        } else {
            this.dataDoc[this.props.fieldKey + "-annotations"] = new List<Doc>([anchor]);
        }
        return anchor;
    }

    @action
    componentDidMount() {
        super.componentDidMount?.();
        this.props.setContentView?.(this);
        this._disposers.layoutComputation = reaction(() => this.doLayoutComputation,
            (elements) => this._layoutElements = elements || [],
            { fireImmediately: true, name: "doLayout" });

        this._marqueeRef.current?.addEventListener("dashDragAutoScroll", this.onDragAutoScroll as any);
    }

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        this._marqueeRef.current?.removeEventListener("dashDragAutoScroll", this.onDragAutoScroll as any);
    }

    @action
    onCursorMove = (e: React.PointerEvent) => {
        //  super.setCursorPosition(this.getTransform().transformPoint(e.clientX, e.clientY));
    }

    @action
    onDragAutoScroll = (e: CustomEvent<React.DragEvent>) => {
        if ((e as any).handlePan || this.props.isAnnotationOverlay) return;
        (e as any).handlePan = true;

        if (!this.layoutDoc._noAutoscroll && !this.props.renderDepth && this._marqueeRef?.current) {
            const dragX = e.detail.clientX;
            const dragY = e.detail.clientY;
            const bounds = this._marqueeRef.current?.getBoundingClientRect();

            const deltaX = dragX - bounds.left < 25 ? -(25 + (bounds.left - dragX)) : bounds.right - dragX < 25 ? 25 - (bounds.right - dragX) : 0;
            const deltaY = dragY - bounds.top < 25 ? -(25 + (bounds.top - dragY)) : bounds.bottom - dragY < 25 ? 25 - (bounds.bottom - dragY) : 0;
            if (deltaX !== 0 || deltaY !== 0) {
                this.Document._panY = NumCast(this.Document._panY) + deltaY / 2;
                this.Document._panX = NumCast(this.Document._panX) + deltaX / 2;
            }
        }
        e.stopPropagation();
    }

    @undoBatch
    promoteCollection = () => {
        const childDocs = this.childDocs.slice();
        childDocs.forEach(doc => {
            const scr = this.getTransform().inverse().transformPoint(NumCast(doc.x), NumCast(doc.y));
            doc.x = scr?.[0];
            doc.y = scr?.[1];
        });
        this.props.addDocTab(childDocs as any as Doc, "inParent");
        this.props.ContainingCollectionView?.removeDocument(this.props.Document);
    }

    @undoBatch
    layoutDocsInGrid = () => {
        const docs = this.childLayoutPairs.map(pair => pair.layout);
        const width = Math.max(...docs.map(doc => NumCast(doc._width))) + 20;
        const height = Math.max(...docs.map(doc => NumCast(doc._height))) + 20;
        const dim = Math.ceil(Math.sqrt(docs.length));
        docs.forEach((doc, i) => {
            doc.x = (this.Document._panX || 0) + (i % dim) * width - width * dim / 2;
            doc.y = (this.Document._panY || 0) + Math.floor(i / dim) * height - height * dim / 2;
        });
    }

    @undoBatch
    toggleNativeDimensions = () => Doc.toggleNativeDimensions(this.layoutDoc, 1, this.nativeWidth, this.nativeHeight)

    onContextMenu = (e: React.MouseEvent) => {
        if (this.props.isAnnotationOverlay || this.props.Document.annotationOn || !ContextMenu.Instance) return;

        const appearance = ContextMenu.Instance.findByDescription("Appearance...");
        const appearanceItems = appearance && "subitems" in appearance ? appearance.subitems : [];
        appearanceItems.push({ description: "Reset View", event: () => { this.props.Document._panX = this.props.Document._panY = 0; this.props.Document[this.scaleFieldKey] = 1; }, icon: "compress-arrows-alt" });
        !Doc.UserDoc().noviceMode && Doc.UserDoc().defaultTextLayout && appearanceItems.push({ description: "Reset default note style", event: () => Doc.UserDoc().defaultTextLayout = undefined, icon: "eye" });
        appearanceItems.push({ description: `${this.fitToContent ? "Make Zoomable" : "Scale to Window"}`, event: () => this.Document._fitToBox = !this.fitToContent, icon: !this.fitToContent ? "expand-arrows-alt" : "compress-arrows-alt" });
        this.props.ContainingCollectionView &&
            appearanceItems.push({ description: "Ungroup collection", event: this.promoteCollection, icon: "table" });
        !Doc.UserDoc().noviceMode ? appearanceItems.push({ description: "Arrange contents in grid", event: this.layoutDocsInGrid, icon: "table" }) : null;
        !appearance && ContextMenu.Instance.addItem({ description: "Appearance...", subitems: appearanceItems, icon: "eye" });

        const viewctrls = ContextMenu.Instance.findByDescription("UI Controls...");
        const viewCtrlItems = viewctrls && "subitems" in viewctrls ? viewctrls.subitems : [];

        !Doc.UserDoc().noviceMode ? viewCtrlItems.push({ description: (Doc.UserDoc().showSnapLines ? "Hide" : "Show") + " Snap Lines", event: () => Doc.UserDoc().showSnapLines = !Doc.UserDoc().showSnapLines, icon: "compress-arrows-alt" }) : null;
        !Doc.UserDoc().noviceMode ? viewCtrlItems.push({ description: (this.Document._useClusters ? "Hide" : "Show") + " Clusters", event: () => this.updateClusters(!this.Document._useClusters), icon: "braille" }) : null;
        !viewctrls && ContextMenu.Instance.addItem({ description: "UI Controls...", subitems: viewCtrlItems, icon: "eye" });

        const options = ContextMenu.Instance.findByDescription("Options...");
        const optionItems = options && "subitems" in options ? options.subitems : [];
        !this.props.isAnnotationOverlay && !Doc.UserDoc().noviceMode &&
            optionItems.push({ description: (this._showAnimTimeline ? "Close" : "Open") + " Animation Timeline", event: action(() => this._showAnimTimeline = !this._showAnimTimeline), icon: "eye" });
        this.props.renderDepth && optionItems.push({ description: "Use Background Color as Default", event: () => Cast(Doc.UserDoc().emptyCollection, Doc, null)._backgroundColor = StrCast(this.layoutDoc._backgroundColor), icon: "palette" });
        if (!Doc.UserDoc().noviceMode) {
            optionItems.push({ description: (!Doc.NativeWidth(this.layoutDoc) || !Doc.NativeHeight(this.layoutDoc) ? "Freeze" : "Unfreeze") + " Aspect", event: this.toggleNativeDimensions, icon: "snowflake" });
            optionItems.push({ description: `${this.Document._freeformLOD ? "Enable LOD" : "Disable LOD"}`, event: () => this.Document._freeformLOD = !this.Document._freeformLOD, icon: "table" });
        }
        !options && ContextMenu.Instance.addItem({ description: "Options...", subitems: optionItems, icon: "eye" });
        const mores = ContextMenu.Instance.findByDescription("More...");
        const moreItems = mores && "subitems" in mores ? mores.subitems : [];
        moreItems.push({ description: "Export collection", icon: "download", event: async () => Doc.Zip(this.props.Document) });
        moreItems.push({ description: "Import exported collection", icon: "upload", event: ({ x, y }) => this.importDocument(x, y) });
        !mores && ContextMenu.Instance.addItem({ description: "More...", subitems: moreItems, icon: "eye" });
    }

    importDocument = (x: number, y: number) => {
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
                        setTimeout(() =>
                            SearchUtil.Search(`{!join from=id to=proto_i}id:link*`, true, {}).then(docs => {
                                docs.docs.forEach(d => LinkManager.Instance.addLink(d));
                            }), 2000); // need to give solr some time to update so that this query will find any link docs we've added.
                    }
                }
            }
        };
        input.click();
    }

    @action
    setupDragLines = (snapToDraggedDoc: boolean = false) => {
        const activeDocs = this.getActiveDocuments();
        const size = this.getTransform().transformDirection(this.props.PanelWidth(), this.props.PanelHeight());
        const selRect = { left: this.panX() - size[0] / 2, top: this.panY() - size[1] / 2, width: size[0], height: size[1] };
        const docDims = (doc: Doc) => ({ left: NumCast(doc.x), top: NumCast(doc.y), width: NumCast(doc._width), height: NumCast(doc._height) });
        const isDocInView = (doc: Doc, rect: { left: number, top: number, width: number, height: number }) => intersectRect(docDims(doc), rect);

        const otherBounds = { left: this.panX(), top: this.panY(), width: Math.abs(size[0]), height: Math.abs(size[1]) };
        let snappableDocs = activeDocs.filter(doc => !StrListCast(doc._layerTags).includes(StyleLayers.Background) && doc.z === undefined && isDocInView(doc, selRect));  // first see if there are any foreground docs to snap to
        !snappableDocs.length && (snappableDocs = activeDocs.filter(doc => doc.z === undefined && isDocInView(doc, selRect))); // if not, see if there are background docs to snap to
        !snappableDocs.length && (snappableDocs = activeDocs.filter(doc => doc.z !== undefined && isDocInView(doc, otherBounds))); // if not, then why not snap to floating docs

        const horizLines: number[] = [];
        const vertLines: number[] = [];
        const invXf = this.getTransform().inverse();
        snappableDocs.filter(doc => snapToDraggedDoc || !DragManager.docsBeingDragged.includes(Cast(doc.rootDocument, Doc, null) || doc)).forEach(doc => {
            const { left, top, width, height } = docDims(doc);
            const topLeftInScreen = invXf.transformPoint(left, top);
            const docSize = invXf.transformDirection(width, height);

            horizLines.push(topLeftInScreen[1], topLeftInScreen[1] + docSize[1] / 2, topLeftInScreen[1] + docSize[1]); // horiz center line
            vertLines.push(topLeftInScreen[0], topLeftInScreen[0] + docSize[0] / 2, topLeftInScreen[0] + docSize[0]);// right line
        });
        DragManager.SetSnapLines(horizLines, vertLines);
    }

    onPointerOver = (e: React.PointerEvent) => {
        (DocumentDecorations.Instance.Interacting || (this.props.layerProvider?.(this.props.Document) !== false && SnappingManager.GetIsDragging())) && this.setupDragLines(e.ctrlKey || e.shiftKey);
        e.stopPropagation();
    }

    children = () => {
        const children = typeof this.props.children === "function" ? (this.props.children as any)() as JSX.Element[] : [];
        return [...children, ...this.views, <CollectionFreeFormRemoteCursors {...this.props} key="remoteCursors" />];
    }

    chooseGridSpace = (gridSpace: number): number => {
        const divisions = this.props.PanelWidth() / this.zoomScaling() / gridSpace + 3;
        return divisions < 60 ? gridSpace : this.chooseGridSpace(gridSpace * 10);
    }

    @computed get backgroundGrid() {
        const gridSpace = this.chooseGridSpace(NumCast(this.layoutDoc["_backgroundGrid-spacing"], 50));
        const shiftX = (this.props.isAnnotationOverlay ? 0 : -this.panX() % gridSpace - gridSpace) * this.zoomScaling();
        const shiftY = (this.props.isAnnotationOverlay ? 0 : -this.panY() % gridSpace - gridSpace) * this.zoomScaling();
        const renderGridSpace = gridSpace * this.zoomScaling();
        const w = this.props.PanelWidth() + 2 * renderGridSpace;
        const h = this.props.PanelHeight() + 2 * renderGridSpace;
        return <canvas className="collectionFreeFormView-grid" width={w} height={h} style={{ transform: `translate(${shiftX}px, ${shiftY}px)` }}
            ref={(el) => {
                const ctx = el?.getContext('2d');
                if (ctx) {
                    const Cx = this.cachedCenteringShiftX % renderGridSpace;
                    const Cy = this.cachedCenteringShiftY % renderGridSpace;
                    ctx.lineWidth = Math.min(1, Math.max(0.5, this.zoomScaling()));
                    ctx.setLineDash(gridSpace > 50 ? [3, 3] : [1, 5]);
                    ctx.clearRect(0, 0, w, h);
                    if (ctx) {
                        ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
                        ctx.beginPath();
                        for (let x = Cx - renderGridSpace; x <= w - Cx; x += renderGridSpace) {
                            ctx.moveTo(x, Cy - h);
                            ctx.lineTo(x, Cy + h);
                        }
                        for (let y = Cy - renderGridSpace; y <= h - Cy; y += renderGridSpace) {
                            ctx.moveTo(Cx - w, y);
                            ctx.lineTo(Cx + w, y);
                        }
                        ctx.stroke();
                    }
                }
            }} />;
    }

    @computed get placeholder() {
        return <div className="collectionfreeformview-placeholder" style={{ background: this.Document.backgroundColor }}>
            <span className="collectionfreeformview-placeholderSpan">{this.props.Document.title?.toString()}</span>
        </div>;
    }

    @computed get marqueeView() {
        return <MarqueeView
            {...this.props}
            ungroup={this.props.Document._isGroup ? this.promoteCollection : undefined}
            nudge={this.isAnnotationOverlay || this.props.renderDepth > 0 ? undefined : this.nudge}
            addDocTab={this.addDocTab}
            trySelectCluster={this.trySelectCluster}
            activeDocuments={this.getActiveDocuments}
            selectDocuments={this.selectDocuments}
            addDocument={this.addDocument}
            addLiveTextDocument={this.addLiveTextBox}
            getContainerTransform={this.getContainerTransform}
            getTransform={this.getTransform}
            isAnnotationOverlay={this.isAnnotationOverlay}>
            <div ref={this._marqueeRef}>
                {this.layoutDoc["_backgroundGrid-show"] ? this.backgroundGrid : (null)}
                <CollectionFreeFormViewPannableContents
                    isAnnotationOverlay={this.isAnnotationOverlay}
                    transform={this.contentTransform}
                    zoomScaling={this.zoomScaling}
                    presPaths={BoolCast(this.Document.presPathView)}
                    progressivize={BoolCast(this.Document.editProgressivize)}
                    presPinView={BoolCast(this.Document.presPinView)}
                    transition={this._viewTransition ? `transform ${this._viewTransition}ms` : Cast(this.layoutDoc._viewTransition, "string", null)}
                    viewDefDivClick={this.props.viewDefDivClick}>
                    {this.children}
                </CollectionFreeFormViewPannableContents>
            </div>
            {this._showAnimTimeline ? <Timeline ref={this._timelineRef} {...this.props} /> : (null)}
        </MarqueeView>;
    }

    @computed get contentScaling() {
        if (this.props.isAnnotationOverlay && !this.props.annotationLayerHostsContent) return 0;
        const nw = this.nativeWidth;
        const nh = this.nativeHeight;
        const hscale = nh ? this.props.PanelHeight() / nh : 1;
        const wscale = nw ? this.props.PanelWidth() / nw : 1;
        return wscale < hscale ? wscale : hscale;
    }

    render() {
        TraceMobx();
        const clientRect = this._mainCont?.getBoundingClientRect();
        return <div className={"collectionfreeformview-container"} ref={this.createDashEventsTarget}
            onPointerOver={this.onPointerOver}
            onWheel={this.onPointerWheel}
            onClick={this.onClick}
            onPointerDown={this.onPointerDown}
            onPointerMove={this.onCursorMove}
            onDrop={this.onExternalDrop.bind(this)}
            onDragOver={e => e.preventDefault()}
            onContextMenu={this.onContextMenu}
            style={{
                pointerEvents: this.backgroundEvents ? "all" : this.props.pointerEvents as any,
                transform: `scale(${this.contentScaling || 1})`,
                width: `${100 / (this.contentScaling || 1)}%`,
                height: this.isAnnotationOverlay && this.Document.scrollHeight ? this.Document.scrollHeight : `${100 / (this.contentScaling || 1)}%`// : this.isAnnotationOverlay ? (this.Document.scrollHeight ? this.Document.scrollHeight : "100%") : this.props.PanelHeight()
            }}>
            {this.Document._freeformLOD && !this.props.isContentActive() && !this.props.isAnnotationOverlay && this.props.renderDepth > 0 ?
                this.placeholder : this.marqueeView}
            {this.props.noOverlay ? (null) : <CollectionFreeFormOverlayView elements={this.elementFunc} />}


            <div className={"pullpane-indicator"}
                style={{
                    display: this._pullDirection ? "block" : "none",
                    top: clientRect ? this._pullDirection === "bottom" ? this._pullCoords[1] - clientRect.y : 0 : "auto",
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

            {this.props.Document._isGroup && SnappingManager.GetIsDragging() && (this.ChildDrag || this.props.layerProvider?.(this.props.Document) === false) ?
                <div className="collectionFreeForm-groupDropper" ref={this.createDashEventsTarget} style={{
                    width: this.ChildDrag ? "10000" : "100%",
                    height: this.ChildDrag ? "10000" : "100%",
                    left: this.ChildDrag ? "-5000" : 0,
                    top: this.ChildDrag ? "-5000" : 0,
                    position: "absolute",
                    background: "#0009930",
                    pointerEvents: "all"
                }} /> : (null)}
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
    transform: () => string;
    zoomScaling: () => number;
    viewDefDivClick?: ScriptField;
    children: () => JSX.Element[];
    transition?: string;
    presPaths?: boolean;
    progressivize?: boolean;
    presPinView?: boolean;
    isAnnotationOverlay: boolean | undefined;
}

@observer
class CollectionFreeFormViewPannableContents extends React.Component<CollectionFreeFormViewPannableContentsProps>{
    @observable _drag: string = '';

    //Adds event listener so knows pointer is down and moving
    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._drag = (e.target as any)?.id ?? "";
        document.getElementById(this._drag) && setupMoveUpEvents(e.target, e, this.onPointerMove, emptyFunction, emptyFunction);
    }

    //Adjusts the value in NodeStore
    @action
    onPointerMove = (e: PointerEvent) => {
        const doc = document.getElementById('resizable');
        const toNumber = (original: number, delta: number) => original + (delta * this.props.zoomScaling());
        if (doc) {
            switch (this._drag) {
                case "resizer-br":
                    doc.style.width = toNumber(doc.offsetWidth, e.movementX) + 'px';
                    doc.style.height = toNumber(doc.offsetHeight, e.movementY) + 'px';
                    break;
                case "resizer-bl":
                    doc.style.width = toNumber(doc.offsetWidth, -e.movementX) + 'px';
                    doc.style.height = toNumber(doc.offsetHeight, e.movementY) + 'px';
                    doc.style.left = toNumber(doc.offsetLeft, e.movementX) + 'px';
                    break;
                case "resizer-tr":
                    doc.style.width = toNumber(doc.offsetWidth, -e.movementX) + 'px';
                    doc.style.height = toNumber(doc.offsetHeight, -e.movementY) + 'px';
                    doc.style.top = toNumber(doc.offsetTop, e.movementY) + 'px';
                case "resizer-tl":
                    doc.style.width = toNumber(doc.offsetWidth, -e.movementX) + 'px';
                    doc.style.height = toNumber(doc.offsetHeight, -e.movementY) + 'px';
                    doc.style.top = toNumber(doc.offsetTop, e.movementY) + 'px';
                    doc.style.left = toNumber(doc.offsetLeft, e.movementX) + 'px';
                case "resizable":
                    doc.style.top = toNumber(doc.offsetTop, e.movementY) + 'px';
                    doc.style.left = toNumber(doc.offsetLeft, e.movementX) + 'px';
            }
            return false;
        }
        return true;
    }

    // scale: NumCast(targetDoc._viewScale),
    @computed get zoomProgressivizeContainer() {
        const activeItem = PresBox.Instance.activeItem;
        // const targetDoc = PresBox.Instance.targetDoc;
        if (activeItem && activeItem.presPinView && activeItem.id) {
            const left = NumCast(activeItem.presPinViewX);
            const top = NumCast(activeItem.presPinViewY);
            const width = 100;
            const height = 100;
            return !this.props.presPinView ? (null) :
                <div key="resizable" className="resizable" onPointerDown={this.onPointerDown} style={{ width, height, top, left, position: 'absolute' }}>
                    <div className='resizers' key={'resizer' + activeItem.id}>
                        <div className='resizer top-left' onPointerDown={this.onPointerDown} />
                        <div className='resizer top-right' onPointerDown={this.onPointerDown} />
                        <div className='resizer bottom-left' onPointerDown={this.onPointerDown} />
                        <div className='resizer bottom-right' onPointerDown={this.onPointerDown} />
                    </div>
                </div>;
        }
    }

    @computed get zoomProgressivize() {
        return PresBox.Instance?.activeItem?.presPinView && PresBox.Instance.layoutDoc.presStatus === 'edit' ? this.zoomProgressivizeContainer : (null);
    }

    @computed get progressivize() {
        return PresBox.Instance && this.props.progressivize ? PresBox.Instance.progressivizeChildDocs : (null);
    }

    @computed get presPaths() {
        const presPaths = "presPaths" + (this.props.presPaths ? "" : "-hidden");
        return !PresBox.Instance || !this.props.presPaths ? (null) : <>
            <div key="presorder">{PresBox.Instance.order}</div>
            <svg key="svg" className={presPaths}>
                <defs>
                    <marker id="markerSquare" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto" overflow="visible">
                        <rect x="0" y="0" width="3" height="3" stroke="#69a6db" strokeWidth="1" fill="white" fillOpacity="0.8" />
                    </marker>
                    <marker id="markerSquareFilled" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto" overflow="visible">
                        <rect x="0" y="0" width="3" height="3" stroke="#69a6db" strokeWidth="1" fill="#69a6db" />
                    </marker>
                    <marker id="markerArrow" markerWidth="3" markerHeight="3" refX="2" refY="4" orient="auto" overflow="visible">
                        <path d="M2,2 L2,6 L6,4 L2,2 Z" stroke="#69a6db" strokeLinejoin="round" strokeWidth="1" fill="white" fillOpacity="0.8" />
                    </marker>
                </defs>
                {PresBox.Instance.paths}
            </svg>
        </>;
    }

    render() {
        return <div className={"collectionfreeformview" + (this.props.viewDefDivClick ? "-viewDef" : "-none")}
            onScroll={e => {
                const target = e.target as any;
                if (getComputedStyle(target)?.overflow === "visible") {  // if collection is visible, then scrolling will mess things up since there are no scroll bars
                    target.scrollTop = target.scrollLeft = 0;
                }
            }}
            style={{
                transform: this.props.transform(),
                transition: this.props.transition,
                width: this.props.isAnnotationOverlay ? undefined : 0, // if not an overlay, then this will be the size of the collection, but panning and zooming will move it outside the visible border of the collection and make it selectable.  This problem shows up after zooming/panning on a background collection -- you can drag the collection by clicking on apparently empty space outside the collection
                //willChange: "transform"
            }}>
            {this.props.children()}
            {this.presPaths}
            {this.progressivize}
            {this.zoomProgressivize}
        </div>;
    }
}