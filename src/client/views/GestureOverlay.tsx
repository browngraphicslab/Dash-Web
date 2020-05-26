import React = require("react");
import { Touchable } from "./Touchable";
import { observer } from "mobx-react";
import "./GestureOverlay.scss";
import { computed, observable, action, runInAction, IReactionDisposer, reaction, flow, trace } from "mobx";
import { GestureUtils } from "../../pen-gestures/GestureUtils";
import { InteractionUtils } from "../util/InteractionUtils";
import { InkingControl } from "./InkingControl";
import { InkTool, InkData } from "../../fields/InkField";
import { Doc } from "../../fields/Doc";
import { LinkManager } from "../util/LinkManager";
import { DocUtils, Docs } from "../documents/Documents";
import { undoBatch } from "../util/UndoManager";
import { Scripting } from "../util/Scripting";
import { FieldValue, Cast, NumCast, BoolCast } from "../../fields/Types";
import { CurrentUserUtils } from "../util/CurrentUserUtils";
import HorizontalPalette from "./Palette";
import { Utils, emptyPath, emptyFunction, returnFalse, returnOne, returnEmptyString, returnTrue, numberRange, returnZero } from "../../Utils";
import { DocumentView } from "./nodes/DocumentView";
import { Transform } from "../util/Transform";
import { DocumentContentsView } from "./nodes/DocumentContentsView";
import { CognitiveServices } from "../cognitive_services/CognitiveServices";
import { DocServer } from "../DocServer";
import htmlToImage from "html-to-image";
import { ScriptField } from "../../fields/ScriptField";
import { listSpec } from "../../fields/Schema";
import { List } from "../../fields/List";
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

    @observable public SavedColor?: string;
    @observable public SavedWidth?: string;
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
        if (RadialMenu.Instance._display === true) {
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
                    const target = document.elementFromPoint(te.changedTouches.item(0).clientX, te.changedTouches.item(0).clientY);
                    const pt: any = te.touches[te.touches.length - 1];
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

        // this chunk of code helps us keep track of which touch events are associated with a hand event
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
                            this.makePolygon("triangle");
                            break;
                        case GestureUtils.Gestures.Circle:
                            this.makePolygon("circle");
                            break;
                        case GestureUtils.Gestures.Rectangle:
                            this.makePolygon("rectangle");
                            break;
                        // case GestureUtils.Gestures.Arrow:
                        //     console.log("arrow");
                        //     this._points = [];
                        //     break;
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
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }
    //resets this._points into a polygon
    makePolygon = (shape: string) => {
        const xs = this._points.map(p => p.X);
        const ys = this._points.map(p => p.Y);
        const right = Math.max(...xs);
        const left = Math.min(...xs);
        const bottom = Math.max(...ys);
        const top = Math.min(...ys);
        this._points = [];
        switch (shape) {
            case "rectangle":
                this._points.push({ X: left, Y: top });
                this._points.push({ X: right, Y: top });
                this._points.push({ X: right, Y: bottom });
                this._points.push({ X: left, Y: bottom });
                this._points.push({ X: left, Y: top });
                break;

            case "triangle":
                this._points.push({ X: left, Y: bottom });
                this._points.push({ X: right, Y: bottom });
                this._points.push({ X: (right + left) / 2, Y: top });
                this._points.push({ X: left, Y: bottom });
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
                break;


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
        const B = this.svgBounds;
        return [
            this.props.children,
            this._palette,
            [this._strokes.map(l => {
                const b = this.getBounds(l);
                return <svg key={b.left} width={b.width} height={b.height} style={{ transform: `translate(${b.left}px, ${b.top}px)`, pointerEvents: "none", position: "absolute", zIndex: 30000, overflow: "visible" }}>
                    {InteractionUtils.CreatePolyline(l, b.left, b.top, InkingControl.Instance.selectedColor, InkingControl.Instance.selectedWidth)}
                </svg>;
            }),
            this._points.length <= 1 ? (null) : <svg width={B.width} height={B.height} style={{ transform: `translate(${B.left}px, ${B.top}px)`, pointerEvents: "none", position: "absolute", zIndex: 30000, overflow: "visible" }}>
                {InteractionUtils.CreatePolyline(this._points, B.left, B.top, InkingControl.Instance.selectedColor, InkingControl.Instance.selectedWidth)}
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
Scripting.addGlobal(function setPen(width: any, color: any) {
    runInAction(() => {
        GestureOverlay.Instance.SavedColor = InkingControl.Instance.selectedColor;
        InkingControl.Instance.updateSelectedColor(color);
        GestureOverlay.Instance.SavedWidth = InkingControl.Instance.selectedWidth;
        InkingControl.Instance.switchWidth(width);
    });
});
Scripting.addGlobal(function resetPen() {
    runInAction(() => {
        InkingControl.Instance.updateSelectedColor(GestureOverlay.Instance.SavedColor ?? "rgb(0, 0, 0)");
        InkingControl.Instance.switchWidth(GestureOverlay.Instance.SavedWidth ?? "2");
    });
});
Scripting.addGlobal(function createText(text: any, x: any, y: any) {
    GestureOverlay.Instance.dispatchGesture("text", [{ X: x, Y: y }], text);
});