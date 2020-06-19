import React = require("react");
import * as beziercurve from 'bezier-curve';
import * as fitCurve from 'fit-curve';
import InkOptionsMenu from "../views/collections/collectionFreeForm/InkOptionsMenu";
import "./InteractionUtils.scss";

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
                    if (tPt?.screenX === pt?.screenX && tPt?.screenY === pt?.screenY) {
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


    export function CreatePolyline(points: { X: number, Y: number }[], left: number, top: number, color: string, width: string, bezier: string, fill: string, arrowStart: string, arrowEnd: string, dash: string, scalex: number, scaley: number, shape: string, pevents: string, drawHalo: boolean) {
        var pts = "";
        if (shape) {
            //if any of the shape are true
            const shapePts = makePolygon(shape, points);
            pts = shapePts.reduce((acc: string, pt: { X: number, Y: number }) => acc + `${pt.X * scalex - left * scalex},${pt.Y * scaley - top * scaley} `, "");
        }
        else if (points.length > 1 && points[points.length - 1].X === points[0].X && points[points.length - 1].Y === points[0].Y) {
            //pointer is up (first and last points are the same)
            const newPoints: number[][] = [];
            const newPts: { X: number; Y: number; }[] = [];
            //convert to [][] for fitcurve module
            for (var i = 0; i < points.length - 2; i++) {
                newPoints.push([points[i].X, points[i].Y]);
            }
            const bezierCurves = fitCurve(newPoints, parseInt(bezier));
            for (var i = 0; i < bezierCurves.length; i++) {
                for (var t = 0; t < 1; t += 0.01) {
                    const point = beziercurve(t, bezierCurves[i]);
                    newPts.push({ X: point[0], Y: point[1] });
                }
            }
            pts = newPts.reduce((acc: string, pt: { X: number, Y: number }) => acc + `${pt.X * scalex - left * scalex},${pt.Y * scaley - top * scaley} `, "");
        } else {
            //in the middle of drawing
            pts = points.reduce((acc: string, pt: { X: number, Y: number }) => acc + `${pt.X * scalex - left * scalex},${pt.Y * scaley - top * scaley} `, "");
        }
        const dashArray = String(Number(width) * Number(dash));

        return (
            <svg>
                <defs>
                    <marker id="dot" orient="auto" overflow="visible">
                        <circle r={0.5} fill="context-stroke" />
                    </marker>
                    <marker id="arrowHead" orient="auto" overflow="visible" refX="3" refY="1" markerWidth="10" markerHeight="7">
                        {/* <rect width={strokeWidth} height={strokeWidth} transform='rotate(45)' fill="dodgerblue" /> */}
                        <polygon points="3 0, 3 2, 0 1" fill="black" />
                    </marker>
                    <marker id="arrowEnd" orient="auto" overflow="visible" refX="0" refY="1" markerWidth="10" markerHeight="7">
                        {/* <rect width={strokeWidth} height={strokeWidth} transform='rotate(45)' fill="dodgerblue" /> */}
                        <polygon points="0 0, 3 1, 0 2" fill="black" />
                    </marker>

                </defs>
                {/* <polyline
                    points={pts}
                    style={{
                        fill: fill,
                        pointerEvents: pevents as any,
                        stroke: drawHalo ? "grey" : "transparent",
                        strokeWidth: parseInt(width) * 4,
                        strokeLinejoin: "round",
                        strokeLinecap: "round",
                        strokeDasharray: dashArray
                    }}
                    markerStart={arrowStart}
                    markerEnd={arrowEnd}
                /> */}

                <polyline
                    points={pts}
                    style={{
                        // filter: drawHalo ? "url(#dangerShine)" : undefined,
                        fill: fill,
                        pointerEvents: pevents as any,
                        stroke: color ?? "rgb(0, 0, 0)",
                        strokeWidth: parseInt(width),
                        strokeLinejoin: "round",
                        strokeLinecap: "round",
                        strokeDasharray: dashArray
                    }}
                    markerStart={arrowStart}
                    markerEnd={arrowEnd}
                />

            </svg>

        );
    }

    // export function makeArrow() {
    //     return (
    //         InkOptionsMenu.Instance.getColors().map(color => {
    //             const id1 = "arrowHeadTest" + color;
    //             console.log(color);
    //             <marker id={id1} orient="auto" overflow="visible" refX="0" refY="1" markerWidth="10" markerHeight="7">
    //                 <polygon points="0 0, 3 1, 0 2" fill={"#" + color} />
    //             </marker>;
    //         })
    //     );
    // }

    export function makePolygon(shape: string, points: { X: number, Y: number }[]) {
        if (points.length > 1 && points[points.length - 1].X === points[0].X && points[points.length - 1].Y + 1 === points[0].Y) {
            //pointer is up (first and last points are the same)
            if (shape === "arrow" || shape === "line") {
                //if arrow or line, the two end points should be the starting and the ending point
                var left = points[0].X;
                var top = points[0].Y;
                var right = points[1].X;
                var bottom = points[1].Y;
            } else {
                //otherwise take max and min
                const xs = points.map(p => p.X);
                const ys = points.map(p => p.Y);
                right = Math.max(...xs);
                left = Math.min(...xs);
                bottom = Math.max(...ys);
                top = Math.min(...ys);
            }
        } else {
            //if in the middle of drawing
            //take first and last points
            right = points[points.length - 1].X;
            left = points[0].X;
            bottom = points[points.length - 1].Y;
            top = points[0].Y;
            if (shape !== "arrow" && shape !== "line") {
                //switch left/right and top/bottom if needed
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
        points = [];
        switch (shape) {
            case "rectangle":
                points.push({ X: left, Y: top });
                points.push({ X: right, Y: top });
                points.push({ X: right, Y: bottom });
                points.push({ X: left, Y: bottom });
                points.push({ X: left, Y: top });
                return points;
            case "triangle":
                points.push({ X: left, Y: bottom });
                points.push({ X: right, Y: bottom });
                points.push({ X: (right + left) / 2, Y: top });
                points.push({ X: left, Y: bottom });
                return points;
            case "circle":
                const centerX = (right + left) / 2;
                const centerY = (bottom + top) / 2;
                const radius = bottom - centerY;
                for (var y = top; y < bottom; y++) {
                    const x = Math.sqrt(Math.pow(radius, 2) - (Math.pow((y - centerY), 2))) + centerX;
                    points.push({ X: x, Y: y });
                }
                for (var y = bottom; y > top; y--) {
                    const x = Math.sqrt(Math.pow(radius, 2) - (Math.pow((y - centerY), 2))) + centerX;
                    const newX = centerX - (x - centerX);
                    points.push({ X: newX, Y: y });
                }
                points.push({ X: Math.sqrt(Math.pow(radius, 2) - (Math.pow((top - centerY), 2))) + centerX, Y: top });
                return points;
            // case "arrow":
            //     const x1 = left;
            //     const y1 = top;
            //     const x2 = right;
            //     const y2 = bottom;
            //     const L1 = Math.sqrt(Math.pow(Math.abs(x1 - x2), 2) + (Math.pow(Math.abs(y1 - y2), 2)));
            //     const L2 = L1 / 5;
            //     const angle = 0.785398;
            //     const x3 = x2 + (L2 / L1) * ((x1 - x2) * Math.cos(angle) + (y1 - y2) * Math.sin(angle));
            //     const y3 = y2 + (L2 / L1) * ((y1 - y2) * Math.cos(angle) - (x1 - x2) * Math.sin(angle));
            //     const x4 = x2 + (L2 / L1) * ((x1 - x2) * Math.cos(angle) - (y1 - y2) * Math.sin(angle));
            //     const y4 = y2 + (L2 / L1) * ((y1 - y2) * Math.cos(angle) + (x1 - x2) * Math.sin(angle));
            //     points.push({ X: x1, Y: y1 });
            //     points.push({ X: x2, Y: y2 });
            //     points.push({ X: x3, Y: y3 });
            //     points.push({ X: x4, Y: y4 });
            //     points.push({ X: x2, Y: y2 });
            //     return points;
            case "line":
                points.push({ X: left, Y: top });
                points.push({ X: right, Y: bottom });
                return points;
            default:
                return points;
        }
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