import React = require("react");
import * as beziercurve from 'bezier-curve';
export namespace InteractionUtils {
    export const MOUSETYPE = "mouse";
    export const TOUCHTYPE = "touch";
    export const PENTYPE = "pen";
    export const ERASERTYPE = "eraser";

    const POINTER_PEN_BUTTON = -1;
    const REACT_POINTER_PEN_BUTTON = 0;
    const ERASER_BUTTON = 5;

    export class MultiTouchEvent<T extends React.TouchEvent | TouchEvent> {
        constructor(
            readonly fingers: number,
            readonly targetTouches: T extends React.TouchEvent ? React.Touch[] : Touch[],
            readonly touches: T extends React.TouchEvent ? React.Touch[] : Touch[],
            readonly changedTouches: T extends React.TouchEvent ? React.Touch[] : Touch[],
            readonly touchEvent: T extends React.TouchEvent ? React.TouchEvent : TouchEvent
        ) { }
    }

    export interface MultiTouchEventDisposer { (): void; }

    /**
     * 
     * @param element - element to turn into a touch target
     * @param startFunc - event handler, typically Touchable.onTouchStart (classes that inherit touchable can pass in this.onTouchStart)
     */
    export function MakeMultiTouchTarget(
        element: HTMLElement,
        startFunc: (e: Event, me: MultiTouchEvent<React.TouchEvent>) => void
    ): MultiTouchEventDisposer {
        const onMultiTouchStartHandler = (e: Event) => startFunc(e, (e as CustomEvent<MultiTouchEvent<React.TouchEvent>>).detail);
        // const onMultiTouchMoveHandler = moveFunc ? (e: Event) => moveFunc(e, (e as CustomEvent<MultiTouchEvent<TouchEvent>>).detail) : undefined;
        // const onMultiTouchEndHandler = endFunc ? (e: Event) => endFunc(e, (e as CustomEvent<MultiTouchEvent<TouchEvent>>).detail) : undefined;
        element.addEventListener("dashOnTouchStart", onMultiTouchStartHandler);
        // if (onMultiTouchMoveHandler) {
        //     element.addEventListener("dashOnTouchMove", onMultiTouchMoveHandler);
        // }
        // if (onMultiTouchEndHandler) {
        //     element.addEventListener("dashOnTouchEnd", onMultiTouchEndHandler);
        // }
        return () => {
            element.removeEventListener("dashOnTouchStart", onMultiTouchStartHandler);
            // if (onMultiTouchMoveHandler) {
            //     element.removeEventListener("dashOnTouchMove", onMultiTouchMoveHandler);
            // }
            // if (onMultiTouchEndHandler) {
            //     element.removeEventListener("dashOnTouchend", onMultiTouchEndHandler);
            // }
        };
    }

    /**
     * Turns an element onto a target for touch hold handling.
     * @param element - element to add events to
     * @param func - function to add to the event
     */
    export function MakeHoldTouchTarget(
        element: HTMLElement,
        func: (e: Event, me: MultiTouchEvent<React.TouchEvent>) => void
    ): MultiTouchEventDisposer {
        const handler = (e: Event) => func(e, (e as CustomEvent<MultiTouchEvent<React.TouchEvent>>).detail);
        element.addEventListener("dashOnTouchHoldStart", handler);
        return () => {
            element.removeEventListener("dashOnTouchHoldStart", handler);
        };
    }

    export function GetMyTargetTouches(mte: InteractionUtils.MultiTouchEvent<React.TouchEvent | TouchEvent>, prevPoints: Map<number, React.Touch>, ignorePen: boolean): React.Touch[] {
        const myTouches = new Array<React.Touch>();
        for (const pt of mte.touches) {
            if (!ignorePen || ((pt as any).radiusX > 1 && (pt as any).radiusY > 1)) {
                for (const tPt of mte.targetTouches) {
                    if (tPt ?.screenX === pt ?.screenX && tPt ?.screenY === pt ?.screenY) {
                        if (pt && prevPoints.has(pt.identifier)) {
                            myTouches.push(pt);
                        }
                    }
                }
            }
        }
        // if (mte.touches.length !== myTouches.length) {
        //     throw Error("opo")
        // }
        return myTouches;
    }

    export function CreatePolyline(points: { X: number, Y: number }[], left: number, top: number, color: string, width: string) {
        //if bezier
        if (points.length > 1 && points[points.length - 1].X === points[0].X && points[points.length - 1].Y === points[0].Y) {
            const newPoints: number[][] = [];
            const newPts: { X: number; Y: number; }[] = [];
            //pick key points
            for (var i = 0; i < points.length - 1; i++) {
                if (
                    (i === 0 || i === points.length - 2) ||
                    (points[i - 1].X >= points[i].X && points[i + 1].X > points[i].X) ||
                    (points[i - 1].X <= points[i].X && points[i + 1].X < points[i].X) ||
                    (points[i - 1].Y >= points[i].Y && points[i + 1].Y > points[i].Y) ||
                    (points[i - 1].Y <= points[i].Y && points[i + 1].Y < points[i].Y)) {
                    newPoints.push([points[i].X, points[i].Y]);
                }
            }
            //run bezier
            for (var t = 0; t < 1; t += 0.01) {
                const point = (beziercurve(t, newPoints));
                newPts.push({ X: point[0], Y: point[1] });
            }
            //reduce points
            var pts = newPts.reduce((acc: string, pt: { X: number, Y: number }) => acc + `${pt.X - left},${pt.Y - top} `, "");

            //normal line
        } else {
            pts = points.reduce((acc: string, pt: { X: number, Y: number }) => acc + `${pt.X - left},${pt.Y - top} `, "");

        }

        return (
            <polyline
                points={pts}
                style={{
                    fill: "none",
                    stroke: color ?? "rgb(0, 0, 0)",
                    strokeWidth: parseInt(width),
                    strokeLinejoin: "round",
                    strokeLinecap: "round"
                }}
            />
        );
    }

    /**
     * Returns whether or not the pointer event passed in is of the type passed in
     * @param e - pointer event. this event could be from a mouse, a pen, or a finger
     * @param type - InteractionUtils.(PENTYPE | ERASERTYPE | MOUSETYPE | TOUCHTYPE)
     */
    export function IsType(e: PointerEvent | React.PointerEvent, type: string): boolean {
        switch (type) {
            // pen and eraser are both pointer type 'pen', but pen is button 0 and eraser is button 5. -syip2
            case PENTYPE:
                return e.pointerType === PENTYPE && (e.button === -1 || e.button === 0);
            case ERASERTYPE:
                return e.pointerType === PENTYPE && e.button === (e instanceof PointerEvent ? ERASER_BUTTON : ERASER_BUTTON);
            default:
                return e.pointerType === type;
        }
    }

    /**
     * Returns euclidean distance between two points
     * @param pt1 
     * @param pt2 
     */
    export function TwoPointEuclidist(pt1: React.Touch, pt2: React.Touch): number {
        return Math.sqrt(Math.pow(pt1.clientX - pt2.clientX, 2) + Math.pow(pt1.clientY - pt2.clientY, 2));
    }

    /**
     * Returns the centroid of an n-arbitrary long list of points (takes the average the x and y components of each point)
     * @param pts - n-arbitrary long list of points
     */
    export function CenterPoint(pts: React.Touch[]): { X: number, Y: number } {
        const centerX = pts.map(pt => pt.clientX).reduce((a, b) => a + b, 0) / pts.length;
        const centerY = pts.map(pt => pt.clientY).reduce((a, b) => a + b, 0) / pts.length;
        return { X: centerX, Y: centerY };
    }

    /**
     * Returns -1 if pinching out, 0 if not pinching, and 1 if pinching in
     * @param pt1 - new point that corresponds to oldPoint1
     * @param pt2 - new point that corresponds to oldPoint2
     * @param oldPoint1 - previous point 1
     * @param oldPoint2 - previous point 2
     */
    export function Pinching(pt1: React.Touch, pt2: React.Touch, oldPoint1: React.Touch, oldPoint2: React.Touch): number {
        const threshold = 4;
        const oldDist = TwoPointEuclidist(oldPoint1, oldPoint2);
        const newDist = TwoPointEuclidist(pt1, pt2);

        /** if they have the same sign, then we are either pinching in or out.
          * threshold it by 10 (it has to be pinching by at least threshold to be a valid pinch)
          * so that it can still pan without freaking out
          */
        if (Math.sign(oldDist) === Math.sign(newDist) && Math.abs(oldDist - newDist) > threshold) {
            return Math.sign(oldDist - newDist);
        }
        return 0;
    }

    /**
     * Returns -1 if pinning and pinching out, 0 if not pinning, and 1 if pinching in
     * @param pt1 - new point that corresponds to oldPoint1
     * @param pt2 - new point that corresponds to oldPoint2
     * @param oldPoint1 - previous point 1
     * @param oldPoint2 - previous point 2
     */
    export function Pinning(pt1: React.Touch, pt2: React.Touch, oldPoint1: React.Touch, oldPoint2: React.Touch): number {
        const threshold = 4;

        const pt1Dist = TwoPointEuclidist(oldPoint1, pt1);
        const pt2Dist = TwoPointEuclidist(oldPoint2, pt2);

        const pinching = Pinching(pt1, pt2, oldPoint1, oldPoint2);

        if (pinching !== 0) {
            if ((pt1Dist < threshold && pt2Dist > threshold) || (pt1Dist > threshold && pt2Dist < threshold)) {
                return pinching;
            }
        }
        return 0;
    }

    export function IsDragging(oldTouches: Map<number, React.Touch>, newTouches: React.Touch[], leniency: number): boolean {
        for (const touch of newTouches) {
            if (touch) {
                const oldTouch = oldTouches.get(touch.identifier);
                if (oldTouch) {
                    if (TwoPointEuclidist(touch, oldTouch) >= leniency) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // These might not be very useful anymore, but I'll leave them here for now -syip2
    {


        /**
         * Returns the type of Touch Interaction from a list of points.
         * Also returns any data that is associated with a Touch Interaction
         * @param pts - List of points
         */
        // export function InterpretPointers(pts: React.Touch[]): { type: Opt<TouchInteraction>, data?: any } {
        //     const leniency = 200;
        //     switch (pts.length) {
        //         case 1:
        //             return { type: OneFinger };
        //         case 2:
        //             return { type: TwoSeperateFingers };
        //         case 3:
        //             let pt1 = pts[0];
        //             let pt2 = pts[1];
        //             let pt3 = pts[2];
        //             if (pt1 && pt2 && pt3) {
        //                 let dist12 = TwoPointEuclidist(pt1, pt2);
        //                 let dist23 = TwoPointEuclidist(pt2, pt3);
        //                 let dist13 = TwoPointEuclidist(pt1, pt3);
        //                 console.log(`distances: ${dist12}, ${dist23}, ${dist13}`);
        //                 let dist12close = dist12 < leniency;
        //                 let dist23close = dist23 < leniency;
        //                 let dist13close = dist13 < leniency;
        //                 let xor2313 = dist23close ? !dist13close : dist13close;
        //                 let xor = dist12close ? !xor2313 : xor2313;
        //                 // three input xor because javascript doesn't have logical xor's
        //                 if (xor) {
        //                     let points: number[] = [];
        //                     let min = Math.min(dist12, dist23, dist13);
        //                     switch (min) {
        //                         case dist12:
        //                             points = [0, 1, 2];
        //                             break;
        //                         case dist23:
        //                             points = [1, 2, 0];
        //                             break;
        //                         case dist13:
        //                             points = [0, 2, 1];
        //                             break;
        //                     }
        //                     return { type: TwoToOneFingers, data: points };
        //                 }
        //                 else {
        //                     return { type: ThreeSeperateFingers, data: null };
        //                 }
        //             }
        //         default:
        //             return { type: undefined };
        //     }
        // }
    }
}