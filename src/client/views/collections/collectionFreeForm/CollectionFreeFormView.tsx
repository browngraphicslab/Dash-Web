import { library } from "@fortawesome/fontawesome-svg-core";
import { faEye } from "@fortawesome/free-regular-svg-icons";
import { faBraille, faChalkboard, faCompass, faCompressArrowsAlt, faExpandArrowsAlt, faPaintBrush, faTable, faUpload, faFileUpload } from "@fortawesome/free-solid-svg-icons";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, Opt, WidthSym } from "../../../../new_fields/Doc";
import { Id } from "../../../../new_fields/FieldSymbols";
import { InkField, StrokeData } from "../../../../new_fields/InkField";
import { createSchema, makeInterface } from "../../../../new_fields/Schema";
import { ScriptField } from "../../../../new_fields/ScriptField";
import { BoolCast, Cast, DateCast, NumCast, StrCast } from "../../../../new_fields/Types";
import { CurrentUserUtils } from "../../../../server/authentication/models/current_user_utils";
import { aggregateBounds, emptyFunction, intersectRect, returnEmptyString, returnOne, Utils } from "../../../../Utils";
import { CognitiveServices } from "../../../cognitive_services/CognitiveServices";
import { DocServer } from "../../../DocServer";
import { Docs } from "../../../documents/Documents";
import { DocumentType } from "../../../documents/DocumentTypes";
import { DocumentManager } from "../../../util/DocumentManager";
import { DragManager } from "../../../util/DragManager";
import { HistoryUtil } from "../../../util/History";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch, UndoManager } from "../../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from "../../../views/globalCssVariables.scss";
import { ContextMenu } from "../../ContextMenu";
import { ContextMenuProps } from "../../ContextMenuItem";
import { InkingCanvas } from "../../InkingCanvas";
import { CollectionFreeFormDocumentView, positionSchema } from "../../nodes/CollectionFreeFormDocumentView";
import { DocumentContentsView } from "../../nodes/DocumentContentsView";
import { documentSchema, DocumentViewProps } from "../../nodes/DocumentView";
import { FormattedTextBox } from "../../nodes/FormattedTextBox";
import { pageSchema } from "../../nodes/ImageBox";
import PDFMenu from "../../pdf/PDFMenu";
import { CollectionSubView } from "../CollectionSubView";
import { computePivotLayout, ViewDefResult } from "./CollectionFreeFormLayoutEngines";
import { CollectionFreeFormLinksView } from "./CollectionFreeFormLinksView";
import { CollectionFreeFormRemoteCursors } from "./CollectionFreeFormRemoteCursors";
import "./CollectionFreeFormView.scss";
import { MarqueeView } from "./MarqueeView";
import React = require("react");

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
});

type PanZoomDocument = makeInterface<[typeof panZoomSchema, typeof documentSchema, typeof positionSchema, typeof pageSchema]>;
const PanZoomDocument = makeInterface(panZoomSchema, documentSchema, positionSchema, pageSchema);

@observer
export class CollectionFreeFormView extends CollectionSubView(PanZoomDocument) {
    private _lastX: number = 0;
    private _lastY: number = 0;
    private _clusterDistance: number = 75;
    private _hitCluster = false;
    @observable _clusterSets: (Doc[])[] = [];

    @computed get fitToContent() { return (this.props.fitToBox || this.Document.fitToBox) && !this.isAnnotationOverlay; }
    @computed get parentScaling() { return this.props.ContentScaling && this.fitToContent && !this.isAnnotationOverlay ? this.props.ContentScaling() : 1; }
    @computed get contentBounds() { return aggregateBounds(this.elements.filter(e => e.bounds && !e.bounds.z).map(e => e.bounds!)); }
    @computed get nativeWidth() { return this.fitToContent ? 0 : this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.fitToContent ? 0 : this.Document.nativeHeight || 0; }
    private get isAnnotationOverlay() { return this.props.fieldExt ? true : false; } // fieldExt will be "" or "annotation". should maybe generalize this, or make it more specific (ie, 'annotation' instead of 'fieldExt')
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
        this.addDocument(newBox, false);
    }
    private addDocument = (newBox: Doc, allowDuplicates: boolean) => {
        let added = this.props.addDocument(newBox, false);
        added && this.bringToFront(newBox);
        added && this.updateCluster(newBox);
        return added;
    }
    private selectDocuments = (docs: Doc[]) => {
        SelectionManager.DeselectAll();
        docs.map(doc => DocumentManager.Instance.getDocumentView(doc)).map(dv => dv && SelectionManager.SelectDoc(dv, true));
    }
    public isCurrent(doc: Doc) { return !this.props.Document.isMinimized && (Math.abs(NumCast(doc.page, -1) - NumCast(this.Document.curPage, -1)) < 1.5 || NumCast(doc.page, -1) === -1); }

    public getActiveDocuments = () => {
        return this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map(pair => pair.layout);
    }

    @computed get fieldExtensionDoc() {
        return Doc.fieldExtensionDoc(this.props.DataDoc || this.props.Document, this.props.fieldKey);
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
                    let z = NumCast(de.data.droppedDocuments[0].z);
                    let x = (z ? xpo : xp) - de.data.offset[0];
                    let y = (z ? ypo : yp) - de.data.offset[1];
                    let dropX = NumCast(de.data.droppedDocuments[0].x);
                    let dropY = NumCast(de.data.droppedDocuments[0].y);
                    de.data.droppedDocuments.forEach(action((d: Doc) => {
                        d.x = x + NumCast(d.x) - dropX;
                        d.y = y + NumCast(d.y) - dropY;
                        if (!NumCast(d.width)) {
                            d.width = 300;
                        }
                        if (!NumCast(d.height)) {
                            let nw = NumCast(d.nativeWidth);
                            let nh = NumCast(d.nativeHeight);
                            d.height = nw && nh ? nh / nw * NumCast(d.width) : 300;
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
                    let dropX = NumCast(de.data.dropDocument.x);
                    let dropY = NumCast(de.data.dropDocument.y);
                    dragDoc.x = x + NumCast(dragDoc.x) - dropX;
                    dragDoc.y = y + NumCast(dragDoc.y) - dropY;
                    de.data.targetContext = this.props.Document;
                    dragDoc.targetContext = this.props.Document;
                    this.bringToFront(dragDoc);
                }
            }
        }
        return false;
    }

    pickCluster(probe: number[]) {
        return this.childLayoutPairs.map(pair => pair.layout).reduce((cluster, cd) => {
            let cx = NumCast(cd.x) - this._clusterDistance;
            let cy = NumCast(cd.y) - this._clusterDistance;
            let cw = NumCast(cd.width) + 2 * this._clusterDistance;
            let ch = NumCast(cd.height) + 2 * this._clusterDistance;
            return !cd.z && intersectRect({ left: cx, top: cy, width: cw, height: ch }, { left: probe[0], top: probe[1], width: 1, height: 1 }) ?
                NumCast(cd.cluster) : cluster;
        }, -1);
    }
    tryDragCluster(e: PointerEvent) {
        let cluster = this.pickCluster(this.getTransform().transformPoint(e.clientX, e.clientY));
        if (cluster !== -1) {
            let eles = this.childLayoutPairs.map(pair => pair.layout).filter(cd => NumCast(cd.cluster) === cluster);

            // hacky way to get a list of DocumentViews in the current view given a list of Documents in the current view
            let prevSelected = SelectionManager.SelectedDocuments();
            this.selectDocuments(eles);
            let clusterDocs = SelectionManager.SelectedDocuments();
            SelectionManager.DeselectAll();
            prevSelected.map(dv => SelectionManager.SelectDoc(dv, true));

            let de = new DragManager.DocumentDragData(eles);
            de.moveDocument = this.props.moveDocument;
            const [left, top] = clusterDocs[0].props.ScreenToLocalTransform().scale(clusterDocs[0].props.ContentScaling()).inverse().transformPoint(0, 0);
            de.offset = this.getTransform().transformDirection(e.x - left, e.y - top);
            de.dropAction = e.ctrlKey || e.altKey ? "alias" : undefined;
            DragManager.StartDocumentDrag(clusterDocs.map(v => v.ContentDiv!), de, e.clientX, e.clientY, {
                handlers: { dragComplete: action(emptyFunction) },
                hideSource: !de.dropAction
            });
            return true;
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

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._hitCluster = this.props.Document.useClusters ? this.pickCluster(this.getTransform().transformPoint(e.clientX, e.clientY)) !== -1 : false;
        if (e.button === 0 && !e.shiftKey && !e.altKey && (!this.isAnnotationOverlay || this.zoomScaling() !== 1) && this.props.active()) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);
            this._lastX = e.pageX;
            this._lastY = e.pageY;
        }
    }

    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble && !this.isAnnotationOverlay) {
            if (this._hitCluster && this.tryDragCluster(e)) {
                e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
                e.preventDefault();
                document.removeEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
                return;
            }
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
                    let x = NumCast(doc.x);
                    let xe = x + NumCast(doc.width);
                    let y = NumCast(doc.y);
                    let ye = y + NumCast(doc.height);
                    return [[range[0][0] > x ? x : range[0][0], range[0][1] < xe ? xe : range[0][1]],
                    [range[1][0] > y ? y : range[1][0], range[1][1] < ye ? ye : range[1][1]]];
                }, [[minx, maxx], [miny, maxy]]);
                let ink = Cast(this.fieldExtensionDoc.ink, InkField);
                if (ink && ink.inkData) {
                    ink.inkData.forEach((value: StrokeData, key: string) => {
                        let bounds = InkingCanvas.StrokeRect(value);
                        ranges[0] = [Math.min(ranges[0][0], bounds.left), Math.max(ranges[0][1], bounds.right)];
                        ranges[1] = [Math.min(ranges[1][0], bounds.top), Math.max(ranges[1][1], bounds.bottom)];
                    });
                }

                let cscale = this.props.ContainingCollectionDoc ? NumCast(this.props.ContainingCollectionDoc.scale) : 1;
                let panelDim = this.props.ScreenToLocalTransform().transformDirection(this.props.PanelWidth() / this.zoomScaling() * cscale,
                    this.props.PanelHeight() / this.zoomScaling() * cscale);
                if (ranges[0][0] - dx > (this.panX() + panelDim[0] / 2)) x = ranges[0][1] + panelDim[0] / 2;
                if (ranges[0][1] - dx < (this.panX() - panelDim[0] / 2)) x = ranges[0][0] - panelDim[0] / 2;
                if (ranges[1][0] - dy > (this.panY() + panelDim[1] / 2)) y = ranges[1][1] + panelDim[1] / 2;
                if (ranges[1][1] - dy < (this.panY() - panelDim[1] / 2)) y = ranges[1][0] - panelDim[1] / 2;
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
        if (this.props.Document.lockedPosition || this.isAnnotationOverlay) return;
        if (!e.ctrlKey && this.props.Document.scrollHeight !== undefined) { // things that can scroll vertically should do that instead of zooming
            e.stopPropagation();
        }
        else if (this.props.active()) {
            e.stopPropagation();
            let deltaScale = e.deltaY > 0 ? (1 / 1.1) : 1.1;
            if (deltaScale * this.zoomScaling() < 1 && this.isAnnotationOverlay) {
                deltaScale = 1 / this.zoomScaling();
            }
            if (deltaScale < 0) deltaScale = -deltaScale;
            let [x, y] = this.getTransform().transformPoint(e.clientX, e.clientY);
            let localTransform = this.getLocalTransform().inverse().scaleAbout(deltaScale, x, y);

            let safeScale = Math.min(Math.max(0.15, localTransform.Scale), 40);
            this.props.Document.scale = Math.abs(safeScale);
            this.setPan(-localTransform.TranslateX / safeScale, -localTransform.TranslateY / safeScale);
        }
    }

    @action
    setPan(panX: number, panY: number) {
        if (!this.props.Document.lockedPosition) {
            this.props.Document.panTransformType = "None";
            var scale = this.getLocalTransform().inverse().Scale;
            const newPanX = Math.min((1 - 1 / scale) * this.nativeWidth, Math.max(0, panX));
            const newPanY = Math.min((this.props.Document.scrollHeight !== undefined ? NumCast(this.props.Document.scrollHeight) : (1 - 1 / scale) * this.nativeHeight), Math.max(0, panY));
            this.props.Document.panX = this.isAnnotationOverlay ? newPanX : panX;
            this.props.Document.panY = this.isAnnotationOverlay ? newPanY : panY;
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
            let offset = annotOn && (NumCast(annotOn.height) / 2);
            this.props.Document.scrollY = NumCast(doc.y) - offset;
        } else {
            const newPanX = NumCast(doc.x) + NumCast(doc.width) / 2;
            const newPanY = NumCast(doc.y) + NumCast(doc.height) / 2;
            const newState = HistoryUtil.getState();
            newState.initializers![this.Document[Id]] = { panX: newPanX, panY: newPanY };
            HistoryUtil.pushState(newState);

            let savedState = { px: this.Document.panX, py: this.Document.panY, s: this.Document.scale, pt: this.Document.panTransformType };

            this.setPan(newPanX, newPanY);
            this.Document.panTransformType = "Ease";
            this.props.focus(this.props.Document);
            willZoom && this.setScaleToZoom(doc, scale);

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
    getDocumentViewProps(layoutDoc: Doc): DocumentViewProps {
        return {
            ...this.props,
            ScreenToLocalTransform: this.getTransform,
            PanelWidth: layoutDoc[WidthSym],
            PanelHeight: layoutDoc[HeightSym],
            ContentScaling: returnOne,
            ContainingCollectionView: this.props.CollectionView,
            focus: this.focusDocument,
            backgroundColor: returnEmptyString,
            parentActive: this.props.active,
            bringToFront: this.bringToFront,
            zoomToScale: this.zoomToScale,
            getScale: this.getScale
        };
    }

    getCalculatedPositions(params: { doc: Doc, index: number, collection: Doc, docs: Doc[], state: any }): { x?: number, y?: number, z?: number, width?: number, height?: number, transition?: string, state?: any } {
        const script = this.Document.arrangeScript;
        const result = script && script.script.run(params, console.log);
        if (result && result.success) {
            return { ...result, transition: "transform 1s" };
        }
        return { x: Cast(params.doc.x, "number"), y: Cast(params.doc.y, "number"), z: Cast(params.doc.z, "number"), width: Cast(params.doc.width, "number"), height: Cast(params.doc.height, "number") };
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

    lookupLayout = (doc: Doc, dataDoc?: Doc) => {
        let data: any = undefined;
        let computedElementData: { map: Map<{ layout: Doc, data?: Doc | undefined }, any>, elements: ViewDefResult[] };
        switch (this.Document.freeformLayoutEngine) {
            case "pivot": computedElementData = this.doPivotLayout; break;
            default: computedElementData = this.doFreeformLayout; break;
        }
        computedElementData.map.forEach((value: any, key: { layout: Doc, data?: Doc }) => {
            if (key.layout === doc && key.data === dataDoc) {
                data = value;
            }
        });
        return data && { x: data.x, y: data.y, z: data.z, width: data.width, height: data.height, transition: data.transition };
    }

    @computed
    get doPivotLayout() {
        return computePivotLayout(this.props.Document, this.childDocs,
            this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)), this.viewDefsToJSX);
    }

    @computed
    get doFreeformLayout() {
        let layoutPoolData: Map<{ layout: Doc, data?: Doc }, any> = new Map();
        let layoutDocs = this.childLayoutPairs.map(pair => pair.layout);
        const initResult = this.Document.arrangeInit && this.Document.arrangeInit.script.run({ docs: layoutDocs, collection: this.Document }, console.log);
        let state = initResult && initResult.success ? initResult.result.scriptState : undefined;
        let elements = initResult && initResult.success ? this.viewDefsToJSX(initResult.result.views) : [];

        this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).map((pair, i) => {
            const pos = this.getCalculatedPositions({ doc: pair.layout, index: i, collection: this.Document, docs: layoutDocs, state });
            state = pos.state === undefined ? state : pos.state;
            layoutPoolData.set(pair, pos);
        });
        return { map: layoutPoolData, elements: elements };
    }

    @computed
    get doLayoutComputation() {
        let computedElementData: { map: Map<{ layout: Doc, data?: Doc | undefined }, any>, elements: ViewDefResult[] };
        switch (this.Document.freeformLayoutEngine) {
            case "pivot": computedElementData = this.doPivotLayout; break;
            default: computedElementData = this.doFreeformLayout; break;
        }
        this.childLayoutPairs.filter(pair => this.isCurrent(pair.layout)).forEach(pair =>
            computedElementData.elements.push({
                ele: <CollectionFreeFormDocumentView key={pair.layout[Id]} dataProvider={this.lookupLayout}
                    ruleProvider={this.Document.isRuleProvider ? this.props.Document : this.props.ruleProvider}
                    jitterRotation={NumCast(this.props.Document.jitterRotation)} {...this.getChildDocumentViewProps(pair.layout, pair.data)} />,
                bounds: this.lookupLayout(pair.layout, pair.data)
            }));

        return computedElementData;
    }

    @computed.struct get elements() { return this.doLayoutComputation.elements; }
    @computed.struct get views() { return this.elements.filter(ele => ele.bounds && !ele.bounds.z).map(ele => ele.ele); }
    @computed.struct get overlayViews() { return this.elements.filter(ele => ele.bounds && ele.bounds.z).map(ele => ele.ele); }

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
            DocListCast(pair.layout.layout instanceof Doc ? pair.layout.layout.data : pair.layout.data).map(heading => {
                let headingPair = Doc.GetLayoutDataDocPair(this.props.Document, this.props.DataDoc, this.props.fieldKey, heading);
                let headingLayout = headingPair.layout && (pair.layout.data_ext instanceof Doc) && (pair.layout.data_ext[`Layout[${headingPair.layout[Id]}]`] as Doc) || headingPair.layout;
                if (headingLayout && NumCast(headingLayout.heading) > 0 && headingLayout.backgroundColor !== headingLayout.defaultBackgroundColor) {
                    Doc.GetProto(this.props.Document)["ruleColor_" + NumCast(headingLayout.heading)] = headingLayout.backgroundColor;
                }
            })
        );
    }

    analyzeStrokes = async () => {
        let data = Cast(this.fieldExtensionDoc.ink, InkField);
        if (data) {
            CognitiveServices.Inking.Appliers.ConcatenateHandwriting(this.fieldExtensionDoc, ["inkAnalysis", "handwriting"], data.inkData);
        }
    }

    onContextMenu = (e: React.MouseEvent) => {
        let layoutItems: ContextMenuProps[] = [];

        if (this.childDocs.some(d => BoolCast(d.isTemplate))) {
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
                                this.props.addDocument && this.props.addDocument(doc, false);
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


    private childViews = () => [
        <CollectionFreeFormBackgroundView key="backgroundView" {...this.props} {...this.getDocumentViewProps(this.props.Document)} />,
        ...this.views
    ]
    render() {
        // update the actual dimensions of the collection so that they can inquired (e.g., by a minimap)
        this.props.Document.fitX = this.contentBounds && this.contentBounds.x;
        this.props.Document.fitY = this.contentBounds && this.contentBounds.y;
        this.props.Document.fitW = this.contentBounds && (this.contentBounds.r - this.contentBounds.x);
        this.props.Document.fitH = this.contentBounds && (this.contentBounds.b - this.contentBounds.y);
        // if fieldExt is set, then children will be stored in the extension document for the fieldKey.
        // otherwise, they are stored in fieldKey.  All annotations to this document are stored in the extension document
        Doc.UpdateDocumentExtensionForField(this.props.DataDoc || this.props.Document, this.props.fieldKey);
        return (
            <div className={"collectionfreeformview-container"} ref={this.createDropTarget} onWheel={this.onPointerWheel}
                style={{ pointerEvents: SelectionManager.GetIsDragging() ? "all" : undefined, height: this.isAnnotationOverlay ? (NumCast(this.props.Document.scrollHeight) ? NumCast(this.props.Document.scrollHeight) : "100%") : this.props.PanelHeight() }}
                onPointerDown={this.onPointerDown} onPointerMove={this.onCursorMove} onDrop={this.onDrop.bind(this)} onContextMenu={this.onContextMenu}>
                <MarqueeView container={this} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments} isSelected={this.props.isSelected}
                    addDocument={this.addDocument} removeDocument={this.props.removeDocument} addLiveTextDocument={this.addLiveTextBox} setPreviewCursor={this.props.setPreviewCursor}
                    getContainerTransform={this.getContainerTransform} getTransform={this.getTransform} isAnnotationOverlay={this.isAnnotationOverlay}>
                    <CollectionFreeFormViewPannableContents centeringShiftX={this.centeringShiftX} centeringShiftY={this.centeringShiftY}
                        easing={this.easing} zoomScaling={this.zoomScaling} panX={this.panX} panY={this.panY}>
                        <CollectionFreeFormLinksView {...this.props} key="freeformLinks">
                            <InkingCanvas getScreenTransform={this.getTransform} Document={this.props.Document} AnnotationDocument={this.fieldExtensionDoc} inkFieldKey={"ink"} >
                                {this.childViews}
                            </InkingCanvas>
                        </CollectionFreeFormLinksView>
                        <CollectionFreeFormRemoteCursors {...this.props} key="remoteCursors" />
                    </CollectionFreeFormViewPannableContents>
                </MarqueeView>
                {this.overlayViews}
                <CollectionFreeFormOverlayView  {...this.props} {...this.getDocumentViewProps(this.props.Document)} />
            </div>
        );
    }
}

@observer
class CollectionFreeFormOverlayView extends React.Component<DocumentViewProps & { isSelected: () => boolean }> {
    render() {
        return <DocumentContentsView {...this.props} layoutKey={"overlayLayout"}
            renderDepth={this.props.renderDepth} isSelected={this.props.isSelected} select={emptyFunction} />;
    }
}

@observer
class CollectionFreeFormBackgroundView extends React.Component<DocumentViewProps & { isSelected: () => boolean }> {
    render() {
        return !this.props.Document.backgroundLayout ? (null) :
            (<DocumentContentsView {...this.props} layoutKey={"backgroundLayout"}
                renderDepth={this.props.renderDepth} isSelected={this.props.isSelected} select={emptyFunction} />);
    }
}

interface CollectionFreeFormViewPannableContentsProps {
    centeringShiftX: () => number;
    centeringShiftY: () => number;
    panX: () => number;
    panY: () => number;
    zoomScaling: () => number;
    easing: () => boolean;
}

@observer
class CollectionFreeFormViewPannableContents extends React.Component<CollectionFreeFormViewPannableContentsProps>{
    render() {
        let freeformclass = "collectionfreeformview" + (this.props.easing() ? "-ease" : "-none");
        const cenx = this.props.centeringShiftX();
        const ceny = this.props.centeringShiftY();
        const panx = -this.props.panX();
        const pany = -this.props.panY();
        const zoom = this.props.zoomScaling();// needs to be a variable outside of the <Measure> otherwise, reactions won't fire
        return <div className={freeformclass} style={{ borderRadius: "inherit", transform: `translate(${cenx}px, ${ceny}px) scale(${zoom}, ${zoom}) translate(${panx}px, ${pany}px)` }}>
            {this.props.children}
        </div>;
    }
}