import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting, Opt } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { Documents } from "../../documents/Documents";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import "./MarqueeView.scss";
import React = require("react");


interface MarqueeViewProps {
    getMarqueeTransform: () => Transform;
    getTransform: () => Transform;
    container: CollectionFreeFormView;
    addDocument: (doc: Document) => void;
    activeDocuemnts: () => Document[];
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
    }
    componentWillUnmount() {
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
        this.cleanupInteractions();
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
        this.cleanupInteractions();
        if (!e.shiftKey) {
            SelectionManager.DeselectAll();
        }
        this.props.selectDocuments(this.marqueeSelect());
    }

    intersectRect(r1: { left: number, top: number, width: number, height: number },
        r2: { left: number, top: number, width: number, height: number }) {
        return !(r2.left > r1.left + r1.width || r2.left + r2.width < r1.left || r2.top > r1.top + r1.height || r2.top + r2.height < r1.top);
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
        if (e.key == "Backspace") {
            this.marqueeSelect().map(d => this.props.removeDocument(d));
            this.cleanupInteractions();
        }
        if (e.key == "c") {
            let bounds = this.Bounds;
            let selected = this.marqueeSelect().map(m => m);
            this.marqueeSelect().map(d => this.props.removeDocument(d));
            //setTimeout(() => {
            this.props.addDocument(Documents.FreeformDocument(selected.map(d => {
                d.SetNumber(KeyStore.X, d.GetNumber(KeyStore.X, 0) - bounds.left - bounds.width / 2);
                d.SetNumber(KeyStore.Y, d.GetNumber(KeyStore.Y, 0) - bounds.top - bounds.height / 2);
                d.SetNumber(KeyStore.Page, 0);
                d.SetText(KeyStore.Title, "" + d.GetNumber(KeyStore.Width, 0) + " " + d.GetNumber(KeyStore.Height, 0));
                return d;
            }), { x: bounds.left, y: bounds.top, panx: 0, pany: 0, width: bounds.width, height: bounds.height, title: "a nested collection" }));
            // }, 100);
            this.cleanupInteractions();
        }
    }

    marqueeSelect() {
        let selRect = this.Bounds;
        let selection: Document[] = [];
        this.props.activeDocuemnts().map(doc => {
            var x = doc.GetNumber(KeyStore.X, 0);
            var y = doc.GetNumber(KeyStore.Y, 0);
            var w = doc.GetNumber(KeyStore.Width, 0);
            var h = doc.GetNumber(KeyStore.Height, 0);
            if (this.intersectRect({ left: x, top: y, width: w, height: h }, selRect))
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