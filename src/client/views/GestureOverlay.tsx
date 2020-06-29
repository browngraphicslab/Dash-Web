import React = require("react");
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../fields/Doc";
import { InkData, InkTool } from "../../fields/InkField";
import { Cast, FieldValue, NumCast } from "../../fields/Types";
import MobileInkOverlay from "../../mobile/MobileInkOverlay";
import { GestureUtils } from "../../pen-gestures/GestureUtils";
import { MobileInkOverlayContent } from "../../server/Message";
import { emptyFunction, emptyPath, returnEmptyString, returnFalse, returnOne, returnTrue, returnZero, returnEmptyFilter } from "../../Utils";
import { CognitiveServices } from "../cognitive_services/CognitiveServices";
import { DocServer } from "../DocServer";
import { DocUtils } from "../documents/Documents";
import { CurrentUserUtils } from "../util/CurrentUserUtils";
import { InteractionUtils } from "../util/InteractionUtils";
import { LinkManager } from "../util/LinkManager";
import { Scripting } from "../util/Scripting";
import { Transform } from "../util/Transform";
import "./GestureOverlay.scss";
import { ActiveInkBezierApprox, ActiveArrowStart, ActiveArrowEnd, ActiveFillColor, ActiveInkColor, ActiveInkWidth, InkingStroke, SetActiveInkColor, SetActiveInkWidth, SetActiveFillColor, SetActiveArrowStart, SetActiveArrowEnd, ActiveDash, SetActiveDash } from "./InkingStroke";
import { DocumentView } from "./nodes/DocumentView";
import { RadialMenu } from "./nodes/RadialMenu";
import HorizontalPalette from "./Palette";
import { Touchable } from "./Touchable";
import TouchScrollableMenu, { TouchScrollableMenuItem } from "./TouchScrollableMenu";
import HeightLabel from "./collections/collectionMulticolumn/MultirowHeightLabel";

@observer
export default class GestureOverlay extends Touchable {
    static Instance: GestureOverlay;

    @observable public InkShape: string = "";
    @observable public SavedColor?: string;
    @observable public SavedWidth?: string;
    @observable public SavedFill?: string;
    @observable public SavedArrowStart: string = "none";
    @observable public SavedArrowEnd: string = "none";
    @observable public SavedDash: String = "0";
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

    /**
     * Ignores all touch events that belong to a hand being held down.
     */
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
        if (RadialMenu.Instance?._display === true) {
            te.preventDefault();
            te.stopPropagation();
            RadialMenu.Instance.closeMenu();
            return;
        }

        // this chunk adds new touch targets to a map of pointer events; this helps us keep track of individual fingers
        // so that we can know, for example, if two fingers are pinching out or in.
        const actualPts: React.Touch[] = [];
        for (let i = 0; i < te.touches.length; i++) {
            const pt: any = te.touches.item(i);
            actualPts.push(pt);
            // pen is also a touch, but with a radius of 0.5 (at least with the surface pens)
            // and this seems to be the only way of differentiating pen and touch on touch events
            if (pt.radiusX > 1 && pt.radiusY > 1) {
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
        // if there are fewer than five touch events, handle as a touch event
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
                // -- radial menu code --
                this._holdTimer = setTimeout(() => {
                    console.log("hold");
                    const target = document.elementFromPoint(te.changedTouches?.item(0).clientX, te.changedTouches?.item(0).clientY);
                    const pt: any = te.touches[te.touches?.length - 1];
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
                this._holdTimer && clearTimeout(this._holdTimer);
            }
            document.removeEventListener("touchmove", this.onReactTouchMove);
            document.removeEventListener("touchend", this.onReactTouchEnd);
            document.addEventListener("touchmove", this.onReactTouchMove);
            document.addEventListener("touchend", this.onReactTouchEnd);
        }
        // otherwise, handle as a hand event
        else {
            this.handleHandDown(te);
            document.removeEventListener("touchmove", this.onReactTouchMove);
            document.removeEventListener("touchend", this.onReactTouchEnd);
        }
    }

    onReactTouchMove = (e: TouchEvent) => {
        const nts: any = this.getNewTouches(e);
        this._holdTimer && clearTimeout(this._holdTimer);
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
        this._holdTimer && clearTimeout(this._holdTimer);
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

        // cleanup any lingering pointers
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
        this._holdTimer && clearTimeout(this._holdTimer);

        // this chunk of code helps us keep track of which touch events ar e associated with a hand event
        // so that if a hand is held down, but a second hand is interacting with dash, the second hand's events
        // won't interfere with the first hand's events.
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

        // this chunk of code determines whether this is a left hand or a right hand, as well as which pointer is the thumb and pointer
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

        // load up the palette collection around the thumb
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
                this._palette = <HorizontalPalette key="palette" x={minX} y={minY} thumb={[thumb.clientX, thumb.clientY]} thumbDoc={thumbDoc} />;
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
        // update pointer trackers
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
        // update hand trackers
        const thumb = fingers.reduce((a, v) => a.clientY > v.clientY ? a : v, fingers[0]);
        if (thumb?.identifier && thumb?.identifier === this.thumbIdentifier) {
            this._hands.set(thumb.identifier, fingers);
        }

        // loop through every changed pointer
        for (let i = 0; i < e.changedTouches.length; i++) {
            const pt = e.changedTouches.item(i);
            // if the thumb was moved
            if (pt && pt.identifier === this.thumbIdentifier && this._thumbY) {
                if (this._thumbX && this._thumbY) {
                    // moving a thumb horiz. changes the palette collection selection, moving vert. changes the selection of any menus on the current palette item
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
            }
            // if the pointer finger was moved
            if (pt && pt.identifier === this.pointerIdentifier) {
                this._pointerY = pt.clientY;
            }
        }
    }

    @action
    handleHandUp = (e: TouchEvent) => {
        // sometimes, users may lift up their thumb or index finger if they can't stretch far enough to scroll an entire menu,
        // so we don't want to just remove the palette when that happens
        if (e.touches.length < 3) {
            if (this.thumbIdentifier) this._hands.delete(this.thumbIdentifier);
            this._palette = undefined;
            this.thumbIdentifier = undefined;
            this._thumbDoc = undefined;

            // this chunk of code is for handling the ink to text toolglass
            let scriptWorked = false;
            if (NumCast(this._inkToTextDoc?.selectedIndex) > -1) {
                // if there is a text option selected, activate it
                const selectedButton = this._possibilities[this._selectedIndex];
                if (selectedButton) {
                    selectedButton.props.onClick();
                    scriptWorked = true;
                }
            }
            // if there isn't a text option selected, dry the ink strokes into ink documents
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

    /**
     * Code for radial menu
     */
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

    /**
     * Code for radial menu
     */
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

    @action
    onPointerDown = (e: React.PointerEvent) => {
        if (InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || (Doc.GetSelectedTool() === InkTool.Highlighter || Doc.GetSelectedTool() === InkTool.Pen)) {
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
        if (InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || (Doc.GetSelectedTool() === InkTool.Highlighter || Doc.GetSelectedTool() === InkTool.Pen)) {
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

        // get the two targets at the ends of the line
        const ep1 = this._points[0];
        const ep2 = this._points[this._points.length - 1];
        const target1 = document.elementFromPoint(ep1.X, ep1.Y);
        const target2 = document.elementFromPoint(ep2.X, ep2.Y);

        // callback function to be called by each target
        const callback = (doc: Doc) => {
            if (!this._d1) {
                this._d1 = doc;
            }
            // we don't want to create a link of both endpoints are the same document (doing so makes drawing an l very hard)
            else if (this._d1 !== doc && !LinkManager.Instance.doesLinkExist(this._d1, doc)) {
                // we don't want to create a link between ink strokes (doing so makes drawing a t very hard)
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
            //push first points to so interactionUtil knows pointer is up
            this._points.push({ X: this._points[0].X, Y: this._points[0].Y });

            const initialPoint = this._points[0.];
            const xInGlass = initialPoint.X > (this._thumbX ?? Number.MAX_SAFE_INTEGER) && initialPoint.X < (this._thumbX ?? Number.MAX_SAFE_INTEGER) + (this.height);
            const yInGlass = initialPoint.Y > (this._thumbY ?? Number.MAX_SAFE_INTEGER) - (this.height) && initialPoint.Y < (this._thumbY ?? Number.MAX_SAFE_INTEGER);

            // if a toolglass is selected and the stroke starts within the toolglass boundaries
            if (this.Tool !== ToolglassTools.None && xInGlass && yInGlass) {
                switch (this.Tool) {
                    case ToolglassTools.InkToText:
                        document.removeEventListener("pointermove", this.onPointerMove);
                        document.removeEventListener("pointerup", this.onPointerUp);
                        this._strokes.push(new Array(...this._points));
                        this._points = [];
                        CognitiveServices.Inking.Appliers.InterpretStrokes(this._strokes).then((results) => {
                            const wordResults = results.filter((r: any) => r.category === "line");
                            const possibilities: string[] = [];
                            for (const wR of wordResults) {
                                if (wR?.recognizedText) {
                                    possibilities.push(wR?.recognizedText);
                                }
                                possibilities.push(...wR?.alternates?.map((a: any) => a.recognizedString));
                            }
                            const r = Math.max(this.svgBounds.right, ...this._strokes.map(s => this.getBounds(s).right));
                            const l = Math.min(this.svgBounds.left, ...this._strokes.map(s => this.getBounds(s).left));
                            const t = Math.min(this.svgBounds.top, ...this._strokes.map(s => this.getBounds(s).top));

                            // if we receive any word results from cognitive services, display them
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
            //if any of the shape is activated in the InkOptionsMenu
            else if (this.InkShape) {
                this.makePolygon(this.InkShape, false);
                this.dispatchGesture(GestureUtils.Gestures.Stroke);
                this._points = [];
                if (this.InkShape !== "noRec") {
                    this.InkShape = "";
                }
            }
            // if we're not drawing in a toolglass try to recognize as gesture
            else {
                const result = points.length > 2 && GestureUtils.GestureRecognizer.Recognize(new Array(points));
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
                            this.dispatchGesture("endbracket");
                            actionPerformed = true;
                            break;
                        case GestureUtils.Gestures.Line:
                            actionPerformed = this.handleLineGesture();
                            break;
                        case GestureUtils.Gestures.Triangle:
                            this.makePolygon("triangle", true);
                            break;
                        case GestureUtils.Gestures.Circle:
                            this.makePolygon("circle", true);
                            break;
                        case GestureUtils.Gestures.Rectangle:
                            this.makePolygon("rectangle", true);
                            break;
                        case GestureUtils.Gestures.Scribble:
                            console.log("scribble");
                            break;
                    }
                    if (actionPerformed) {
                        this._points = [];
                    }
                }

                // if no gesture (or if the gesture was unsuccessful), "dry" the stroke into an ink document
                if (!actionPerformed) {
                    this.dispatchGesture(GestureUtils.Gestures.Stroke);
                    this._points = [];
                }
            }
        } else {
            this._points = [];
        }
        SetActiveArrowStart("none");
        GestureOverlay.Instance.SavedArrowStart = ActiveArrowStart();
        SetActiveArrowEnd("none");
        GestureOverlay.Instance.SavedArrowEnd = ActiveArrowEnd();
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    makePolygon = (shape: string, gesture: boolean) => {
        const xs = this._points.map(p => p.X);
        const ys = this._points.map(p => p.Y);
        var right = Math.max(...xs);
        var left = Math.min(...xs);
        var bottom = Math.max(...ys);
        var top = Math.min(...ys);
        if (shape === "noRec") {
            return;
        }
        if (!gesture) {
            //if shape options is activated in inkOptionMenu
            //take second to last point because _point[length-1] is _points[0]
            right = this._points[this._points.length - 2].X;
            left = this._points[0].X;
            bottom = this._points[this._points.length - 2].Y;
            top = this._points[0].Y;
            if (shape !== "arrow" && shape !== "line") {
                if (left > right) {
                    const temp = right;
                    right = left;
                    left = temp;
                }
                if (top > bottom) {
                    const temp = top;
                    top = bottom;
                    bottom = temp;
                }
            }
        }
        this._points = [];
        switch (shape) {
            //must push an extra point in the end so InteractionUtils knows pointer is up.
            //must be (points[0].X,points[0]-1)
            case "rectangle":
                this._points.push({ X: left, Y: top });
                this._points.push({ X: right, Y: top });
                this._points.push({ X: right, Y: bottom });
                this._points.push({ X: left, Y: bottom });
                this._points.push({ X: left, Y: top });
                this._points.push({ X: left, Y: top - 1 });
                break;
            case "triangle":
                this._points.push({ X: left, Y: bottom });
                this._points.push({ X: right, Y: bottom });
                this._points.push({ X: (right + left) / 2, Y: top });
                this._points.push({ X: left, Y: bottom });
                this._points.push({ X: left, Y: bottom - 1 });
                break;
            case "circle":
                const centerX = (right + left) / 2;
                const centerY = (bottom + top) / 2;
                const radius = bottom - centerY;
                for (var y = top; y < bottom; y++) {
                    const x = Math.sqrt(Math.pow(radius, 2) - (Math.pow((y - centerY), 2))) + centerX;
                    this._points.push({ X: x, Y: y });
                }
                for (var y = bottom; y > top; y--) {
                    const x = Math.sqrt(Math.pow(radius, 2) - (Math.pow((y - centerY), 2))) + centerX;
                    const newX = centerX - (x - centerX);
                    this._points.push({ X: newX, Y: y });
                }
                this._points.push({ X: Math.sqrt(Math.pow(radius, 2) - (Math.pow((top - centerY), 2))) + centerX, Y: top });
                this._points.push({ X: Math.sqrt(Math.pow(radius, 2) - (Math.pow((top - centerY), 2))) + centerX, Y: top - 1 });
                break;
            case "line":
                this._points.push({ X: left, Y: top });
                this._points.push({ X: right, Y: bottom });
                // this._points.push({ X: right, Y: bottom - 1 });
                break;
            case "arrow":
                const x1 = left;
                const y1 = top;
                const x2 = right;
                const y2 = bottom;
                const L1 = Math.sqrt(Math.pow(Math.abs(x1 - x2), 2) + (Math.pow(Math.abs(y1 - y2), 2)));
                const L2 = L1 / 5;
                const angle = 0.785398;
                const x3 = x2 + (L2 / L1) * ((x1 - x2) * Math.cos(angle) + (y1 - y2) * Math.sin(angle));
                const y3 = y2 + (L2 / L1) * ((y1 - y2) * Math.cos(angle) - (x1 - x2) * Math.sin(angle));
                const x4 = x2 + (L2 / L1) * ((x1 - x2) * Math.cos(angle) - (y1 - y2) * Math.sin(angle));
                const y4 = y2 + (L2 / L1) * ((y1 - y2) * Math.cos(angle) + (x1 - x2) * Math.sin(angle));
                this._points.push({ X: x1, Y: y1 });
                this._points.push({ X: x2, Y: y2 });
                this._points.push({ X: x3, Y: y3 });
                this._points.push({ X: x4, Y: y4 });
                this._points.push({ X: x2, Y: y2 });
            // this._points.push({ X: x1, Y: y1 - 1 });
        }
    }

    dispatchGesture = (gesture: "box" | "line" | "startbracket" | "endbracket" | "stroke" | "scribble" | "text", stroke?: InkData, data?: any) => {
        const target = document.elementFromPoint((stroke ?? this._points)[0].X, (stroke ?? this._points)[0].Y);
        target?.dispatchEvent(
            new CustomEvent<GestureUtils.GestureEvent>("dashOnGesture",
                {
                    bubbles: true,
                    detail: {
                        points: stroke ?? this._points,
                        gesture: gesture as any,
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
        const width = Number(ActiveInkWidth());
        const B = this.svgBounds;
        B.left = B.left - width / 2;
        B.right = B.right + width / 2;
        B.top = B.top - width / 2;
        B.bottom = B.bottom + width / 2;
        B.width += width;
        B.height += width;
        return [
            this.props.children,
            this._palette,
            [this._strokes.map((l, i) => {
                const b = this.getBounds(l);
                return <svg key={i} width={b.width} height={b.height} style={{ transform: `translate(${b.left}px, ${b.top}px)`, pointerEvents: "none", position: "absolute", zIndex: 30000, overflow: "visible" }}>
                    {InteractionUtils.CreatePolyline(l, b.left, b.top, ActiveInkColor(), width, width,
                        ActiveInkBezierApprox(), ActiveFillColor(), ActiveArrowStart(), ActiveArrowEnd(),
                        ActiveDash(), 1, 1, this.InkShape, "none", false, false)}
                </svg>;
            }),
            this._points.length <= 1 ? (null) : <svg key="svg" width={B.width} height={B.height}
                style={{ transform: `translate(${B.left}px, ${B.top}px)`, pointerEvents: "none", position: "absolute", zIndex: 30000, overflow: "visible" }}>
                {InteractionUtils.CreatePolyline(this._points, B.left, B.top, ActiveInkColor(), width, width, ActiveInkBezierApprox(), ActiveFillColor(), ActiveArrowStart(), ActiveArrowEnd(), ActiveDash(), 1, 1, this.InkShape, "none", false, false)}
            </svg>]
        ];
    }
    screenToLocalTransform = () => new Transform(-(this._thumbX ?? 0), -(this._thumbY ?? 0) + this.height, 1);
    return300 = () => 300;
    @action
    public openFloatingDoc = (doc: Doc) => {
        this._clipboardDoc =
            <DocumentView
                Document={doc}
                DataDoc={undefined}
                LibraryPath={emptyPath}
                addDocument={undefined}
                addDocTab={returnFalse}
                rootSelected={returnTrue}
                pinToPres={emptyFunction}
                onClick={undefined}
                removeDocument={undefined}
                ScreenToLocalTransform={this.screenToLocalTransform}
                ContentScaling={returnOne}
                PanelWidth={this.return300}
                PanelHeight={this.return300}
                NativeHeight={returnZero}
                NativeWidth={returnZero}
                renderDepth={0}
                backgroundColor={returnEmptyString}
                focus={emptyFunction}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                docFilters={returnEmptyFilter}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
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
        return (
            <div className="gestureOverlay-cont" onPointerDown={this.onPointerDown} onTouchStart={this.onReactTouchStart}>
                {this.showMobileInkOverlay ? <MobileInkOverlay /> : <></>}
                {this.elements}

                <div className="clipboardDoc-cont" style={{
                    height: this.height,
                    width: this.height,
                    pointerEvents: this._clipboardDoc ? "unset" : "none",
                    touchAction: this._clipboardDoc ? "unset" : "none",
                    transform: `translate(${this._thumbX}px, ${(this._thumbY || 0) - this.height} px)`,
                }}>
                    {this._clipboardDoc}
                </div>
                <div className="filter-cont" style={{
                    transform: `translate(${this._thumbX}px, ${(this._thumbY || 0) - this.height}px)`,
                    height: this.height,
                    width: this.height,
                    pointerEvents: "none",
                    touchAction: "none",
                    display: this.showBounds ? "unset" : "none",
                }}>
                </div>
                <TouchScrollableMenu options={this._possibilities} bounds={this.svgBounds} selectedIndex={this._selectedIndex} x={this._menuX} y={this._menuY} />
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
Scripting.addGlobal(function setPen(width: any, color: any, fill: any, arrowStart: any, arrowEnd: any, dash: any) {
    runInAction(() => {
        GestureOverlay.Instance.SavedColor = ActiveInkColor();
        SetActiveInkColor(color);
        GestureOverlay.Instance.SavedWidth = ActiveInkWidth();
        SetActiveInkWidth(width);
        GestureOverlay.Instance.SavedFill = ActiveFillColor();
        SetActiveFillColor(fill);
        GestureOverlay.Instance.SavedArrowStart = ActiveArrowStart();
        SetActiveArrowStart(arrowStart);
        GestureOverlay.Instance.SavedArrowEnd = ActiveArrowEnd();
        SetActiveArrowStart(arrowEnd);
        GestureOverlay.Instance.SavedDash = ActiveDash();
        SetActiveDash(dash);
    });
});
Scripting.addGlobal(function resetPen() {
    runInAction(() => {
        SetActiveInkColor(GestureOverlay.Instance.SavedColor ?? "rgb(0, 0, 0)");
        SetActiveInkWidth(GestureOverlay.Instance.SavedWidth ?? "2");
    });
}, "resets the pen tool");
Scripting.addGlobal(function createText(text: any, x: any, y: any) {
    GestureOverlay.Instance.dispatchGesture("text", [{ X: x, Y: y }], text);
}, "creates a text document with inputted text and coordinates", "(text: any, x: any, y: any)");
