import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Docs } from "../../../documents/Documents";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch, UndoManager } from "../../../util/UndoManager";
import { InkingCanvas } from "../../InkingCanvas";
import { PreviewCursor } from "../../PreviewCursor";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import "./MarqueeView.scss";
import React = require("react");
import { Utils } from "../../../../Utils";
import { Doc } from "../../../../new_fields/Doc";
import { NumCast, Cast } from "../../../../new_fields/Types";
import { InkField, StrokeData } from "../../../../new_fields/InkField";
import { List } from "../../../../new_fields/List";

interface MarqueeViewProps {
    getContainerTransform: () => Transform;
    getTransform: () => Transform;
    container: CollectionFreeFormView;
    addDocument: (doc: Doc, allowDuplicates: false) => boolean;
    activeDocuments: () => Doc[];
    selectDocuments: (docs: Doc[]) => void;
    removeDocument: (doc: Doc) => boolean;
    addLiveTextDocument: (doc: Doc) => void;
    isSelected: () => boolean;
}

@observer
export class MarqueeView extends React.Component<MarqueeViewProps>
{
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _visible: boolean = false;
    _commandExecuted = false;

    @action
    cleanupInteractions = (all: boolean = false) => {
        if (all) {
            document.removeEventListener("pointerup", this.onPointerUp, true);
            document.removeEventListener("pointermove", this.onPointerMove, true);
        }
        document.removeEventListener("keydown", this.marqueeCommand, true);
        this._visible = false;
    }

    @undoBatch
    @action
    onKeyPress = (e: KeyboardEvent) => {
        //make textbox and add it to this collection
        let [x, y] = this.props.getTransform().transformPoint(this._downX, this._downY);
        if (e.key === "q" && e.ctrlKey) {
            e.preventDefault();
            (async () => {
                let text = await navigator.clipboard.readText();
                let ns = text.split("\n").filter(t => t != "\r");
                for (let i = 0; i < ns.length - 1; i++) {
                    if (ns[i].trim() === "") {
                        ns.splice(i, 1);
                        continue;
                    }
                    while (!(ns[i].trim() === "" || ns[i].endsWith("-\r") || ns[i].endsWith("-") ||
                        ns[i].endsWith(";\r") || ns[i].endsWith(";") ||
                        ns[i].endsWith(".\r") || ns[i].endsWith(".") ||
                        ns[i].endsWith(":\r") || ns[i].endsWith(":")) && i < ns.length - 1) {
                        let sub = ns[i].endsWith("\r") ? 1 : 0;
                        let br = ns[i + 1].trim() === "";
                        ns.splice(i, 2, ns[i].substr(0, ns[i].length - sub) + ns[i + 1].trimLeft());
                        if (br) break;
                    }
                }
                ns.map(line => {
                    let indent = line.search(/\S|$/);
                    let newBox = Docs.TextDocument({ width: 200, height: 35, x: x + indent / 3 * 10, y: y, documentText: "@@@" + line, title: line });
                    this.props.addDocument(newBox, false);
                    y += 40 * this.props.getTransform().Scale;
                })
            })();
        } else {
            let newBox = Docs.TextDocument({ width: 200, height: 100, x: x, y: y, title: "-typed text-" });
            this.props.addLiveTextDocument(newBox);
        }
        e.stopPropagation();
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = this._lastX = e.pageX;
        this._downY = this._lastY = e.pageY;
        this._commandExecuted = false;
        PreviewCursor.Visible = false;
        if ((CollectionFreeFormView.RIGHT_BTN_DRAG && e.button === 0 && !e.altKey && !e.metaKey && this.props.container.props.active()) ||
            (!CollectionFreeFormView.RIGHT_BTN_DRAG && (e.button === 2 || (e.button === 0 && e.altKey)) && this.props.container.props.active())) {
            document.addEventListener("pointermove", this.onPointerMove, true);
            document.addEventListener("pointerup", this.onPointerUp, true);
            document.addEventListener("keydown", this.marqueeCommand, true);
            // bcz: do we need this?   it kills the context menu on the main collection
            // e.stopPropagation();
        }
        if (e.altKey) {
            e.preventDefault();
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        this._lastX = e.pageX;
        this._lastY = e.pageY;
        if (!e.cancelBubble) {
            if (Math.abs(this._lastX - this._downX) > Utils.DRAG_THRESHOLD ||
                Math.abs(this._lastY - this._downY) > Utils.DRAG_THRESHOLD) {
                if (!this._commandExecuted) {
                    this._visible = true;
                }
                e.stopPropagation();
                e.preventDefault();
            }
        }
        if (e.altKey) {
            e.preventDefault();
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (this._visible) {
            let mselect = this.marqueeSelect();
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(mselect.length ? undefined : this.props.container.props.Document);
            }
            this.props.selectDocuments(mselect.length ? mselect : [this.props.container.props.Document]);
        }
        this.cleanupInteractions(true);
        if (e.altKey) {
            e.preventDefault();
        }
    }

    @action
    onClick = (e: React.MouseEvent): void => {
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            PreviewCursor.Show(e.clientX, e.clientY, this.onKeyPress);
            // let the DocumentView stopPropagation of this event when it selects this document
        } else {  // why do we get a click event when the cursor have moved a big distance?
            // let's cut it off here so no one else has to deal with it.
            e.stopPropagation();
        }
    }

    intersectRect(r1: { left: number, top: number, width: number, height: number },
        r2: { left: number, top: number, width: number, height: number }) {
        return !(r2.left > r1.left + r1.width || r2.left + r2.width < r1.left || r2.top > r1.top + r1.height || r2.top + r2.height < r1.top);
    }

    @computed
    get Bounds() {
        let left = this._downX < this._lastX ? this._downX : this._lastX;
        let top = this._downY < this._lastY ? this._downY : this._lastY;
        let topLeft = this.props.getTransform().transformPoint(left, top);
        let size = this.props.getTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return { left: topLeft[0], top: topLeft[1], width: Math.abs(size[0]), height: Math.abs(size[1]) };
    }

    @undoBatch
    @action
    marqueeCommand = (e: KeyboardEvent) => {
        if (this._commandExecuted) {
            return;
        }
        if (e.key === "Backspace" || e.key === "Delete" || e.key === "d") {
            this._commandExecuted = true;
            this.marqueeSelect().map(d => this.props.removeDocument(d));
            let ink = Cast(this.props.container.props.Document.ink, InkField);
            if (ink) {
                this.marqueeInkDelete(ink.inkData);
            }
            SelectionManager.DeselectAll();
            this.cleanupInteractions(false);
            e.stopPropagation();
        }
        if (e.key === "c" || e.key === "r" || e.key === "s" || e.key === "e" || e.key === "p") {
            this._commandExecuted = true;
            e.stopPropagation();
            let bounds = this.Bounds;
            let selected = this.marqueeSelect().map(d => {
                if (e.key === "s") {
                    let dCopy = Doc.MakeCopy(d);
                    dCopy.x = NumCast(d.x) - bounds.left - bounds.width / 2;
                    dCopy.y = NumCast(d.y) - bounds.top - bounds.height / 2;
                    dCopy.page = -1;
                    return dCopy;
                }
                else if (e.key !== "r") {
                    this.props.removeDocument(d);
                    d.x = NumCast(d.x) - bounds.left - bounds.width / 2;
                    d.y = NumCast(d.y) - bounds.top - bounds.height / 2;
                    d.page = -1;
                }
                return d;
            });
            let ink = Cast(this.props.container.props.Document.ink, InkField);
            let inkData = ink ? ink.inkData : undefined;
            let zoomBasis = NumCast(this.props.container.props.Document.scale, 1);
            let newCollection = Docs.FreeformDocument(selected, {
                x: bounds.left,
                y: bounds.top,
                panX: 0,
                panY: 0,
                borderRounding: e.key === "e" ? -1 : undefined,
                scale: zoomBasis,
                width: bounds.width * zoomBasis,
                height: bounds.height * zoomBasis,
                ink: inkData ? new InkField(this.marqueeInkSelect(inkData)) : undefined,
                title: "a nested collection",
            });

            this.marqueeInkDelete(inkData);
            // SelectionManager.DeselectAll();
            if (e.key === "s" || e.key === "r" || e.key === "p") {
                e.preventDefault();
                let scrpt = this.props.getTransform().inverse().transformPoint(bounds.left, bounds.top);
                let summary = Docs.TextDocument({ x: bounds.left, y: bounds.top, width: 300, height: 100, backgroundColor: "yellow", title: "-summary-" });

                if (e.key === "s" || e.key === "p") {
                    summary.proto!.maximizeOnRight = true;
                    newCollection.proto!.summaryDoc = summary;
                    selected = [newCollection];
                }
                summary.proto!.summarizedDocs = new List<Doc>(selected);
                summary.proto!.isButton = true;
                selected.map(summarizedDoc => {
                    let maxx = NumCast(summarizedDoc.x, undefined);
                    let maxy = NumCast(summarizedDoc.y, undefined);
                    let maxw = NumCast(summarizedDoc.width, undefined);
                    let maxh = NumCast(summarizedDoc.height, undefined);
                    summarizedDoc.isIconAnimating = new List<number>([scrpt[0], scrpt[1], maxx, maxy, maxw, maxh, Date.now(), 0])
                });
                this.props.addLiveTextDocument(summary);
            }
            else {
                this.props.addDocument(newCollection, false);
                SelectionManager.DeselectAll();
                this.props.selectDocuments([newCollection]);
            }
            this.cleanupInteractions(false);
        } else
            if (e.key === "s") {
                // this._commandExecuted = true;
                // e.stopPropagation();
                // e.preventDefault();
                // let bounds = this.Bounds;
                // let selected = this.marqueeSelect();
                // SelectionManager.DeselectAll();
                // let summary = Docs.TextDocument({ x: bounds.left + bounds.width + 25, y: bounds.top, width: 300, height: 100, backgroundColor: "yellow", title: "-summary-" });
                // this.props.addLiveTextDocument(summary);
                // selected.forEach(select => Doc.MakeLink(summary.proto!, select.proto!));

                // this.cleanupInteractions(false);
            }
    }
    @action
    marqueeInkSelect(ink: Map<any, any>) {
        let idata = new Map();
        let centerShiftX = 0 - (this.Bounds.left + this.Bounds.width / 2); // moves each point by the offset that shifts the selection's center to the origin.
        let centerShiftY = 0 - (this.Bounds.top + this.Bounds.height / 2);
        ink.forEach((value: StrokeData, key: string, map: any) => {
            if (InkingCanvas.IntersectStrokeRect(value, this.Bounds)) {
                idata.set(key,
                    {
                        pathData: value.pathData.map(val => ({ x: val.x + centerShiftX, y: val.y + centerShiftY })),
                        color: value.color,
                        width: value.width,
                        tool: value.tool,
                        page: -1
                    });
            }
        });
        return idata;
    }

    @action
    marqueeInkDelete(ink?: Map<any, any>) {
        // bcz: this appears to work but when you restart all the deleted strokes come back -- InkField isn't observing its changes so they aren't written to the DB.
        // ink.forEach((value: StrokeData, key: string, map: any) =>
        //     InkingCanvas.IntersectStrokeRect(value, this.Bounds) && ink.delete(key));

        if (ink) {
            let idata = new Map();
            ink.forEach((value: StrokeData, key: string, map: any) =>
                !InkingCanvas.IntersectStrokeRect(value, this.Bounds) && idata.set(key, value));
            Doc.SetOnPrototype(this.props.container.props.Document, "ink", new InkField(idata));
        }
    }

    marqueeSelect() {
        let selRect = this.Bounds;
        let selection: Doc[] = [];
        this.props.activeDocuments().map(doc => {
            var z = NumCast(doc.zoomBasis, 1);
            var x = NumCast(doc.x);
            var y = NumCast(doc.y);
            var w = NumCast(doc.width) / z;
            var h = NumCast(doc.height) / z;
            if (this.intersectRect({ left: x, top: y, width: w, height: h }, selRect)) {
                selection.push(doc);
            }
        });
        return selection;
    }

    @computed
    get marqueeDiv() {
        let p = this.props.getContainerTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY);
        let v = this.props.getContainerTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return <div className="marquee" style={{ transform: `translate(${p[0]}px, ${p[1]}px)`, width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}` }} >
            <span className="marquee-legend" />
        </div>;
    }

    render() {
        return <div className="marqueeView" style={{ borderRadius: "inherit" }} onClick={this.onClick} onPointerDown={this.onPointerDown}>
            {this.props.children}
            {!this._visible ? (null) : this.marqueeDiv}
        </div>;
    }
}