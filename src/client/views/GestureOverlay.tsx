import React = require("react");
import { Touchable } from "./Touchable";
import { observer } from "mobx-react";
import "./GestureOverlay.scss"
import { computed, observable, action, runInAction } from "mobx";
import { CreatePolyline } from "./InkingStroke";
import { GestureUtils } from "../../pen-gestures/GestureUtils";
import { InteractionUtils } from "../util/InteractionUtils";
import { InkingControl } from "./InkingControl";
import { InkTool } from "../../new_fields/InkField";
import { Doc } from "../../new_fields/Doc";
import { LinkManager } from "../util/LinkManager";
import { DocUtils } from "../documents/Documents";
import { undoBatch } from "../util/UndoManager";
import { Scripting } from "../util/Scripting";
import { FieldValue, Cast } from "../../new_fields/Types";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import Palette from "./Palette";

@observer
export default class GestureOverlay extends Touchable {
    static Instance: GestureOverlay;

    @observable private _points: { X: number, Y: number }[] = [];
    @observable private _palette?: JSX.Element;
    @observable public Color: string = "rgb(244, 67, 54)";
    @observable public Width: number = 5;

    private _d1: Doc | undefined;
    private thumbIdentifier?: number;

    constructor(props: Readonly<{}>) {
        super(props);

        GestureOverlay.Instance = this;
    }

    @action
    handleHandDown = (e: React.TouchEvent) => {
        const fingers = InteractionUtils.GetMyTargetTouches(e, this.prevPoints, true);
        const thumb = fingers.reduce((a, v) => a.clientY > v.clientY ? a : v, fingers[0]);
        this.thumbIdentifier = thumb?.identifier;
        const others = fingers.filter(f => f !== thumb);
        const minX = Math.min(...others.map(f => f.clientX));
        const minY = Math.min(...others.map(f => f.clientY));
        // const t = this.getTransform().transformPoint(minX, minY);
        // const th = this.getTransform().transformPoint(thumb.clientX, thumb.clientY);

        const thumbDoc = FieldValue(Cast(CurrentUserUtils.setupThumbDoc(CurrentUserUtils.UserDocument), Doc));
        if (thumbDoc) {
            this._palette = <Palette x={minX} y={minY} thumb={[thumb.clientX, thumb.clientY]} thumbDoc={thumbDoc} />;
        }

        document.removeEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchmove", this.handleHandMove);
        document.addEventListener("touchmove", this.handleHandMove);
        document.removeEventListener("touchend", this.handleHandUp);
        document.addEventListener("touchend", this.handleHandUp);
    }

    @action
    handleHandMove = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const pt = e.changedTouches.item(i);
            if (pt?.identifier === this.thumbIdentifier) {
            }
        }
    }

    @action
    handleHandUp = (e: TouchEvent) => {
        this.onTouchEnd(e);
        if (this.prevPoints.size < 3) {
            this._palette = undefined;
            document.removeEventListener("touchend", this.handleHandUp);
        }
    }

    @action
    onPointerDown = (e: React.PointerEvent) => {
        if (InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || (InkingControl.Instance.selectedTool === InkTool.Highlighter || InkingControl.Instance.selectedTool === InkTool.Pen)) {
            this._points.push({ X: e.clientX, Y: e.clientY });
            e.stopPropagation();
            e.preventDefault();

            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    @action
    onPointerMove = (e: PointerEvent) => {
        if (InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || (InkingControl.Instance.selectedTool === InkTool.Highlighter || InkingControl.Instance.selectedTool === InkTool.Pen)) {
            this._points.push({ X: e.clientX, Y: e.clientY });
            e.stopPropagation();
            e.preventDefault();
        }
    }

    handleLineGesture = (): boolean => {
        let actionPerformed = false;
        const B = this.svgBounds;
        const ep1 = this._points[0];
        const ep2 = this._points[this._points.length - 1];

        const target1 = document.elementFromPoint(ep1.X, ep1.Y);
        const target2 = document.elementFromPoint(ep2.X, ep2.Y);
        const callback = (doc: Doc) => {
            if (!this._d1) {
                this._d1 = doc;
            }
            else if (this._d1 !== doc && !LinkManager.Instance.doesLinkExist(this._d1, doc)) {
                DocUtils.MakeLink({ doc: this._d1 }, { doc: doc });
                actionPerformed = true;
            }
        }
        const ge = new CustomEvent<GestureUtils.GestureEvent>("dashOnGesture",
            {
                bubbles: true,
                detail: {
                    points: this._points,
                    gesture: GestureUtils.Gestures.Line,
                    bounds: B,
                    callbackFn: callback
                }
            });
        target1?.dispatchEvent(ge);
        target2?.dispatchEvent(ge);
        return actionPerformed;
    }



    @action
    onPointerUp = (e: PointerEvent) => {
        if (this._points.length > 1) {
            const B = this.svgBounds;
            const points = this._points.map(p => ({ X: p.X - B.left, Y: p.Y - B.top }));

            const result = GestureUtils.GestureRecognizer.Recognize(new Array(points));
            let actionPerformed = false;
            if (result && result.Score > 0.7) {
                switch (result.Name) {
                    case GestureUtils.Gestures.Box:
                        const target = document.elementFromPoint(this._points[0].X, this._points[0].Y);
                        target?.dispatchEvent(new CustomEvent<GestureUtils.GestureEvent>("dashOnGesture",
                            {
                                bubbles: true,
                                detail: {
                                    points: this._points,
                                    gesture: GestureUtils.Gestures.Box,
                                    bounds: B
                                }
                            }));
                        actionPerformed = true;
                        break;
                    case GestureUtils.Gestures.Line:
                        actionPerformed = this.handleLineGesture();
                        break;
                    case GestureUtils.Gestures.Scribble:
                        console.log("scribble");
                        break;
                }
                if (actionPerformed) {
                    this._points = [];
                }
            }

            if (!actionPerformed) {
                const target = document.elementFromPoint(this._points[0].X, this._points[0].Y);
                target?.dispatchEvent(
                    new CustomEvent<GestureUtils.GestureEvent>("dashOnGesture",
                        {
                            bubbles: true,
                            detail: {
                                points: this._points,
                                gesture: GestureUtils.Gestures.Stroke,
                                bounds: B
                            }
                        }
                    )
                )
                this._points = [];
            }
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    @computed get svgBounds() {
        const xs = this._points.map(p => p.X);
        const ys = this._points.map(p => p.Y);
        const right = Math.max(...xs);
        const left = Math.min(...xs);
        const bottom = Math.max(...ys);
        const top = Math.min(...ys);
        return { right: right, left: left, bottom: bottom, top: top, width: right - left, height: bottom - top };
    }

    @computed get currentStroke() {
        if (this._points.length <= 1) {
            return (null);
        }

        const B = this.svgBounds;

        return (
            <svg width={B.width} height={B.height} style={{ transform: `translate(${B.left}px, ${B.top}px)`, pointerEvents: "none", position: "absolute", zIndex: 30000 }}>
                {CreatePolyline(this._points, B.left, B.top, this.Color, this.Width)}
            </svg>
        );
    }

    render() {
        return (
            <div className="gestureOverlay-cont" onPointerDown={this.onPointerDown} onTouchStart={this.onTouchStart}>
                {this.props.children}
                {this._palette}
                {this.currentStroke}
            </div>);
    }
}

Scripting.addGlobal("GestureOverlay", GestureOverlay);
Scripting.addGlobal(function setPen(width: any, color: any) { runInAction(() => { GestureOverlay.Instance.Color = color; GestureOverlay.Instance.Width = width; }); });
Scripting.addGlobal(function resetPen() { runInAction(() => { GestureOverlay.Instance.Color = "rgb(244, 67, 54)"; GestureOverlay.Instance.Width = 5; }); });