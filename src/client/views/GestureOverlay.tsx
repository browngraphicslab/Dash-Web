import React = require("react");
import { Touchable } from "./Touchable";
import { observer } from "mobx-react";
import "./GestureOverlay.scss"
import { computed, observable, action } from "mobx";
import { CreatePolyline } from "./InkingStroke";
import { GestureUtils } from "../../pen-gestures/GestureUtils";
import { InteractionUtils } from "../util/InteractionUtils";
import { InkingControl } from "./InkingControl";
import { InkTool } from "../../new_fields/InkField";
import { Doc } from "../../new_fields/Doc";
import { LinkManager } from "../util/LinkManager";
import { DocUtils } from "../documents/Documents";
import { undoBatch } from "../util/UndoManager";

@observer
export default class GestureOverlay extends Touchable {
    static Instance: GestureOverlay;

    @observable private _points: { X: number, Y: number }[] = [];

    private _d1: Doc | undefined;

    constructor(props: Readonly<{}>) {
        super(props);

        GestureOverlay.Instance = this;
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
        this._points.push({ X: e.clientX, Y: e.clientY });
        e.stopPropagation();
        e.preventDefault();
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
                            })
                        target1?.dispatchEvent(ge);
                        target2?.dispatchEvent(ge);
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
                {CreatePolyline(this._points, B.left, B.top)}
            </svg>
        );
    }

    render() {
        return (
            <div className="gestureOverlay-cont" onPointerDown={this.onPointerDown}>
                {this.props.children}
                {this.currentStroke}
            </div>);
    }
}