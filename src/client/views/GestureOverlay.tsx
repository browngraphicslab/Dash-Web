import React = require("react");
import { Touchable } from "./Touchable";
import { observer } from "mobx-react";
import "./GestureOverlay.scss";
import { computed, observable, action, runInAction, IReactionDisposer, reaction, flow, trace } from "mobx";
import { GestureUtils } from "../../pen-gestures/GestureUtils";
import { InteractionUtils } from "../util/InteractionUtils";
import { InkingControl } from "./InkingControl";
import { InkTool, InkData } from "../../new_fields/InkField";
import { Doc } from "../../new_fields/Doc";
import { LinkManager } from "../util/LinkManager";
import { DocUtils, Docs } from "../documents/Documents";
import { undoBatch } from "../util/UndoManager";
import { Scripting } from "../util/Scripting";
import { FieldValue, Cast, NumCast, BoolCast } from "../../new_fields/Types";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import HorizontalPalette from "./Palette";
import { Utils, emptyPath, emptyFunction, returnFalse, returnOne, returnEmptyString, returnTrue, numberRange } from "../../Utils";
import { DocumentView } from "./nodes/DocumentView";
import { Transform } from "../util/Transform";
import { DocumentContentsView } from "./nodes/DocumentContentsView";
import { CognitiveServices } from "../cognitive_services/CognitiveServices";
import { DocServer } from "../DocServer";
import htmlToImage from "html-to-image";
import { ScriptField } from "../../new_fields/ScriptField";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";
import { CollectionViewType } from "./collections/CollectionView";
import TouchScrollableMenu, { TouchScrollableMenuItem } from "./TouchScrollableMenu";
import MobileInterface from "../../mobile/MobileInterface";
import { MobileInkOverlayContent } from "../../server/Message";
import MobileInkOverlay from "../../mobile/MobileInkOverlay";
import { RadialMenu } from "./nodes/RadialMenu";
import { SelectionManager } from "../util/SelectionManager";


@observer
export default class GestureOverlay extends Touchable {
    static Instance: GestureOverlay;

    @observable public Color: string = "rgb(0, 0, 0)";
    @observable public Width: number = 2;
    @observable public SavedColor?: string;
    @observable public SavedWidth?: number;
    @observable public Tool: ToolglassTools = ToolglassTools.None;

    @observable private _thumbX?: number;
    @observable private _thumbY?: number;
    @observable private _selectedIndex: number = -1;
    @observable private _menuX: number = -300;
    @observable private _menuY: number = -300;
    @observable private _pointerY?: number;
    @observable private _points: { X: number, Y: number }[] = [];
    @observable private _strokes: InkData[] = [];
    @observable private _palette?: JSX.Element;
    @observable private _clipboardDoc?: JSX.Element;
    @observable private _possibilities: JSX.Element[] = [];

    @computed private get height(): number { return 2 * Math.max(this._pointerY && this._thumbY ? this._thumbY - this._pointerY : 100, 100); }
    @computed private get showBounds() { return this.Tool !== ToolglassTools.None; }

    @observable private showMobileInkOverlay: boolean = false;

    private _d1: Doc | undefined;
    private _inkToTextDoc: Doc | undefined;
    private _thumbDoc: Doc | undefined;
    private thumbIdentifier?: number;
    private pointerIdentifier?: number;
    private _hands: Map<number, React.Touch[]> = new Map<number, React.Touch[]>();
    private _holdTimer: NodeJS.Timeout | undefined;

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    constructor(props: Readonly<{}>) {
        super(props);

        GestureOverlay.Instance = this;
    }

    componentDidMount = () => {
        this._thumbDoc = FieldValue(Cast(CurrentUserUtils.setupThumbDoc(CurrentUserUtils.UserDocument), Doc));
        this._inkToTextDoc = FieldValue(Cast(this._thumbDoc?.inkToTextDoc, Doc));
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
        document.removeEventListener("touchmove", this.onReactHoldTouchMove);
        document.removeEventListener("touchend", this.onReactHoldTouchEnd);
        if (RadialMenu.Instance._display === true) {
            te.preventDefault();
            te.stopPropagation();
            RadialMenu.Instance.closeMenu();
            return;
        }

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
            if (nts.nt.length === 1) {
                console.log("started");
                this._holdTimer = setTimeout(() => {
                    console.log("hold");
                    const target = document.elementFromPoint(te.changedTouches.item(0).clientX, te.changedTouches.item(0).clientY);
                    let pt: any = te.touches[te.touches.length - 1];
                    if (nts.nt.length === 1 && pt.radiusX > 1 && pt.radiusY > 1) {
                        target?.dispatchEvent(
                            new CustomEvent<InteractionUtils.MultiTouchEvent<React.TouchEvent>>("dashOnTouchHoldStart",
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
                        this._holdTimer = undefined;
                        document.removeEventListener("touchmove", this.onReactTouchMove);
                        document.removeEventListener("touchend", this.onReactTouchEnd);
                        document.removeEventListener("touchmove", this.onReactHoldTouchMove);
                        document.removeEventListener("touchend", this.onReactHoldTouchEnd);
                        document.addEventListener("touchmove", this.onReactHoldTouchMove);
                        document.addEventListener("touchend", this.onReactHoldTouchEnd);
                    }

                }, (500));
            }
            else {
                clearTimeout(this._holdTimer);
            }
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

    onReactHoldTouchMove = (e: TouchEvent) => {
        document.removeEventListener("touchmove", this.onReactTouchMove);
        document.removeEventListener("touchend", this.onReactTouchEnd);
        document.removeEventListener("touchmove", this.onReactHoldTouchMove);
        document.removeEventListener("touchend", this.onReactHoldTouchEnd);
        document.addEventListener("touchmove", this.onReactHoldTouchMove);
        document.addEventListener("touchend", this.onReactHoldTouchEnd);
        const nts: any = this.getNewTouches(e);
        if (this.prevPoints.size === 1 && this._holdTimer) {
            clearTimeout(this._holdTimer);
        }
        document.dispatchEvent(
            new CustomEvent<InteractionUtils.MultiTouchEvent<TouchEvent>>("dashOnTouchHoldMove",
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

    onReactHoldTouchEnd = (e: TouchEvent) => {
        const nts: any = this.getNewTouches(e);
        if (this.prevPoints.size === 1 && this._holdTimer) {
            clearTimeout(this._holdTimer);
            this._holdTimer = undefined;
        }
        document.dispatchEvent(
            new CustomEvent<InteractionUtils.MultiTouchEvent<TouchEvent>>("dashOnTouchHoldEnd",
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

        document.removeEventListener("touchmove", this.onReactHoldTouchMove);
        document.removeEventListener("touchend", this.onReactHoldTouchEnd);

        e.stopPropagation();
    }


    onReactTouchMove = (e: TouchEvent) => {
        const nts: any = this.getNewTouches(e);
        clearTimeout(this._holdTimer);
        this._holdTimer = undefined;

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
        clearTimeout(this._holdTimer);
        this._holdTimer = undefined;

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

    handleHandDown = async (e: React.TouchEvent) => {
        clearTimeout(this._holdTimer!);
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
        const rightMost = Math.max(...fingers.map(f => f.clientX));
        const leftMost = Math.min(...fingers.map(f => f.clientX));
        let pointer: React.Touch | undefined;
        // left hand
        if (thumb.clientX === rightMost) {
            pointer = fingers.reduce((a, v) => a.clientX > v.clientX || v.identifier === thumb.identifier ? a : v);
        }
        // right hand
        else if (thumb.clientX === leftMost) {
            pointer = fingers.reduce((a, v) => a.clientX < v.clientX || v.identifier === thumb.identifier ? a : v);
        }
        else {
            console.log("not hand");
        }
        this.pointerIdentifier = pointer?.identifier;
        runInAction(() => {
            this._pointerY = pointer?.clientY;
            if (thumb.identifier === this.thumbIdentifier) {
                this._thumbX = thumb.clientX;
                this._thumbY = thumb.clientY;
                this._hands.set(thumb.identifier, fingers);
                return;
            }
        });

        this.thumbIdentifier = thumb?.identifier;
        this._hands.set(thumb.identifier, fingers);
        const others = fingers.filter(f => f !== thumb);
        const minX = Math.min(...others.map(f => f.clientX));
        const minY = Math.min(...others.map(f => f.clientY));

        const thumbDoc = await Cast(CurrentUserUtils.setupThumbDoc(CurrentUserUtils.UserDocument), Doc);
        if (thumbDoc) {
            runInAction(() => {
                RadialMenu.Instance._display = false;
                this._inkToTextDoc = FieldValue(Cast(thumbDoc.inkToTextDoc, Doc));
                this._thumbDoc = thumbDoc;
                this._thumbX = thumb.clientX;
                this._thumbY = thumb.clientY;
                this._menuX = thumb.clientX + 50;
                this._menuY = thumb.clientY;
                this._palette = <HorizontalPalette x={minX} y={minY} thumb={[thumb.clientX, thumb.clientY]} thumbDoc={thumbDoc} />;
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
        if (thumb?.identifier && thumb?.identifier === this.thumbIdentifier) {
            this._hands.set(thumb.identifier, fingers);
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
            const pt = e.changedTouches.item(i);
            if (pt && pt.identifier === this.thumbIdentifier && this._thumbY) {
                if (this._thumbX && this._thumbY) {
                    const yOverX = Math.abs(pt.clientX - this._thumbX) < Math.abs(pt.clientY - this._thumbY);
                    if ((yOverX && this._inkToTextDoc) || this._selectedIndex > -1) {
                        if (Math.abs(pt.clientY - this._thumbY) > (10 * window.devicePixelRatio)) {
                            this._selectedIndex = Math.min(Math.max(-1, (-Math.ceil((pt.clientY - this._thumbY) / (10 * window.devicePixelRatio)) - 1)), this._possibilities.length - 1);
                        }
                    }
                    else if (this._thumbDoc) {
                        if (Math.abs(pt.clientX - this._thumbX) > (15 * window.devicePixelRatio)) {
                            this._thumbDoc.selectedIndex = Math.max(-1, NumCast(this._thumbDoc.selectedIndex) - Math.sign(pt.clientX - this._thumbX));
                            this._thumbX = pt.clientX;
                        }
                    }
                }

                // if (this._thumbX && this._thumbDoc) {
                //     if (Math.abs(pt.clientX - this._thumbX) > 30) {
                //         this._thumbDoc.selectedIndex = Math.max(0, NumCast(this._thumbDoc.selectedIndex) - Math.sign(pt.clientX - this._thumbX));
                //         this._thumbX = pt.clientX;
                //     }
                // }
                // if (this._thumbY && this._inkToTextDoc) {
                //     if (Math.abs(pt.clientY - this._thumbY) > 20) {
                //         this._selectedIndex = Math.min(Math.max(0, -Math.ceil((pt.clientY - this._thumbY) / 20)), this._possibilities.length - 1);
                //     }
                // }
            }
            if (pt && pt.identifier === this.pointerIdentifier) {
                this._pointerY = pt.clientY;
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

            let scriptWorked = false;
            if (NumCast(this._inkToTextDoc?.selectedIndex) > -1) {
                const selectedButton = this._possibilities[this._selectedIndex];
                if (selectedButton) {
                    selectedButton.props.onClick();
                    scriptWorked = true;
                }
            }

            if (!scriptWorked) {
                this._strokes.forEach(s => {
                    this.dispatchGesture(GestureUtils.Gestures.Stroke, s);
                });
            }
            this._strokes = [];
            this._points = [];
            this._possibilities = [];
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


            if (this._points.length > 1) {
                const B = this.svgBounds;
                const initialPoint = this._points[0.];
                const xInGlass = initialPoint.X > (this._thumbX ?? Number.MAX_SAFE_INTEGER) && initialPoint.X < (this._thumbX ?? Number.MAX_SAFE_INTEGER) + this.height;
                const yInGlass = initialPoint.Y > (this._thumbY ?? Number.MAX_SAFE_INTEGER) - this.height && initialPoint.Y < (this._thumbY ?? Number.MAX_SAFE_INTEGER);
                if (this.Tool !== ToolglassTools.None && xInGlass && yInGlass) {
                    switch (this.Tool) {
                        case ToolglassTools.RadialMenu:
                            document.removeEventListener("pointermove", this.onPointerMove);
                            document.removeEventListener("pointerup", this.onPointerUp);
                        //this.handle1PointerHoldStart(e);
                    }
                }
            }
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
                if (this._d1.type !== "ink" && doc.type !== "ink") {
                    DocUtils.MakeLink({ doc: this._d1 }, { doc: doc }, "gestural link");
                    actionPerformed = true;
                }
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

            if (MobileInterface.Instance && MobileInterface.Instance.drawingInk) {
                const { selectedColor, selectedWidth } = InkingControl.Instance;
                DocServer.Mobile.dispatchGesturePoints({
                    points: this._points,
                    bounds: B,
                    color: selectedColor,
                    width: selectedWidth
                });
            }

            const initialPoint = this._points[0.];
            const xInGlass = initialPoint.X > (this._thumbX ?? Number.MAX_SAFE_INTEGER) && initialPoint.X < (this._thumbX ?? Number.MAX_SAFE_INTEGER) + (this.height);
            const yInGlass = initialPoint.Y > (this._thumbY ?? Number.MAX_SAFE_INTEGER) - (this.height) && initialPoint.Y < (this._thumbY ?? Number.MAX_SAFE_INTEGER);

            if (this.Tool !== ToolglassTools.None && xInGlass && yInGlass) {
                switch (this.Tool) {
                    case ToolglassTools.InkToText:
                        document.removeEventListener("pointermove", this.onPointerMove);
                        document.removeEventListener("pointerup", this.onPointerUp);
                        this._strokes.push(new Array(...this._points));
                        this._points = [];
                        CognitiveServices.Inking.Appliers.InterpretStrokes(this._strokes).then((results) => {
                            console.log(results);
                            const wordResults = results.filter((r: any) => r.category === "line");
                            const possibilities: string[] = [];
                            for (const wR of wordResults) {
                                console.log(wR);
                                if (wR?.recognizedText) {
                                    possibilities.push(wR?.recognizedText)
                                }
                                possibilities.push(...wR?.alternates?.map((a: any) => a.recognizedString));
                            }
                            console.log(possibilities);
                            const r = Math.max(this.svgBounds.right, ...this._strokes.map(s => this.getBounds(s).right));
                            const l = Math.min(this.svgBounds.left, ...this._strokes.map(s => this.getBounds(s).left));
                            const t = Math.min(this.svgBounds.top, ...this._strokes.map(s => this.getBounds(s).top));
                            runInAction(() => {
                                this._possibilities = possibilities.map(p =>
                                    <TouchScrollableMenuItem text={p} onClick={() => GestureOverlay.Instance.dispatchGesture(GestureUtils.Gestures.Text, [{ X: l, Y: t }], p)} />);
                            });
                        });
                        break;
                    case ToolglassTools.IgnoreGesture:
                        this.dispatchGesture(GestureUtils.Gestures.Stroke);
                        this._points = [];
                        break;
                }
            }
            else {
                const result = GestureUtils.GestureRecognizer.Recognize(new Array(points));
                let actionPerformed = false;
                if (result && result.Score > 0.7) {
                    switch (result.Name) {
                        case GestureUtils.Gestures.Box:
                            this.dispatchGesture(GestureUtils.Gestures.Box);
                            actionPerformed = true;
                            break;
                        case GestureUtils.Gestures.StartBracket:
                            this.dispatchGesture(GestureUtils.Gestures.StartBracket);
                            actionPerformed = true;
                            break;
                        case GestureUtils.Gestures.EndBracket:
                            this.dispatchGesture(GestureUtils.Gestures.EndBracket);
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
                    this.dispatchGesture(GestureUtils.Gestures.Stroke);
                    this._points = [];
                }
            }
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    dispatchGesture = (gesture: GestureUtils.Gestures, stroke?: InkData, data?: any) => {
        const target = document.elementFromPoint((stroke ?? this._points)[0].X, (stroke ?? this._points)[0].Y);
        target?.dispatchEvent(
            new CustomEvent<GestureUtils.GestureEvent>("dashOnGesture",
                {
                    bubbles: true,
                    detail: {
                        points: stroke ?? this._points,
                        gesture: gesture,
                        bounds: this.getBounds(stroke ?? this._points),
                        text: data
                    }
                }
            )
        );
    }

    getBounds = (stroke: InkData) => {
        const xs = stroke.map(p => p.X);
        const ys = stroke.map(p => p.Y);
        const right = Math.max(...xs);
        const left = Math.min(...xs);
        const bottom = Math.max(...ys);
        const top = Math.min(...ys);
        return { right: right, left: left, bottom: bottom, top: top, width: right - left, height: bottom - top };
    }

    @computed get svgBounds() {
        return this.getBounds(this._points);
    }

    @computed get elements() {
        const B = this.svgBounds;
        return [
            this.props.children,
            this._palette,
            [this._strokes.map(l => {
                const b = this.getBounds(l);
                return <svg key={b.left} width={b.width} height={b.height} style={{ transform: `translate(${b.left}px, ${b.top}px)`, pointerEvents: "none", position: "absolute", zIndex: 30000 }}>
                    {InteractionUtils.CreatePolyline(l, b.left, b.top, GestureOverlay.Instance.Color, GestureOverlay.Instance.Width)}
                </svg>;
            }),
            this._points.length <= 1 ? (null) : <svg width={B.width} height={B.height} style={{ transform: `translate(${B.left}px, ${B.top}px)`, pointerEvents: "none", position: "absolute", zIndex: 30000 }}>
                {InteractionUtils.CreatePolyline(this._points, B.left, B.top, GestureOverlay.Instance.Color, GestureOverlay.Instance.Width)}
            </svg>]
        ];
    }

    @action
    public openFloatingDoc = (doc: Doc) => {
        this._clipboardDoc =
            <DocumentView
                Document={doc}
                DataDoc={undefined}
                LibraryPath={emptyPath}
                addDocument={undefined}
                addDocTab={returnFalse}
                pinToPres={emptyFunction}
                onClick={undefined}
                removeDocument={undefined}
                ScreenToLocalTransform={() => new Transform(-(this._thumbX ?? 0), -(this._thumbY ?? 0) + this.height, 1)}
                ContentScaling={returnOne}
                PanelWidth={() => 300}
                PanelHeight={() => 300}
                renderDepth={0}
                backgroundColor={returnEmptyString}
                focus={emptyFunction}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                zoomToScale={emptyFunction}
                getScale={returnOne}
            />;
    }

    @action
    public closeFloatingDoc = () => {
        this._clipboardDoc = undefined;
    }

    @action
    enableMobileInkOverlay = (content: MobileInkOverlayContent) => {
        this.showMobileInkOverlay = content.enableOverlay;
    }

    render() {
        trace();
        return (
            <div className="gestureOverlay-cont" onPointerDown={this.onPointerDown} onTouchStart={this.onReactTouchStart}>
                {this.showMobileInkOverlay ? <MobileInkOverlay /> : <></>}
                {this.elements}

                <div className="clipboardDoc-cont" style={{
                    transform: `translate(${this._thumbX}px, ${(this._thumbY ?? 0) - this.height}px)`,
                    height: this.height,
                    width: this.height,
                    pointerEvents: this._clipboardDoc ? "unset" : "none",
                    touchAction: this._clipboardDoc ? "unset" : "none",
                }}>
                    {this._clipboardDoc}
                </div>
                <div className="filter-cont" style={{
                    transform: `translate(${this._thumbX}px, ${(this._thumbY ?? 0) - this.height}px)`,
                    height: this.height,
                    width: this.height,
                    pointerEvents: "none",
                    touchAction: "none",
                    display: this.showBounds ? "unset" : "none",
                }}>
                </div>
                <TouchScrollableMenu options={this._possibilities} bounds={this.svgBounds} selectedIndex={this._selectedIndex} x={this._menuX} y={this._menuY} />
                {/* <div className="pointerBubbles">
                {this._pointers.map(p => <div className="bubble" style={{ translate: `transform(${p.clientX}px, ${p.clientY}px)` }}></div>)}
                </div> */}
            </div>);
    }
}

// export class 

export enum ToolglassTools {
    InkToText = "inktotext",
    IgnoreGesture = "ignoregesture",
    RadialMenu = "radialmenu",
    None = "none",
}

Scripting.addGlobal("GestureOverlay", GestureOverlay);
Scripting.addGlobal(function setToolglass(tool: any) {
    runInAction(() => GestureOverlay.Instance.Tool = tool);
});
Scripting.addGlobal(function setPen(width: any, color: any) {
    runInAction(() => {
        GestureOverlay.Instance.SavedColor = GestureOverlay.Instance.Color;
        GestureOverlay.Instance.Color = color;
        GestureOverlay.Instance.SavedWidth = GestureOverlay.Instance.Width;
        GestureOverlay.Instance.Width = width;
    });
});
Scripting.addGlobal(function resetPen() {
    runInAction(() => {
        GestureOverlay.Instance.Color = GestureOverlay.Instance.SavedColor ?? "rgb(0, 0, 0)";
        GestureOverlay.Instance.Width = GestureOverlay.Instance.SavedWidth ?? 2;
    });
});
Scripting.addGlobal(function createText(text: any, x: any, y: any) {
    GestureOverlay.Instance.dispatchGesture("text", [{ X: x, Y: y }], text);
});