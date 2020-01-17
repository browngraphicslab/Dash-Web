import React = require("react");
import { Touchable } from "./Touchable";
import { observer } from "mobx-react";
import "./GestureOverlay.scss";
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
import { FieldValue, Cast, NumCast } from "../../new_fields/Types";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import Palette from "./Palette";
import { Utils, emptyPath, emptyFunction } from "../../Utils";
import { DocumentView } from "./nodes/DocumentView";

@observer
export default class GestureOverlay extends Touchable {
    static Instance: GestureOverlay;

    @observable private _points: { X: number, Y: number }[] = [];
    @observable private _palette?: JSX.Element;
    @observable private _elements: JSX.Element[];
    @observable public Color: string = "rgb(244, 67, 54)";
    @observable public Width: number = 5;

    private _d1: Doc | undefined;
    private _thumbDoc: Doc | undefined;
    private _thumbX?: number;
    private thumbIdentifier?: number;
    private _hands: Map<number, React.Touch[]> = new Map<number, React.Touch[]>();

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    constructor(props: Readonly<{}>) {
        super(props);

        GestureOverlay.Instance = this;
    }

    getNewTouches(e: React.TouchEvent | TouchEvent) {
        const ntt: (React.Touch | Touch)[] = Array.from(e.targetTouches);
        const nct: (React.Touch | Touch)[] = Array.from(e.changedTouches);
        const nt: (React.Touch | Touch)[] = Array.from(e.touches);
        this._hands.forEach((hand) => {
            for (let i = 0; i < e.targetTouches.length; i++) {
                const pt = e.targetTouches.item(i);
                if (pt && hand.some((finger) => finger.screenX === pt.screenX && finger.screenY === pt.screenY)) {
                    ntt.splice(ntt.indexOf(pt), 1);
                }
            }

            for (let i = 0; i < e.changedTouches.length; i++) {
                const pt = e.changedTouches.item(i);
                if (pt && hand.some((finger) => finger.screenX === pt.screenX && finger.screenY === pt.screenY)) {
                    nct.splice(nct.indexOf(pt), 1);
                }
            }

            for (let i = 0; i < e.touches.length; i++) {
                const pt = e.touches.item(i);
                if (pt && hand.some((finger) => finger.screenX === pt.screenX && finger.screenY === pt.screenY)) {
                    nt.splice(nt.indexOf(pt), 1);
                }
            }
        });
        return { ntt, nct, nt };
    }

    onReactTouchStart = (te: React.TouchEvent) => {
        const actualPts: React.Touch[] = [];
        for (let i = 0; i < te.touches.length; i++) {
            const pt: any = te.touches.item(i);
            actualPts.push(pt);
            // pen is also a touch, but with a radius of 0.5 (at least with the surface pens)
            // and this seems to be the only way of differentiating pen and touch on touch events
            if (pt.radiusX > 1 && pt.radiusY > 1) {
                // if (typeof pt.identifier !== "string") {
                //     pt.identifier = Utils.GenerateGuid();
                // }
                this.prevPoints.set(pt.identifier, pt);
            }
        }

        const ptsToDelete: number[] = [];
        this.prevPoints.forEach(pt => {
            if (!actualPts.includes(pt)) {
                ptsToDelete.push(pt.identifier);
            }
        });

        ptsToDelete.forEach(pt => this.prevPoints.delete(pt));
        const nts = this.getNewTouches(te);
        console.log(nts.nt.length);

        if (nts.nt.length < 5) {
            const target = document.elementFromPoint(te.changedTouches.item(0).clientX, te.changedTouches.item(0).clientY);
            target?.dispatchEvent(
                new CustomEvent<InteractionUtils.MultiTouchEvent<React.TouchEvent>>("dashOnTouchStart",
                    {
                        bubbles: true,
                        detail: {
                            fingers: this.prevPoints.size,
                            targetTouches: nts.ntt,
                            touches: nts.nt,
                            changedTouches: nts.nct,
                            touchEvent: te
                        }
                    }
                )
            );
            document.removeEventListener("touchmove", this.onReactTouchMove);
            document.removeEventListener("touchend", this.onReactTouchEnd);
            document.addEventListener("touchmove", this.onReactTouchMove);
            document.addEventListener("touchend", this.onReactTouchEnd);
        }
        else {
            this.handleHandDown(te);
            document.removeEventListener("touchmove", this.onReactTouchMove);
            document.removeEventListener("touchend", this.onReactTouchEnd);
        }
    }

    onReactTouchMove = (e: TouchEvent) => {
        const nts: any = this.getNewTouches(e);
        document.dispatchEvent(
            new CustomEvent<InteractionUtils.MultiTouchEvent<TouchEvent>>("dashOnTouchMove",
                {
                    bubbles: true,
                    detail: {
                        fingers: this.prevPoints.size,
                        targetTouches: nts.ntt,
                        touches: nts.nt,
                        changedTouches: nts.nct,
                        touchEvent: e
                    }
                })
        );
    }

    onReactTouchEnd = (e: TouchEvent) => {
        const nts: any = this.getNewTouches(e);
        document.dispatchEvent(
            new CustomEvent<InteractionUtils.MultiTouchEvent<TouchEvent>>("dashOnTouchEnd",
                {
                    bubbles: true,
                    detail: {
                        fingers: this.prevPoints.size,
                        targetTouches: nts.ntt,
                        touches: nts.nt,
                        changedTouches: nts.nct,
                        touchEvent: e
                    }
                })
        );
        for (let i = 0; i < e.changedTouches.length; i++) {
            const pt = e.changedTouches.item(i);
            if (pt) {
                if (this.prevPoints.has(pt.identifier)) {
                    this.prevPoints.delete(pt.identifier);
                }
            }
        }

        if (this.prevPoints.size === 0) {
            document.removeEventListener("touchmove", this.onReactTouchMove);
            document.removeEventListener("touchend", this.onReactTouchEnd);
        }
        e.stopPropagation();
    }

    handleHandDown = (e: React.TouchEvent) => {
        const fingers = new Array<React.Touch>();
        for (let i = 0; i < e.touches.length; i++) {
            const pt: any = e.touches.item(i);
            if (pt.radiusX > 1 && pt.radiusY > 1) {
                for (let j = 0; j < e.targetTouches.length; j++) {
                    const tPt = e.targetTouches.item(j);
                    if (tPt?.screenX === pt?.screenX && tPt?.screenY === pt?.screenY) {
                        if (pt && this.prevPoints.has(pt.identifier)) {
                            fingers.push(pt);
                        }
                    }
                }
            }
        }
        const thumb = fingers.reduce((a, v) => a.clientY > v.clientY ? a : v, fingers[0]);
        if (thumb.identifier === this.thumbIdentifier) {
            this._thumbX = thumb.clientX;
            this._hands.set(thumb.identifier, fingers);
            return;
        }
        this.thumbIdentifier = thumb?.identifier;
        // fingers.forEach((f) => this.prevPoints.delete(f.identifier));
        this._hands.set(thumb.identifier, fingers);
        const others = fingers.filter(f => f !== thumb);
        const minX = Math.min(...others.map(f => f.clientX));
        const minY = Math.min(...others.map(f => f.clientY));
        // const t = this.getTransform().transformPoint(minX, minY);
        // const th = this.getTransform().transformPoint(thumb.clientX, thumb.clientY);

        const thumbDoc = FieldValue(Cast(CurrentUserUtils.setupThumbDoc(CurrentUserUtils.UserDocument), Doc));
        if (thumbDoc) {
            runInAction(() => {
                this._thumbDoc = thumbDoc;
                this._thumbX = thumb.clientX;
                this._palette = <Palette x={minX} y={minY} thumb={[thumb.clientX, thumb.clientY]} thumbDoc={thumbDoc} />;
            });
        }

        this.removeMoveListeners();
        document.removeEventListener("touchmove", this.handleHandMove);
        document.addEventListener("touchmove", this.handleHandMove);
        document.removeEventListener("touchend", this.handleHandUp);
        document.addEventListener("touchend", this.handleHandUp);
    }

    @action
    handleHandMove = (e: TouchEvent) => {
        const fingers = new Array<React.Touch>();
        for (let i = 0; i < e.touches.length; i++) {
            const pt: any = e.touches.item(i);
            if (pt.radiusX > 1 && pt.radiusY > 1) {
                for (let j = 0; j < e.targetTouches.length; j++) {
                    const tPt = e.targetTouches.item(j);
                    if (tPt?.screenX === pt?.screenX && tPt?.screenY === pt?.screenY) {
                        if (pt && this.prevPoints.has(pt.identifier)) {
                            this._hands.forEach(hand => hand.some(f => {
                                if (f.identifier === pt.identifier) {
                                    fingers.push(pt);
                                }
                            }));
                        }
                    }
                }
            }
        }
        const thumb = fingers.reduce((a, v) => a.clientY > v.clientY ? a : v, fingers[0]);
        if (thumb?.identifier === this.thumbIdentifier) {
            this._hands.set(thumb.identifier, fingers);
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
            const pt = e.changedTouches.item(i);
            if (pt && pt.identifier === this.thumbIdentifier && this._thumbX && this._thumbDoc) {
                if (Math.abs(pt.clientX - this._thumbX) > 20) {
                    this._thumbDoc.selectedIndex = Math.max(0, NumCast(this._thumbDoc.selectedIndex) - Math.sign(pt.clientX - this._thumbX));
                    this._thumbX = pt.clientX;
                }
            }
        }
    }

    @action
    handleHandUp = (e: TouchEvent) => {
        if (e.touches.length < 3) {
            // this.onTouchEnd(e);
            if (this.thumbIdentifier) this._hands.delete(this.thumbIdentifier);
            this._palette = undefined;
            this.thumbIdentifier = undefined;
            this._thumbDoc = undefined;
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
        };
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
                );
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

    @computed get elements() {
        return [
            this.props.children,
            this._elements,
            this._palette,
            this.currentStroke
        ]
    }

    @action
    openFloatingDoc = (doc: Doc) => {
        // this._elements.push(
        //     <DocumentView 
        //     Document={doc}
        //     LibraryPath={emptyPath}
        //     addDocument={undefined}
        //     addDocTab={emptyFunction}
        //     />
        // )
    }

    render() {
        return (
            <div className="gestureOverlay-cont" onPointerDown={this.onPointerDown} onTouchStart={this.onReactTouchStart}>
                {this.elements}
            </div>);
    }
}

Scripting.addGlobal("GestureOverlay", GestureOverlay);
Scripting.addGlobal(function setPen(width: any, color: any) { runInAction(() => { GestureOverlay.Instance.Color = color; GestureOverlay.Instance.Width = width; }); });
Scripting.addGlobal(function resetPen() { runInAction(() => { runInAction(() => { GestureOverlay.Instance.Color = "rgb(244, 67, 54)"; GestureOverlay.Instance.Width = 5; })); });