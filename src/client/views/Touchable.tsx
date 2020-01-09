import * as React from 'react';
import { action } from 'mobx';
import { InteractionUtils } from '../util/InteractionUtils';
import { RadialMenu } from './nodes/RadialMenu';

const HOLD_DURATION = 1000;

export abstract class Touchable<T = {}> extends React.Component<T> {
    //private holdTimer: NodeJS.Timeout | undefined;
    holdTimer: NodeJS.Timeout | undefined;

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
    protected onTouchStart = (e: React.TouchEvent): void => {
        for (let i = 0; i < e.targetTouches.length; i++) {
            const pt: any = e.targetTouches.item(i);
            // pen is also a touch, but with a radius of 0.5 (at least with the surface pens)
            // and this seems to be the only way of differentiating pen and touch on touch events
            if (pt.radiusX > 0.5 && pt.radiusY > 0.5) {
                this.prevPoints.set(pt.identifier, pt);
            }
        }

        if (this.prevPoints.size) {
            switch (this.prevPoints.size) {
                case 1:
                    this.handle1PointerDown(e);
                    e.persist();
                    this.holdTimer = setTimeout(() => this.handle1PointerHoldStart(e), HOLD_DURATION);
                    break;
                case 2:
                    this.handle2PointersDown(e);
                    break;
            }
        }
    }

    /**
    * Handle touch move event
    */
    @action
    protected onTouch = (e: TouchEvent): void => {
        const myTouches = InteractionUtils.GetMyTargetTouches(e, this.prevPoints);

        // if we're not actually moving a lot, don't consider it as dragging yet
        if (!InteractionUtils.IsDragging(this.prevPoints, myTouches, 5) && !this._touchDrag) return;
        this._touchDrag = true;
        if (this.holdTimer) {
            console.log("CLEAR")
            clearTimeout(this.holdTimer);
        }
        switch (myTouches.length) {
            case 1:
                this.handle1PointerMove(e);
                break;
            case 2:
                this.handle2PointersMove(e);
                break;
        }

        for (let i = 0; i < e.targetTouches.length; i++) {
            const pt = e.targetTouches.item(i);
            if (pt) {
                if (this.prevPoints.has(pt.identifier)) {
                    this.prevPoints.set(pt.identifier, pt);
                }
            }
        }
    }

    @action
    protected onTouchEnd = (e: TouchEvent): void => {
        // console.log(InteractionUtils.GetMyTargetTouches(e, this.prevPoints).length + " up");
        // remove all the touches associated with the event
        for (let i = 0; i < e.changedTouches.length; i++) {
            const pt = e.changedTouches.item(i);
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
        e.stopPropagation();


        // if (e.targetTouches.length === 0) {
        //     this.prevPoints.clear();
        // }

        if (this.prevPoints.size === 0) {
            this.cleanUpInteractions();
        }
    }

    cleanUpInteractions = (): void => {
        document.removeEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchend", this.onTouchEnd);
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
        document.removeEventListener("touchmove", this.onTouch);
        document.addEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchend", this.onTouchEnd);
        document.addEventListener("touchend", this.onTouchEnd);
    }

    handle2PointersDown = (e: React.TouchEvent): any => {
        document.removeEventListener("touchmove", this.onTouch);
        document.addEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchend", this.onTouchEnd);
        document.addEventListener("touchend", this.onTouchEnd);
    }

    handle1PointerHoldStart = (e: React.TouchEvent): any => {
        console.log("Hold");
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("touchmove", this.onTouch);
        document.removeEventListener("touchend", this.onTouchEnd);
    }

}