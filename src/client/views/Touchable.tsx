import * as React from 'react';
import { action } from 'mobx';
import { InteractionUtils } from '../util/InteractionUtils';
import { SelectionManager } from '../util/SelectionManager';
import { RadialMenu } from './nodes/RadialMenu';

const HOLD_DURATION = 1000;

export abstract class Touchable<T = {}> extends React.Component<T> {
    //private holdTimer: NodeJS.Timeout | undefined;
    private holdTimer: NodeJS.Timeout | undefined;
    private moveDisposer?: InteractionUtils.MultiTouchEventDisposer;
    private endDisposer?: InteractionUtils.MultiTouchEventDisposer;

    protected abstract multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;
    protected _touchDrag: boolean = false;
    protected prevPoints: Map<number, React.Touch> = new Map<number, React.Touch>();

    public FirstX: number = 0;
    public FirstY: number = 0;
    public SecondX: number = 0;
    public SecondY: number = 0;

    /**
     * When a touch even starts, we keep track of each touch that is associated with that event
     */
    @action
    protected onTouchStart = (e: Event, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>): void => {
        const actualPts: React.Touch[] = [];
        const te = me.touchEvent;
        // loop through all touches on screen
        for (let i = 0; i < te.touches.length; i++) {
            const pt: any = te.touches.item(i);
            actualPts.push(pt);
            if (this.prevPoints.has(pt.identifier)) {
                this.prevPoints.set(pt.identifier, pt);
            }
            // only add the ones that are targeted on "this" element, but with the identifier that the screen touch gives
            for (let j = 0; j < te.changedTouches.length; j++) {
                const tPt = te.changedTouches.item(j);
                if (pt.clientX === tPt.clientX && pt.clientY === tPt.clientY) {
                    // pen is also a touch, but with a radius of 0.5 (at least with the surface pens)
                    // and this seems to be the only way of differentiating pen and touch on touch events
                    if (pt.radiusX > 1 && pt.radiusY > 1) {
                        this.prevPoints.set(pt.identifier, pt);
                    }
                }
            }
        }

        const ptsToDelete: number[] = [];
        this.prevPoints.forEach(pt => {
            if (!actualPts.includes(pt)) {
                ptsToDelete.push(pt.identifier);
            }
        });

        // console.log(ptsToDelete.length);
        ptsToDelete.forEach(pt => this.prevPoints.delete(pt));

        // console.log(this.prevPoints.size);
        if (this.prevPoints.size) {
            switch (this.prevPoints.size) {
                case 1:
                    this.handle1PointerDown(te);
                    te.persist();
                    // if (this.holdTimer) {
                    //     clearTimeout(this.holdTimer)
                    //     this.holdTimer = undefined;
                    // }
                    this.holdTimer = setTimeout(() => this.handle1PointerHoldStart(te), HOLD_DURATION);
                    // e.stopPropagation();
                    // console.log(this.holdTimer);
                    break;
                case 2:
                    this.handle2PointersDown(te);
                    // e.stopPropagation();
                    break;
                // case 5:
                //     this.handleHandDown(te);
                //     break;
            }
        }
    }

    /**
    * Handle touch move event
    */
    @action
    protected onTouch = (e: Event, me: InteractionUtils.MultiTouchEvent<TouchEvent>): void => {
        const te = me.touchEvent;
        const myTouches = InteractionUtils.GetMyTargetTouches(te, this.prevPoints, true);

        // if we're not actually moving a lot, don't consider it as dragging yet
        if (!InteractionUtils.IsDragging(this.prevPoints, myTouches, 5) && !this._touchDrag) return;
        this._touchDrag = true;
        if (this.holdTimer) {
            console.log("CLEAR");
            clearTimeout(this.holdTimer);
            // this.holdTimer = undefined;
        }
        // console.log(myTouches.length);
        switch (myTouches.length) {
            case 1:
                this.handle1PointerMove(te);
                break;
            case 2:
                this.handle2PointersMove(te);
                break;
        }

        for (let i = 0; i < te.touches.length; i++) {
            const pt = te.touches.item(i);
            if (pt) {
                if (this.prevPoints.has(pt.identifier)) {
                    this.prevPoints.set(pt.identifier, pt);
                }
            }
        }
    }

    @action
    protected onTouchEnd = (e: Event, me: InteractionUtils.MultiTouchEvent<TouchEvent>): void => {
        // console.log(InteractionUtils.GetMyTargetTouches(e, this.prevPoints).length + " up");
        // remove all the touches associated with the event
        const te = me.touchEvent;
        for (let i = 0; i < te.changedTouches.length; i++) {
            const pt = te.changedTouches.item(i);
            if (pt) {
                if (this.prevPoints.has(pt.identifier)) {
                    this.prevPoints.delete(pt.identifier);
                }
            }
        }
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            console.log("clear");
        }
        this._touchDrag = false;
        te.stopPropagation();


        // if (e.targetTouches.length === 0) {
        //     this.prevPoints.clear();
        // }

        if (this.prevPoints.size === 0) {
            this.cleanUpInteractions();
        }
        e.stopPropagation();
    }

    cleanUpInteractions = (): void => {
        this.removeMoveListeners();
        this.removeEndListeners();
    }

    handle1PointerMove = (e: TouchEvent): any => {
        e.stopPropagation();
        e.preventDefault();
    }

    handle2PointersMove = (e: TouchEvent): any => {
        e.stopPropagation();
        e.preventDefault();
    }

    handle1PointerDown = (e: React.TouchEvent): any => {
        this.removeMoveListeners();
        this.addMoveListeners();
        this.removeEndListeners();
        this.addEndListeners();
    }

    handle2PointersDown = (e: React.TouchEvent): any => {
        this.removeMoveListeners();
        this.addMoveListeners();
        this.removeEndListeners();
        this.addEndListeners();
    }

    handle1PointerHoldStart = (e: React.TouchEvent): any => {
        e.stopPropagation();
        e.preventDefault();
        this.removeMoveListeners();
    }

    addMoveListeners = () => {
        const handler = (e: Event) => this.onTouch(e, (e as CustomEvent<InteractionUtils.MultiTouchEvent<TouchEvent>>).detail);
        document.addEventListener("dashOnTouchMove", handler);
        this.moveDisposer = () => document.removeEventListener("dashOnTouchMove", handler);
    }

    removeMoveListeners = () => {
        this.moveDisposer && this.moveDisposer();
    }

    addEndListeners = () => {
        const handler = (e: Event) => this.onTouchEnd(e, (e as CustomEvent<InteractionUtils.MultiTouchEvent<TouchEvent>>).detail);
        document.addEventListener("dashOnTouchEnd", handler);
        this.endDisposer = () => document.removeEventListener("dashOnTouchEnd", handler);
    }

    removeEndListeners = () => {
        this.endDisposer && this.endDisposer();
    }

    handleHandDown = (e: React.TouchEvent) => {
        // e.stopPropagation();
        // e.preventDefault();
    }
}