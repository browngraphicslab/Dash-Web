import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting, Opt } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { Documents } from "../../documents/Documents";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import "./MarqueeView.scss";
import React = require("react");
import { InkField, StrokeData } from "../../../fields/InkField";
import { Utils } from "../../../Utils";
import { InkingCanvas } from "../InkingCanvas";

interface MarqueeViewProps {
    getMarqueeTransform: () => Transform;
    getTransform: () => Transform;
    container: CollectionFreeFormView;
    addDocument: (doc: Document, allowDuplicates: false) => void;
    activeDocuments: () => Document[];
    selectDocuments: (docs: Document[]) => void;
    removeDocument: (doc: Document) => boolean;
}

@observer
export class MarqueeView extends React.Component<MarqueeViewProps>
{
    private _reactionDisposer: Opt<IReactionDisposer>;

    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable _downX: number = 0;
    @observable _downY: number = 0;

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => this.props.container.MarqueeVisible,
            (visible: boolean) => this.onPointerDown(visible, this.props.container.DownX, this.props.container.DownY))
        this._reactionDisposer = reaction(
            () => this.props.container.Marquee,
            (visible: boolean) => this.createMarquee(visible, this.props.container.FirstX, this.props.container.FirstY, this.props.container.SecondX, this.props.container.SecondY, this.props.container.ShiftKey)
        )
        this._reactionDisposer = reaction(
            () => this.props.container.Collection,
            (params: { left: number, top: number, width: number, height: number, create: boolean }) => {
                if (params.create)
                    this.createCollection(params)
            }
        )
    }
    componentWillUnmount() {
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
        this.cleanupInteractions();
    }

    @action
    createCollection = (params: { left: number, top: number, width: number, height: number }) => {
        let selected = this.marqueeSelect().map(d => {
            this.props.removeDocument(d);
            d.SetNumber(KeyStore.X, d.GetNumber(KeyStore.X, 0) - params.left - params.width / 2);
            d.SetNumber(KeyStore.Y, d.GetNumber(KeyStore.Y, 0) - params.top - params.height / 2);
            d.SetNumber(KeyStore.Page, 0);
            d.SetText(KeyStore.Title, "" + d.GetNumber(KeyStore.Width, 0) + " " + d.GetNumber(KeyStore.Height, 0));
            return d;
        });
        let liftedInk = this.marqueeInkSelect(true);
        this.props.container.props.Document.SetData(KeyStore.Ink, this.marqueeInkSelect(false), InkField);
        //setTimeout(() => {
        let newCollection = Documents.FreeformDocument(selected, {
            x: params.left,
            y: params.top,
            panx: 0,
            pany: 0,
            width: params.width,
            height: params.height,
            backgroundColor: "Transparent",
            ink: liftedInk,
            title: "a nested collection"
        });
        this.props.addDocument(newCollection, false);
    }

    @action
    createMarquee = (visible: boolean, firstX: number, firstY: number, secondX: number, secondY: number, shiftKey: boolean) => {
        if (visible) {
            this._downX = firstX
            this._downY = firstY
            this._lastX = secondX
            this._lastY = secondY
            if (!shiftKey) {
                SelectionManager.DeselectAll();
            }
            this.props.selectDocuments(this.marqueeSelect());
            this.props.container.ShiftKey = false;
            this.props.container.Marquee = false;
        }
    }

    @action
    cleanupInteractions = () => {
        document.removeEventListener("pointermove", this.onPointerMove, true)
        document.removeEventListener("pointerup", this.onPointerUp, true);
        document.removeEventListener("keydown", this.marqueeCommand, true);
    }

    @action
    onPointerDown = (visible: boolean, downX: number, downY: number): void => {
        if (visible) {
            this._downX = this._lastX = downX;
            this._downY = this._lastY = downY;
            document.addEventListener("pointermove", this.onPointerMove, true)
            document.addEventListener("pointerup", this.onPointerUp, true);
            document.addEventListener("keydown", this.marqueeCommand, true);
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        this._lastX = e.pageX;
        this._lastY = e.pageY;
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (e.pointerType === "touch") return;

        this.cleanupInteractions();
        if (!e.shiftKey) {
            SelectionManager.DeselectAll();
        }
        this.props.selectDocuments(this.marqueeSelect());
    }

    get Bounds() {
        let left = this._downX < this._lastX ? this._downX : this._lastX;
        let top = this._downY < this._lastY ? this._downY : this._lastY;
        let topLeft = this.props.getTransform().transformPoint(left, top);
        let size = this.props.getTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return { left: topLeft[0], top: topLeft[1], width: Math.abs(size[0]), height: Math.abs(size[1]) }
    }

    @action
    marqueeCommand = (e: KeyboardEvent) => {
        if (e.key == "Backspace" || e.key == "Delete") {
            this.marqueeSelect().map(d => this.props.removeDocument(d));
            this.props.container.props.Document.SetData(KeyStore.Ink, this.marqueeInkSelect(false), InkField);
            this.cleanupInteractions();
        }
        if (e.key == "c") {
            let bounds = this.Bounds;
            this.createCollection(bounds)
            // }, 100);
            this.cleanupInteractions();
        }
    }
    marqueeInkSelect(select: boolean) {
        let selRect = this.Bounds;
        let centerShiftX = 0 - (selRect.left + selRect.width / 2); // moves each point by the offset that shifts the selection's center to the origin.
        let centerShiftY = 0 - (selRect.top + selRect.height / 2);
        let ink = this.props.container.props.Document.GetT(KeyStore.Ink, InkField);
        if (ink && ink != FieldWaiting && ink.Data) {
            let idata = new Map();
            ink.Data.forEach((value: StrokeData, key: string, map: any) => {
                let inside = InkingCanvas.IntersectStrokeRect(value, selRect);
                if (inside && select) {
                    idata.set(key,
                        {
                            pathData: value.pathData.map(val => { return { x: val.x + centerShiftX, y: val.y + centerShiftY } }),
                            color: value.color,
                            width: value.width,
                            tool: value.tool,
                            page: -1
                        });
                } else if (!inside && !select) {
                    idata.set(key, value);
                }
            })
            return idata;
        }
    }

    marqueeSelect() {
        let selRect = this.Bounds;
        let selection: Document[] = [];
        this.props.activeDocuments().map(doc => {
            var x = doc.GetNumber(KeyStore.X, 0);
            var y = doc.GetNumber(KeyStore.Y, 0);
            var w = doc.GetNumber(KeyStore.Width, 0);
            var h = doc.GetNumber(KeyStore.Height, 0);
            if (Utils.IntersectRect({ left: x, top: y, width: w, height: h }, selRect))
                selection.push(doc)
        })
        return selection;
    }

    render() {
        let p = this.props.getMarqueeTransform().transformPoint(this._downX < this._lastX ? this._downX : this._lastX, this._downY < this._lastY ? this._downY : this._lastY);
        let v = this.props.getMarqueeTransform().transformDirection(this._lastX - this._downX, this._lastY - this._downY);
        return (!this.props.container.MarqueeVisible ? (null) : <div className="marqueeView" style={{ transform: `translate(${p[0]}px, ${p[1]}px)`, width: `${Math.abs(v[0])}`, height: `${Math.abs(v[1])}` }} />);
    }
}