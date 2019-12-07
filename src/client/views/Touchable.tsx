import * as React from 'react';
import { action } from 'mobx';
import { InteractionUtils } from '../util/InteractionUtils';

export abstract class Touchable<T = {}> extends React.Component<T> {
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
            let pt: any = e.targetTouches.item(i);
            // pen is also a touch, but with a radius of 0.5 (at least with the surface pens). i doubt anyone's fingers are 2 pixels wide,
            // and this seems to be the only way of differentiating pen and touch on touch events
            if (pt.radiusX > 2 && pt.radiusY > 2) {
                this.prevPoints.set(pt.identifier, pt);
            }
        }

        if (this.prevPoints.size) {
            console.log(e.targetTouches.length);
            switch (this.prevPoints.size) {
                case 1:
                    this.handle1PointerDown(e);
                    break;
                case 2:
                    this.handle2PointersDown(e);
                    break;
            }

            document.removeEventListener("touchmove", this.onTouch);
            document.addEventListener("touchmove", this.onTouch);
            document.removeEventListener("touchend", this.onTouchEnd);
            document.addEventListener("touchend", this.onTouchEnd);
        }
    }

    /**
    * Handle touch move event
    */
    @action
    protected onTouch = (e: TouchEvent): void => {
        let myTouches = InteractionUtils.GetMyTargetTouches(e, this.prevPoints);

        // if we're not actually moving a lot, don't consider it as dragging yet
        // if (!InteractionUtils.IsDragging(this.prevPoints, e.targetTouches, 5) && !this._touchDrag) return;
        this._touchDrag = true;
        switch (myTouches.length) {
            case 1:
                this.handle1PointerMove(e);
                break;
            case 2:
                this.handle2PointersMove(e);
                break;
        }

        for (let i = 0; i < e.targetTouches.length; i++) {
            let pt = e.targetTouches.item(i);
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
            let pt = e.changedTouches.item(i);
            if (pt && this.prevPoints.has(pt.identifier)) {
                this.prevPoints.delete(pt.identifier);
            }
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

    handle1PointerDown = (e: React.TouchEvent): any => { };
    handle2PointersDown = (e: React.TouchEvent): any => { };
}