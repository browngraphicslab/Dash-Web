import { library } from "@fortawesome/fontawesome-svg-core";
import { faEye } from "@fortawesome/free-regular-svg-icons";
import { faBraille, faChalkboard, faCompass, faCompressArrowsAlt, faExpandArrowsAlt, faPaintBrush, faTable, faUpload } from "@fortawesome/free-solid-svg-icons";
import { action, computed, IReactionDisposer, observable, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCastAsync, Field, FieldResult, HeightSym, Opt, WidthSym, DocListCast } from "../../../../new_fields/Doc";
import { Id } from "../../../../new_fields/FieldSymbols";
import { InkField, StrokeData } from "../../../../new_fields/InkField";
import { createSchema, makeInterface } from "../../../../new_fields/Schema";
import { ScriptField } from "../../../../new_fields/ScriptField";
import { BoolCast, Cast, FieldValue, NumCast, StrCast, PromiseValue, DateCast } from "../../../../new_fields/Types";
import { emptyFunction, returnEmptyString, returnOne, Utils } from "../../../../Utils";
import { CognitiveServices } from "../../../cognitive_services/CognitiveServices";
import { Docs } from "../../../documents/Documents";
import { DocumentType } from "../../../documents/DocumentTypes";
import { DocumentManager } from "../../../util/DocumentManager";
import { DragManager } from "../../../util/DragManager";
import { HistoryUtil } from "../../../util/History";
import { CompileScript } from "../../../util/Scripting";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch, UndoManager } from "../../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from "../../../views/globalCssVariables.scss";
import { ContextMenu } from "../../ContextMenu";
import { ContextMenuProps } from "../../ContextMenuItem";
import { InkingCanvas } from "../../InkingCanvas";
import { CollectionFreeFormDocumentView } from "../../nodes/CollectionFreeFormDocumentView";
import { DocumentContentsView } from "../../nodes/DocumentContentsView";
import { DocumentViewProps, positionSchema } from "../../nodes/DocumentView";
import { pageSchema } from "../../nodes/ImageBox";
import { OverlayElementOptions, OverlayView } from "../../OverlayView";
import PDFMenu from "../../pdf/PDFMenu";
import { ScriptBox } from "../../ScriptBox";
import { CollectionSubView } from "../CollectionSubView";
import { CollectionFreeFormLinksView } from "./CollectionFreeFormLinksView";
import { CollectionFreeFormRemoteCursors } from "./CollectionFreeFormRemoteCursors";
import "./CollectionFreeFormView.scss";
import { MarqueeView } from "./MarqueeView";
import React = require("react");
import { DocServer } from "../../../DocServer";
import { FormattedTextBox } from "../../nodes/FormattedTextBox";
import { CurrentUserUtils } from "../../../../server/authentication/models/current_user_utils";

library.add(faEye as any, faTable, faPaintBrush, faExpandArrowsAlt, faCompressArrowsAlt, faCompass, faUpload, faBraille, faChalkboard);

export const panZoomSchema = createSchema({
    panX: "number",
    panY: "number",
    scale: "number",
    arrangeScript: ScriptField,
    arrangeInit: ScriptField,
});

export interface ViewDefBounds {
    x: number;
    y: number;
    z?: number;
    width: number;
    height: number;
}

export interface ViewDefResult {
    ele: JSX.Element;
    bounds?: ViewDefBounds;
}

export namespace PivotView {

    export interface PivotData {
        type: string;
        text: string;
        x: number;
        y: number;
        width: number;
        height: number;
        fontSize: number;
    }

    export const elements = (target: CollectionFreeFormView) => {
        let collection = target.Document;
        const field = StrCast(collection.pivotField) || "title";
        const width = NumCast(collection.pivotWidth) || 200;
        const groups = new Map<FieldResult<Field>, Doc[]>();

        for (const doc of target.childDocs) {
            const val = doc[field];
            if (val === undefined) continue;

            const l = groups.get(val);
            if (l) {
                l.push(doc);
            } else {
                groups.set(val, [doc]);
            }
        }

        let minSize = Infinity;

        groups.forEach((val, key) => minSize = Math.min(minSize, val.length));

        const numCols = NumCast(collection.pivotNumColumns) || Math.ceil(Math.sqrt(minSize));
        const fontSize = NumCast(collection.pivotFontSize);

        const docMap = new Map<Doc, ViewDefBounds>();
        const groupNames: PivotData[] = [];

        let x = 0;
        groups.forEach((val, key) => {
            let y = 0;
            let xCount = 0;
            groupNames.push({
                type: "text",
                text: String(key),
                x,
                y: width + 50,
                width: width * 1.25 * numCols,
                height: 100, fontSize: fontSize
            });
            for (const doc of val) {
                docMap.set(doc, {
                    x: x + xCount * width * 1.25,
                    y: -y,
                    width,
                    height: width
                });
                xCount++;
                if (xCount >= numCols) {
                    xCount = 0;
                    y += width * 1.25;
                }
            }
            x += width * 1.25 * (numCols + 1);
        });

        let elements = target.viewDefsToJSX(groupNames);
        let docViews = target.childDocs.reduce((prev, doc) => {
            let minim = BoolCast(doc.isMinimized);
            if (minim === undefined || !minim) {
                let defaultPosition = (): ViewDefBounds => {
                    return {
                        x: NumCast(doc.x),
                        y: NumCast(doc.y),
                        z: NumCast(doc.z),
                        width: NumCast(doc.width),
                        height: NumCast(doc.height)
                    };
                };
                const pos = docMap.get(doc) || defaultPosition();
                prev.push({
                    ele: <CollectionFreeFormDocumentView
                        key={doc[Id]}
                        x={pos.x}
                        y={pos.y}
                        width={pos.width}
                        height={pos.height}
                        jitterRotation={NumCast(target.props.Document.jitterRotation)}
                        {...target.getChildDocumentViewProps(doc)}
                    />,
                    bounds: {
                        x: pos.x,
                        y: pos.y,
                        z: pos.z,
                        width: NumCast(pos.width),
                        height: NumCast(pos.height)
                    }
                });
            }
            return prev;
        }, elements);

        return docViews;
    };

}

type PanZoomDocument = makeInterface<[typeof panZoomSchema, typeof positionSchema, typeof pageSchema]>;
const PanZoomDocument = makeInterface(panZoomSchema, positionSchema, pageSchema);

@observer
export class CollectionFreeFormView extends CollectionSubView(PanZoomDocument) {
    private _lastX: number = 0;
    private _lastY: number = 0;
    private get _pwidth() { return this.props.PanelWidth(); }
    private get _pheight() { return this.props.PanelHeight(); }
    private inkKey = "ink";
    private _childLayoutDisposer?: IReactionDisposer;
    private _childDisposer?: IReactionDisposer;

    componentDidMount() {
        this._childDisposer = reaction(() => this.childDocs,
            async (childDocs) => {
                let childLayout = Cast(this.props.Document.childLayout, Doc) as Doc;
                childLayout && childDocs.map(async doc => {
                    if (!Doc.AreProtosEqual(childLayout, (await doc).layout as Doc)) {
                        Doc.ApplyTemplateTo(childLayout, doc, undefined);
                    }
                });
            });
        this._childLayoutDisposer = reaction(() => Cast(this.props.Document.childLayout, Doc),
            async (childLayout) => {
                this.childDocs.map(async doc => {
                    if (!Doc.AreProtosEqual(childLayout as Doc, (await doc).layout as Doc)) {
                        Doc.ApplyTemplateTo(childLayout as Doc, doc, undefined);
                    }
                });
            });
    }
    componentWillUnmount() {
        this._childDisposer && this._childDisposer();
        this._childLayoutDisposer && this._childLayoutDisposer();
    }

    get parentScaling() {
        return (this.props as any).ContentScaling && this.fitToBox && !this.isAnnotationOverlay ? (this.props as any).ContentScaling() : 1;
    }

    ComputeContentBounds(boundsList: { x: number, y: number, width: number, height: number }[]) {
        let bounds = boundsList.reduce((bounds, b) => {
            var [sptX, sptY] = [b.x, b.y];
            let [bptX, bptY] = [sptX + NumCast(b.width, 1), sptY + NumCast(b.height, 1)];
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            };
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: -Number.MAX_VALUE, b: -Number.MAX_VALUE });
        return bounds;
    }

    @computed get actualContentBounds() {
        return this.fitToBox && !this.isAnnotationOverlay ? this.ComputeContentBounds(this.elements.filter(e => e.bounds && !e.bounds.z).map(e => e.bounds!)) : undefined;
    }

    @computed get contentBounds() {
        let bounds = this.actualContentBounds;
        let res = {
            panX: bounds ? (bounds.x + bounds.r) / 2 : this.Document.panX || 0,
            panY: bounds ? (bounds.y + bounds.b) / 2 : this.Document.panY || 0,
            scale: (bounds ? Math.min(this.props.PanelHeight() / (bounds.b - bounds.y), this.props.PanelWidth() / (bounds.r - bounds.x)) : this.Document.scale || 1) / this.parentScaling
        };
        if (res.scale === 0) res.scale = 1;
        return res;
    }

    @computed get fitToBox() { return this.props.fitToBox || this.props.Document.fitToBox; }
    @computed get nativeWidth() { return this.fitToBox ? 0 : this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.fitToBox ? 0 : this.Document.nativeHeight || 0; }
    public get isAnnotationOverlay() { return this.props.fieldExt ? true : false; } // fieldExt will be "" or "annotation". should maybe generalize this, or make it more specific (ie, 'annotation' instead of 'fieldExt')
    private get borderWidth() { return this.isAnnotationOverlay ? 0 : COLLECTION_BORDER_WIDTH; }
    private panX = () => this.contentBounds.panX;
    private panY = () => this.contentBounds.panY;
    private zoomScaling = () => this.contentBounds.scale;
    private centeringShiftX = () => !this.nativeWidth && !this.isAnnotationOverlay ? this._pwidth / 2 / this.parentScaling : 0;  // shift so pan position is at center of window for non-overlay collections
    private centeringShiftY = () => !this.nativeHeight && !this.isAnnotationOverlay ? this._pheight / 2 / this.parentScaling : 0;// shift so pan position is at center of window for non-overlay collections
    private getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth + 1, -this.borderWidth + 1).translate(-this.centeringShiftX(), -this.centeringShiftY()).transform(this.getLocalTransform());
    private getTransformOverlay = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth + 1, -this.borderWidth + 1);
    private getContainerTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.borderWidth, -this.borderWidth);
    private getLocalTransform = (): Transform => Transform.Identity().scale(1 / this.zoomScaling()).translate(this.panX(), this.panY());
    private addLiveTextBox = (newBox: Doc) => {
        FormattedTextBox.SelectOnLoad = newBox[Id];// track the new text box so we can give it a prop that tells it to focus itself when it's displayed
        let heading = this.childDocs.reduce((maxHeading, doc) => NumCast(doc.heading) > maxHeading ? NumCast(doc.heading) : maxHeading, 0);
        heading = heading === 0 || this.childDocs.length === 0 ? 1 : heading === 1 ? 2 : 0;
        if (heading === 0) {
            let sorted = this.childDocs.filter(d => d.type === DocumentType.TEXT && d.data_ext instanceof Doc && d.data_ext.lastModified).sort((a, b) => DateCast((Cast(a.data_ext, Doc) as Doc).lastModified).date > DateCast((Cast(b.data_ext, Doc) as Doc).lastModified).date ? 1 :
                DateCast((Cast(a.data_ext, Doc) as Doc).lastModified).date < DateCast((Cast(b.data_ext, Doc) as Doc).lastModified).date ? -1 : 0);
            heading = !sorted.length ? 1 : NumCast(sorted[sorted.length - 1].heading) === 1 ? 2 : NumCast(sorted[sorted.length - 1].heading);
        }
        newBox.heading = heading;

        if (Cast(this.props.Document.ruleProvider, Doc) as Doc) {
            newBox.ruleProvider = Doc.GetProto(Cast(this.props.Document.ruleProvider, Doc) as Doc);
        }
        this.addDocument(newBox, false);
    }
    private addDocument = (newBox: Doc, allowDuplicates: boolean) => {
        this.props.addDocument(newBox, false);
        this.bringToFront(newBox);
        this.updateCluster(newBox);
        return true;
    }
    private selectDocuments = (docs: Doc[]) => {
        SelectionManager.DeselectAll();
        docs.map(doc => DocumentManager.Instance.getDocumentView(doc)).filter(dv => dv).map(dv =>
            SelectionManager.SelectDoc(dv!, true));
    }
    public getActiveDocuments = () => {
        const curPage = FieldValue(this.Document.curPage, -1);
        return this.childDocs.filter(doc => {
            var page = NumCast(doc.page, -1);
            return page === curPage || page === -1;
        });
    }

    @computed get fieldExtensionDoc() {
        return Doc.resolvedFieldDataDoc(this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey, "true");
    }

    intersectRect(r1: { left: number, top: number, width: number, height: number },
        r2: { left: number, top: number, width: number, height: number }) {
        return !(r2.left > r1.left + r1.width || r2.left + r2.width < r1.left || r2.top > r1.top + r1.height || r2.top + r2.height < r1.top);
    }
    _clusterDistance = 75;
    boundsOverlap(doc: Doc, doc2: Doc) {
        var x2 = NumCast(doc2.x) - this._clusterDistance;
        var y2 = NumCast(doc2.y) - this._clusterDistance;
        var w2 = NumCast(doc2.width) + this._clusterDistance;
        var h2 = NumCast(doc2.height) + this._clusterDistance;
        var x = NumCast(doc.x) - this._clusterDistance;
        var y = NumCast(doc.y) - this._clusterDistance;
        var w = NumCast(doc.width) + this._clusterDistance;
        var h = NumCast(doc.height) + this._clusterDistance;
        if (doc.z === doc2.z && this.intersectRect({ left: x, top: y, width: w, height: h }, { left: x2, top: y2, width: w2, height: h2 })) {
            return true;
        }
        return false;
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
                    let x = (z ? xpo : xp) - de.data.xOffset;
                    let y = (z ? ypo : yp) - de.data.yOffset;
                    let dropX = NumCast(de.data.droppedDocuments[0].x);
                    let dropY = NumCast(de.data.droppedDocuments[0].y);
                    de.data.droppedDocuments.forEach(d => {
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
                    });

                    de.data.droppedDocuments.length == 1 && this.updateCluster(de.data.droppedDocuments[0]);
                }
            }
            else if (de.data instanceof DragManager.AnnotationDragData) {
                if (de.data.dropDocument) {
                    let dragDoc = de.data.dropDocument;
                    let x = xp - de.data.xOffset;
                    let y = yp - de.data.yOffset;
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

    tryDragCluster(e: PointerEvent) {
        let probe = this.getTransform().transformPoint(e.clientX, e.clientY);
        let cluster = this.childDocs.reduce((cluster, cd) => {
            let cx = NumCast(cd.x) - this._clusterDistance;
            let cy = NumCast(cd.y) - this._clusterDistance;
            let cw = NumCast(cd.width) + 2 * this._clusterDistance;
            let ch = NumCast(cd.height) + 2 * this._clusterDistance;
            if (!cd.z && this.intersectRect({ left: cx, top: cy, width: cw, height: ch }, { left: probe[0], top: probe[1], width: 1, height: 1 })) {
                return NumCast(cd.cluster);
            }
            return cluster;
        }, -1);
        if (cluster !== -1) {
            let eles = this.childDocs.filter(cd => NumCast(cd.cluster) === cluster);

            // hacky way to get a list of DocumentViews in the current view given a list of Documents in the current view
            let prevSelected = SelectionManager.SelectedDocuments();
            this.selectDocuments(eles);
            let clusterDocs = SelectionManager.SelectedDocuments();
            SelectionManager.DeselectAll();
            prevSelected.map(dv => SelectionManager.SelectDoc(dv, true));

            let de = new DragManager.DocumentDragData(eles, eles.map(d => undefined));
            de.moveDocument = this.props.moveDocument;
            const [left, top] = clusterDocs[0].props.ScreenToLocalTransform().scale(clusterDocs[0].props.ContentScaling()).inverse().transformPoint(0, 0);
            const [xoff, yoff] = this.getTransform().transformDirection(e.x - left, e.y - top);
            de.dropAction = e.ctrlKey || e.altKey ? "alias" : undefined;
            de.xOffset = xoff;
            de.yOffset = yoff;
            DragManager.StartDocumentDrag(clusterDocs.map(v => v.ContentDiv!), de, e.clientX, e.clientY, {
                handlers: { dragComplete: action(emptyFunction) },
                hideSource: !de.dropAction
            });
            return true;
        }

        return false;
    }
    @observable sets: (Doc[])[] = [];

    @undoBatch
    @action
    updateClusters() {
        this.sets.length = 0;
        this.childDocs.map(c => {
            let included = [];
            for (let i = 0; i < this.sets.length; i++) {
                for (let member of this.sets[i]) {
                    if (this.boundsOverlap(c, member)) {
                        included.push(i);
                        break;
                    }
                }
            }
            if (included.length === 0) {
                this.sets.push([c]);
            } else if (included.length === 1) {
                this.sets[included[0]].push(c);
            } else {
                this.sets[included[0]].push(c);
                for (let s = 1; s < included.length; s++) {
                    this.sets[included[0]].push(...this.sets[included[s]]);
                    this.sets[included[s]].length = 0;
                }
            }
        });
        this.sets.map((set, i) => set.map(member => member.cluster = i));
    }

    @undoBatch
    @action
    updateCluster(doc: Doc) {
        if (this.props.Document.useClusters) {
            this.sets.map(set => Doc.IndexOf(doc, set) !== -1 && set.splice(Doc.IndexOf(doc, set), 1));
            let preferredInd = NumCast(doc.cluster);
            doc.cluster = -1;
            this.sets.map((set, i) => set.map(member => {
                if (doc.cluster === -1 && Doc.IndexOf(member, this.childDocs) !== -1 && this.boundsOverlap(doc, member)) {
                    doc.cluster = i;
                }
            }));
            if (doc.cluster === -1 && preferredInd !== -1 && (!this.sets[preferredInd] || !this.sets[preferredInd].filter(member => Doc.IndexOf(member, this.childDocs) !== -1).length)) {
                doc.cluster = preferredInd;
            }
            this.sets.map((set, i) => {
                if (doc.cluster === -1 && !set.filter(member => Doc.IndexOf(member, this.childDocs) !== -1).length) {
                    doc.cluster = i;
                }
            });
            if (doc.cluster === -1) {
                doc.cluster = this.sets.length;
                this.sets.push([doc]);
            } else {
                for (let i = this.sets.length; i <= doc.cluster; i++) !this.sets[i] && this.sets.push([]);
                this.sets[doc.cluster].push(doc);
            }
        }
    }

    getClusterColor = (doc: Doc) => {
        if (this.props.Document.useClusters) {
            let cluster = NumCast(doc.cluster);
            if (this.sets.length <= cluster) {
                setTimeout(() => this.updateCluster(doc), 0);//  this.updateClusters(), 0);
                return "";
            }
            let set = this.sets.length > cluster ? this.sets[cluster] : undefined;
            let colors = ["#da42429e", "#31ea318c", "#8c4000", "#4a7ae2c4", "#d809ff", "#ff7601", "#1dffff", "yellow", "#1b8231f2", "#000000ad"];
            let clusterColor = colors[cluster % colors.length];
            set && set.filter(s => !s.isBackground).map(s =>
                s.backgroundColor && s.backgroundColor !== s.defaultBackgroundColor && (clusterColor = StrCast(s.backgroundColor)));
            set && set.filter(s => s.isBackground).map(s =>
                s.backgroundColor && s.backgroundColor !== s.defaultBackgroundColor && (clusterColor = StrCast(s.backgroundColor)));
            return clusterColor;
        }
        return "";
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
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
        if (!e.cancelBubble) {
            if (this.props.Document.useClusters && this.tryDragCluster(e)) {
                e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
                e.preventDefault();
                document.removeEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
                return;
            }
            let x = this.Document.panX || 0;
            let y = this.Document.panY || 0;
            let docs = this.childDocs || [];
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

                let panelDim = this.props.ScreenToLocalTransform().transformDirection(this._pwidth / this.zoomScaling(),
                    this._pheight / this.zoomScaling());
                let panelwidth = panelDim[0];
                let panelheight = panelDim[1];
                if (ranges[0][0] - dx > (this.panX() + panelwidth / 2)) x = ranges[0][1] + panelwidth / 2;
                if (ranges[0][1] - dx < (this.panX() - panelwidth / 2)) x = ranges[0][0] - panelwidth / 2;
                if (ranges[1][0] - dy > (this.panY() + panelheight / 2)) y = ranges[1][1] + panelheight / 2;
                if (ranges[1][1] - dy < (this.panY() - panelheight / 2)) y = ranges[1][0] - panelheight / 2;
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
        if (BoolCast(this.props.Document.lockedPosition)) return;
        if (!e.ctrlKey && this.props.Document.scrollHeight !== undefined) { // things that can scroll vertically should do that instead of zooming
            e.stopPropagation();
            return;
        }

        let childSelected = this.childDocs.some(doc => {
            var dv = DocumentManager.Instance.getDocumentView(doc);
            return dv && SelectionManager.IsSelected(dv) ? true : false;
        });
        if (!this.props.isSelected() && !childSelected && this.props.renderDepth > 0) {
            return;
        }
        e.stopPropagation();

        // bcz: this changes the nativewidth/height, but ImageBox will just revert it back to its defaults.  need more logic to fix.
        // if (e.ctrlKey && this.props.Document.scrollHeight === undefined) {
        //     let deltaScale = (1 - (e.deltaY / coefficient));
        //     let nw = this.nativeWidth * deltaScale;
        //     let nh = this.nativeHeight * deltaScale;
        //     if (nw && nh) {
        //         this.props.Document.nativeWidth = nw;
        //         this.props.Document.nativeHeight = nh;
        //     }
        //     e.preventDefault();
        // } 
        // else 
        {
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
            e.preventDefault();
        }
    }

    @action
    setPan(panX: number, panY: number) {
        if (!BoolCast(this.props.Document.lockedPosition)) {
            this.props.Document.panTransformType = "None";
            var scale = this.getLocalTransform().inverse().Scale;
            const newPanX = Math.min((1 - 1 / scale) * this.nativeWidth, Math.max(0, panX));
            const newPanY = Math.min((this.props.Document.scrollHeight !== undefined ? NumCast(this.props.Document.scrollHeight) : (1 - 1 / scale) * this.nativeHeight), Math.max(0, panY));
            this.props.Document.panX = this.isAnnotationOverlay ? newPanX : panX;
            this.props.Document.panY = this.isAnnotationOverlay ? newPanY : panY;
        }
    }

    @action
    onDrop = (e: React.DragEvent): void => {
        var pt = this.getTransform().transformPoint(e.pageX, e.pageY);
        super.onDrop(e, { x: pt[0], y: pt[1] });
    }

    onDragOver = (): void => {
    }

    bringToFront = (doc: Doc, sendToBack?: boolean) => {
        if (sendToBack || doc.isBackground) {
            doc.zIndex = 0;
            return;
        }
        const docs = this.childDocs;
        docs.slice().sort((doc1, doc2) => {
            if (doc1 === doc) return 1;
            if (doc2 === doc) return -1;
            return NumCast(doc1.zIndex) - NumCast(doc2.zIndex);
        }).forEach((doc, index) => doc.zIndex = index + 1);
        doc.zIndex = docs.length + 1;
    }

    focusDocument = (doc: Doc, willZoom: boolean, scale?: number) => {
        const panX = this.Document.panX;
        const panY = this.Document.panY;
        const id = this.Document[Id];
        const state = HistoryUtil.getState();
        state.initializers = state.initializers || {};
        // TODO This technically isn't correct if type !== "doc", as 
        // currently nothing is done, but we should probably push a new state
        if (state.type === "doc" && panX !== undefined && panY !== undefined) {
            const init = state.initializers[id];
            if (!init) {
                state.initializers[id] = {
                    panX, panY
                };
                HistoryUtil.pushState(state);
            } else if (init.panX !== panX || init.panY !== panY) {
                init.panX = panX;
                init.panY = panY;
                HistoryUtil.pushState(state);
            }
        }
        SelectionManager.DeselectAll();
        const newPanX = NumCast(doc.x) + NumCast(doc.width) / 2;
        const newPanY = NumCast(doc.y) + NumCast(doc.height) / 2;
        const newState = HistoryUtil.getState();
        (newState.initializers || (newState.initializers = {}))[id] = { panX: newPanX, panY: newPanY };
        HistoryUtil.pushState(newState);
        this.setPan(newPanX, newPanY);

        this.props.Document.panTransformType = "Ease";
        this.props.focus(this.props.Document);
        if (willZoom) {
            this.setScaleToZoom(doc, scale);
        }

    }

    setScaleToZoom = (doc: Doc, scale: number = 0.5) => {
        let p = this.props;
        let PanelHeight = p.PanelHeight();
        let panelWidth = p.PanelWidth();

        let docHeight = NumCast(doc.height);
        let docWidth = NumCast(doc.width);
        let targetHeight = scale * PanelHeight;
        let targetWidth = scale * panelWidth;

        let maxScaleX: number = targetWidth / docWidth;
        let maxScaleY: number = targetHeight / docHeight;
        let maxApplicableScale = Math.min(maxScaleX, maxScaleY);
        this.Document.scale = maxApplicableScale;
    }

    zoomToScale = (scale: number) => {
        this.Document.scale = scale;
    }

    getScale = () => this.Document.scale ? this.Document.scale : 1;

    getChildDocumentViewProps(childLayout: Doc, childData?: Doc): DocumentViewProps {
        return {
            DataDoc: childData,
            Document: childLayout,
            addDocument: this.props.addDocument,
            removeDocument: this.props.removeDocument,
            moveDocument: this.props.moveDocument,
            onClick: this.props.onClick,
            ScreenToLocalTransform: childLayout.z ? this.getTransformOverlay : this.getTransform,
            renderDepth: this.props.renderDepth + 1,
            PanelWidth: childLayout[WidthSym],
            PanelHeight: childLayout[HeightSym],
            ContentScaling: returnOne,
            ContainingCollectionView: this.props.CollectionView,
            focus: this.focusDocument,
            backgroundColor: this.getClusterColor,
            parentActive: this.props.active,
            whenActiveChanged: this.props.whenActiveChanged,
            bringToFront: this.bringToFront,
            addDocTab: this.props.addDocTab,
            pinToPres: this.props.pinToPres,
            zoomToScale: this.zoomToScale,
            getScale: this.getScale
        };
    }
    getDocumentViewProps(layoutDoc: Doc): DocumentViewProps {
        return {
            DataDoc: this.props.DataDoc,
            Document: this.props.Document,
            addDocument: this.props.addDocument,
            removeDocument: this.props.removeDocument,
            moveDocument: this.props.moveDocument,
            onClick: this.props.onClick,
            ScreenToLocalTransform: this.getTransform,
            renderDepth: this.props.renderDepth,
            PanelWidth: layoutDoc[WidthSym],
            PanelHeight: layoutDoc[HeightSym],
            ContentScaling: returnOne,
            ContainingCollectionView: this.props.CollectionView,
            focus: this.focusDocument,
            backgroundColor: returnEmptyString,
            parentActive: this.props.active,
            whenActiveChanged: this.props.whenActiveChanged,
            bringToFront: this.bringToFront,
            addDocTab: this.props.addDocTab,
            pinToPres: this.props.pinToPres,
            zoomToScale: this.zoomToScale,
            getScale: this.getScale
        };
    }

    getCalculatedPositions(script: ScriptField, params: { doc: Doc, index: number, collection: Doc, docs: Doc[], state: any }): { x?: number, y?: number, z?: number, width?: number, height?: number, state?: any } {
        const result = script.script.run(params);
        if (!result.success) {
            return {};
        }
        let doc = params.doc;
        return result.result === undefined ? { x: Cast(doc.x, "number"), y: Cast(doc.y, "number"), z: Cast(doc.z, "number"), width: Cast(doc.width, "number"), height: Cast(doc.height, "number") } : result.result;
    }

    viewDefsToJSX = (views: any[]) => {
        let elements: ViewDefResult[] = [];
        if (Array.isArray(views)) {
            elements = views.reduce<typeof elements>((prev, ele) => {
                const jsx = this.viewDefToJSX(ele);
                jsx && prev.push(jsx);
                return prev;
            }, elements);
        }
        return elements;
    }

    private viewDefToJSX(viewDef: any): Opt<ViewDefResult> {
        if (viewDef.type === "text") {
            const text = Cast(viewDef.text, "string");
            const x = Cast(viewDef.x, "number");
            const y = Cast(viewDef.y, "number");
            const z = Cast(viewDef.z, "number");
            const width = Cast(viewDef.width, "number");
            const height = Cast(viewDef.height, "number");
            const fontSize = Cast(viewDef.fontSize, "number");
            if ([text, x, y, width, height].some(val => val === undefined)) {
                return undefined;
            }

            return {
                ele: <div className="collectionFreeform-customText" style={{
                    transform: `translate(${x}px, ${y}px)`,
                    width, height, fontSize
                }}>{text}</div>, bounds: { x: x!, y: y!, z: z, width: width!, height: height! }
            };
        }
    }

    @computed.struct
    get elements() {
        if (this.Document.usePivotLayout) return PivotView.elements(this);
        let curPage = FieldValue(this.Document.curPage, -1);
        const initScript = this.Document.arrangeInit;
        const script = this.Document.arrangeScript;
        let state: any = undefined;
        let docs = this.childDocs;
        let overlayDocs = DocListCast(this.props.Document.localOverlays);
        overlayDocs && docs.push(...overlayDocs);
        let elements: ViewDefResult[] = [];
        if (initScript) {
            const initResult = initScript.script.run({ docs, collection: this.Document });
            if (initResult.success) {
                const result = initResult.result;
                const { state: scriptState, views } = result;
                state = scriptState;
                elements = this.viewDefsToJSX(views);
            }
        }
        let docviews = docs.filter(doc => doc instanceof Doc).reduce((prev, doc) => {
            var page = NumCast(doc.page, -1);
            if ((Math.abs(Math.round(page) - Math.round(curPage)) < 3) || page === -1) {
                let minim = BoolCast(doc.isMinimized);
                if (minim === undefined || !minim) {
                    const pos = script ? this.getCalculatedPositions(script, { doc, index: prev.length, collection: this.Document, docs, state }) :
                        { x: Cast(doc.x, "number"), y: Cast(doc.y, "number"), z: Cast(doc.z, "number"), width: Cast(doc.width, "number"), height: Cast(doc.height, "number") };
                    state = pos.state === undefined ? state : pos.state;
                    let pair = Doc.GetLayoutDataDocPair(this.props.Document, this.props.DataDoc, this.props.fieldKey, doc);
                    if (pair.layout && !(pair.data instanceof Promise)) {
                        prev.push({
                            ele: <CollectionFreeFormDocumentView key={doc[Id]}
                                jitterRotation={NumCast(this.props.Document.jitterRotation)}
                                x={script ? pos.x : undefined} y={script ? pos.y : undefined}
                                width={script ? pos.width : undefined} height={script ? pos.height : undefined} {...this.getChildDocumentViewProps(pair.layout, pair.data)} />,
                            bounds: { x: pos.x || 0, y: pos.y || 0, z: pos.z, width: NumCast(pos.width), height: NumCast(pos.height) }
                        });
                    }
                }
            }
            return prev;
        }, elements);

        return docviews;
    }

    @computed.struct
    get views() {
        let source = this.elements;
        return source.filter(ele => ele.bounds && !ele.bounds.z).map(ele => ele.ele);
    }
    @computed.struct
    get overlayViews() {
        return this.elements.filter(ele => ele.bounds && ele.bounds.z).map(ele => ele.ele);
    }


    @action
    onCursorMove = (e: React.PointerEvent) => {
        super.setCursorPosition(this.getTransform().transformPoint(e.clientX, e.clientY));
    }

    fitToContainer = async () => this.props.Document.fitToBox = !this.fitToBox;

    arrangeContents = async () => {
        const docs = await DocListCastAsync(this.Document[this.props.fieldKey]);
        UndoManager.RunInBatch(() => {
            if (docs) {
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
            }
        }, "arrange contents");
    }

    analyzeStrokes = async () => {
        let data = Cast(this.fieldExtensionDoc[this.inkKey], InkField);
        if (!data) {
            return;
        }
        let relevantKeys = ["inkAnalysis", "handwriting"];
        CognitiveServices.Inking.Appliers.ConcatenateHandwriting(this.fieldExtensionDoc, relevantKeys, data.inkData);
    }

    onContextMenu = (e: React.MouseEvent) => {
        let layoutItems: ContextMenuProps[] = [];

        if (this.childDocs.some(d => BoolCast(d.isTemplate))) {
            layoutItems.push({ description: "Template Layout Instance", event: () => this.props.addDocTab && this.props.addDocTab(Doc.ApplyTemplate(this.props.Document)!, undefined, "onRight"), icon: "project-diagram" });
        }
        layoutItems.push({ description: "reset view", event: () => { this.props.Document.panX = this.props.Document.panY = 0; this.props.Document.scale = 1; }, icon: "compress-arrows-alt" });
        layoutItems.push({ description: `${this.fitToBox ? "Unset" : "Set"} Fit To Container`, event: this.fitToContainer, icon: !this.fitToBox ? "expand-arrows-alt" : "compress-arrows-alt" });
        layoutItems.push({
            description: `${this.props.Document.useClusters ? "Uncluster" : "Use Clusters"}`,
            event: async () => {
                Docs.Prototypes.get(DocumentType.TEXT).defaultBackgroundColor = "#f1efeb"; // backward compatibility with databases that didn't have a default background color on prototypes
                Docs.Prototypes.get(DocumentType.COL).defaultBackgroundColor = "white";
                this.props.Document.useClusters = !this.props.Document.useClusters;
                this.updateClusters();
            },
            icon: !this.props.Document.useClusters ? "braille" : "braille"
        });
        layoutItems.push({
            description: `${this.props.Document.isRuleProvider ? "Stop Auto Format" : "Auto Format"}`,
            event: () => this.props.Document.isRuleProvider = !this.props.Document.isRuleProvider,
            icon: !this.props.Document.useClusters ? "chalkboard" : "chalkboard"
        });
        layoutItems.push({ description: "Arrange contents in grid", event: this.arrangeContents, icon: "table" });
        layoutItems.push({ description: "Analyze Strokes", event: this.analyzeStrokes, icon: "paint-brush" });
        layoutItems.push({ description: "Jitter Rotation", event: action(() => this.props.Document.jitterRotation = 10), icon: "paint-brush" });
        layoutItems.push({
            description: "Import document", icon: "upload", event: () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".zip";
                input.onchange = async _e => {
                    const files = input.files;
                    if (!files) return;
                    const file = files[0];
                    let formData = new FormData();
                    formData.append('file', file);
                    formData.append('remap', "true");
                    const upload = Utils.prepend("/uploadDoc");
                    const response = await fetch(upload, { method: "POST", body: formData });
                    const json = await response.json();
                    if (json === "error") {
                        return;
                    }
                    const doc = await DocServer.GetRefField(json);
                    if (!doc || !(doc instanceof Doc)) {
                        return;
                    }
                    const [x, y] = this.props.ScreenToLocalTransform().transformPoint(e.pageX, e.pageY);
                    doc.x = x, doc.y = y;
                    this.props.addDocument &&
                        this.props.addDocument(doc, false);
                };
                input.click();
            }
        });

        let noteItems: ContextMenuProps[] = [];
        let notes = DocListCast((CurrentUserUtils.UserDocument.noteTypes as Doc).data);
        notes.map((node, i) => noteItems.push({ description: (i + 1) + ": " + StrCast(node.title), event: () => this.createText(i), icon: "eye" }));
        layoutItems.push({ description: "Add Note ...", subitems: noteItems, icon: "eye" })
        ContextMenu.Instance.addItem({ description: "Freeform Options ...", subitems: layoutItems, icon: "eye" });
    }

    createText = (noteStyle: number) => {
        let pt = this.getTransform().transformPoint(ContextMenu.Instance.pageX, ContextMenu.Instance.pageY);
        let notes = DocListCast((CurrentUserUtils.UserDocument.noteTypes as Doc).data);
        let text = Docs.Create.TextDocument({ width: 200, height: 100, x: pt[0], y: pt[1], autoHeight: true, title: StrCast(notes[noteStyle % notes.length].title) });
        text.layout = notes[noteStyle % notes.length];
        this.addLiveTextBox(text);
    }

    private childViews = () => [
        <CollectionFreeFormBackgroundView key="backgroundView" {...this.props} {...this.getDocumentViewProps(this.props.Document)} />,
        ...this.views
    ]
    private overlayChildViews = () => {
        return [...this.overlayViews];
    }

    public static AddCustomLayout(doc: Doc, dataKey: string): () => void {
        return () => {
            let addOverlay = (key: "arrangeScript" | "arrangeInit", options: OverlayElementOptions, params?: Record<string, string>, requiredType?: string) => {
                let overlayDisposer: () => void = emptyFunction;
                const script = Cast(doc[key], ScriptField);
                let originalText: string | undefined = undefined;
                if (script) originalText = script.script.originalScript;
                // tslint:disable-next-line: no-unnecessary-callback-wrapper
                let scriptingBox = <ScriptBox initialText={originalText} onCancel={() => overlayDisposer()} onSave={(text, onError) => {
                    const script = CompileScript(text, {
                        params,
                        requiredType,
                        typecheck: false
                    });
                    if (!script.compiled) {
                        onError(script.errors.map(error => error.messageText).join("\n"));
                        return;
                    }
                    doc[key] = new ScriptField(script);
                    overlayDisposer();
                }} />;
                overlayDisposer = OverlayView.Instance.addWindow(scriptingBox, options);
            };
            addOverlay("arrangeInit", { x: 400, y: 100, width: 400, height: 300, title: "Layout Initialization" }, { collection: "Doc", docs: "Doc[]" }, undefined);
            addOverlay("arrangeScript", { x: 400, y: 500, width: 400, height: 300, title: "Layout Script" }, { doc: "Doc", index: "number", collection: "Doc", state: "any", docs: "Doc[]" }, "{x: number, y: number, width?: number, height?: number}");
        };
    }

    render() {
        this.props.Document.fitX = this.actualContentBounds && this.actualContentBounds.x;
        this.props.Document.fitY = this.actualContentBounds && this.actualContentBounds.y;
        this.props.Document.fitW = this.actualContentBounds && (this.actualContentBounds.r - this.actualContentBounds.x);
        this.props.Document.fitH = this.actualContentBounds && (this.actualContentBounds.b - this.actualContentBounds.y);
        const easing = () => this.props.Document.panTransformType === "Ease";
        Doc.UpdateDocumentExtensionForField(this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey);
        return (
            <div className={"collectionfreeformview-container"} ref={this.createDropTarget} onWheel={this.onPointerWheel}
                onPointerDown={this.onPointerDown} onPointerMove={this.onCursorMove} onDrop={this.onDrop.bind(this)} onDragOver={this.onDragOver} onContextMenu={this.onContextMenu}>
                <MarqueeView container={this} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments} isSelected={this.props.isSelected}
                    addDocument={this.addDocument} removeDocument={this.props.removeDocument} addLiveTextDocument={this.addLiveTextBox}
                    getContainerTransform={this.getContainerTransform} getTransform={this.getTransform}>
                    <CollectionFreeFormViewPannableContents centeringShiftX={this.centeringShiftX} centeringShiftY={this.centeringShiftY}
                        easing={easing} zoomScaling={this.zoomScaling} panX={this.panX} panY={this.panY}>
                        <CollectionFreeFormLinksView {...this.props} key="freeformLinks">
                            <InkingCanvas getScreenTransform={this.getTransform} Document={this.props.Document} AnnotationDocument={this.fieldExtensionDoc} inkFieldKey={"ink"} >
                                {this.childViews}
                            </InkingCanvas>
                        </CollectionFreeFormLinksView>
                        <CollectionFreeFormRemoteCursors {...this.props} key="remoteCursors" />
                    </CollectionFreeFormViewPannableContents>
                </MarqueeView>
                {this.overlayChildViews()}
                <CollectionFreeFormOverlayView  {...this.props} {...this.getDocumentViewProps(this.props.Document)} />
            </div>
        );
    }
}

@observer
class CollectionFreeFormOverlayView extends React.Component<DocumentViewProps & { isSelected: () => boolean }> {
    @computed get overlayView() {
        return (<DocumentContentsView {...this.props} layoutKey={"overlayLayout"}
            renderDepth={this.props.renderDepth} isSelected={this.props.isSelected} select={emptyFunction} />);
    }
    render() {
        return this.overlayView;
    }
}

@observer
class CollectionFreeFormBackgroundView extends React.Component<DocumentViewProps & { isSelected: () => boolean }> {
    @computed get backgroundView() {
        let props = this.props;
        return (<DocumentContentsView {...this.props} layoutKey={"backgroundLayout"}
            renderDepth={this.props.renderDepth} isSelected={this.props.isSelected} select={emptyFunction} />);
    }
    render() {
        return this.props.Document.backgroundLayout ? this.backgroundView : (null);
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