import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { FieldWaiting } from "../../../../fields/Field";
import { InkField, StrokeData } from "../../../../fields/InkField";
import { KeyStore } from "../../../../fields/KeyStore";
import { Documents } from "../../../documents/Documents";
import { SelectionManager } from "../../../util/SelectionManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { InkingCanvas } from "../../InkingCanvas";
import { PreviewCursor } from "../../PreviewCursor";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import { MINIMIZED_ICON_SIZE } from '../../../views/globalCssVariables.scss'
import "./MarqueeView.scss";
import React = require("react");

interface MarqueeViewProps {
    getContainerTransform: () => Transform;
    getTransform: () => Transform;
    container: CollectionFreeFormView;
    addDocument: (doc: Document, allowDuplicates: false) => boolean;
    activeDocuments: () => Document[];
    selectDocuments: (docs: Document[]) => void;
    removeDocument: (doc: Document) => boolean;
    addLiveTextDocument: (doc: Document) => void;
}

@observer
export class MarqueeView extends React.Component<MarqueeViewProps>
{
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;
    @observable _used: boolean = false;
    @observable _visible: boolean = false;
    _showOnUp: boolean = false;
    static DRAG_THRESHOLD = 4;

    @action
    cleanupInteractions = (all: boolean = false) => {
        if (all) {
            document.removeEventListener("pointermove", this.onPointerMove, true);
            document.removeEventListener("pointerup", this.onPointerUp, true);
        } else {
            this._used = true;
        }
        document.removeEventListener("keydown", this.marqueeCommand, true);
        this._visible = false;
    }

    @action
    onKeyPress = (e: KeyboardEvent) => {
        // Mixing events between React and Native is finicky.  In FormattedTextBox, we set the
        // DASHFormattedTextBoxHandled flag when a text box consumes a key press so that we can ignore
        // the keyPress here.
        //if not these keys, make a textbox if preview cursor is active!
        if (!e.ctrlKey && !e.altKey && !e.defaultPrevented && !(e as any).DASHFormattedTextBoxHandled) {
            //make textbox and add it to this collection
            let [x, y] = this.props.getTransform().transformPoint(this._downX, this._downY);
            let newBox = Documents.TextDocument({ width: 200, height: 100, x: x, y: y, title: "typed text" });
            this.props.addLiveTextDocument(newBox);
            PreviewCursor.Visible = false;
            e.stopPropagation();
        }
    }
    hideCursor = () => {
        document.removeEventListener("keypress", this.onKeyPress, false);
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if ((e.button === 0 && !e.altKey && !e.metaKey && this.props.container.props.active()) ||
            (!CollectionFreeFormView.RIGHT_BTN_DRAG && (e.button === 2 || (e.button === 0 && e.altKey)) && this.props.container.props.active())) {
            this._downX = this._lastX = e.pageX;
            this._downY = this._lastY = e.pageY;
            this._used = false;
            this._showOnUp = true;
            document.removeEventListener("keypress", this.onKeyPress, false);
            document.addEventListener("pointermove", this.onPointerMove, true);
            document.addEventListener("pointerup", this.onPointerUp, true);
            document.addEventListener("keydown", this.marqueeCommand, true);
        }
        if (e.altKey)
            e.preventDefault();
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        this._lastX = e.pageX;
        this._lastY = e.pageY;
        if (!e.cancelBubble) {
            if (Math.abs(this._downX - e.clientX) > 4 || Math.abs(this._downY - e.clientY) > 4) {
                this._showOnUp = false;
                PreviewCursor.Visible = false;
            }
            if (!this._used &&
                (!CollectionFreeFormView.RIGHT_BTN_DRAG && (e.buttons === 2 || (e.buttons == 1 && e.altKey))) ||
                (CollectionFreeFormView.RIGHT_BTN_DRAG && e.buttons === 1 && !e.altKey && !e.metaKey) &&
                (Math.abs(this._lastX - this._downX) > MarqueeView.DRAG_THRESHOLD || Math.abs(this._lastY - this._downY) > MarqueeView.DRAG_THRESHOLD)) {
                this._visible = true;
                e.stopPropagation();
                e.preventDefault();
            }
        }
        if (e.altKey)
            e.preventDefault();
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        this.cleanupInteractions(true);
        this._visible = false;
        if (this._showOnUp) {
            PreviewCursor.Show(this.hideCursor, this._downX, this._downY);
            document.addEventListener("keypress", this.onKeyPress, false);
        } else if ((CollectionFreeFormView.RIGHT_BTN_DRAG && e.button === 0 && !e.altKey && !e.metaKey) ||
            (!CollectionFreeFormView.RIGHT_BTN_DRAG && ((e.button === 0 && e.altKey) || e.button === 2))) {
            let mselect = this.marqueeSelect();
            if (!e.shiftKey) {
                SelectionManager.DeselectAll(mselect.length ? undefined : this.props.container.props.Document);
            }
            this.props.selectDocuments(mselect.length ? mselect : [this.props.container.props.Document]);
        }
        if (e.altKey)
            e.preventDefault();
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
        if (e.key === "Backspace" || e.key === "Delete") {
            this.marqueeSelect().map(d => this.props.removeDocument(d));
            let ink = this.props.container.props.Document.GetT(KeyStore.Ink, InkField);
            if (ink && ink !== FieldWaiting) {
                this.marqueeInkDelete(ink.Data);
            }
            this.cleanupInteractions();
        }
        if (e.key === "c") {
            let bounds = this.Bounds;
            let selected = this.marqueeSelect().map(d => {
                this.props.removeDocument(d);
                d.SetNumber(KeyStore.X, d.GetNumber(KeyStore.X, 0) - bounds.left - bounds.width / 2);
                d.SetNumber(KeyStore.Y, d.GetNumber(KeyStore.Y, 0) - bounds.top - bounds.height / 2);
                d.SetNumber(KeyStore.Page, -1);
                return d;
            });
            let ink = this.props.container.props.Document.GetT(KeyStore.Ink, InkField);
            let inkData = ink && ink !== FieldWaiting ? ink.Data : undefined;
            let zoomBasis = this.props.container.props.Document.GetNumber(KeyStore.Scale, 1);
            let newCollection = Documents.FreeformDocument(selected, {
                x: bounds.left,
                y: bounds.top,
                panx: 0,
                pany: 0,
                scale: zoomBasis,
                width: bounds.width * zoomBasis,
                height: bounds.height * zoomBasis,
                ink: inkData ? this.marqueeInkSelect(inkData) : undefined,
                title: "a nested collection"
            });
            this.props.addDocument(newCollection, false);
            this.marqueeInkDelete(inkData);
            this.cleanupInteractions();
            SelectionManager.DeselectAll();
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
            this.props.container.props.Document.SetDataOnPrototype(KeyStore.Ink, idata, InkField);
        }
    }

    marqueeSelect() {
        let selRect = this.Bounds;
        let selection: Document[] = [];
        this.props.activeDocuments().map(doc => {
            var z = doc.GetNumber(KeyStore.ZoomBasis, 1);
            var x = doc.GetNumber(KeyStore.X, 0);
            var y = doc.GetNumber(KeyStore.Y, 0);
            var w = doc.Width() / z;
            var h = doc.Height() / z;
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
        return <div className="marqueeView" onPointerDown={this.onPointerDown}>
            {this.props.children}
            {!this._visible ? (null) : this.marqueeDiv}
        </div>;
    }
}