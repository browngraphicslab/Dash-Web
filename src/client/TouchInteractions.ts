import ReactTable from "react-table";
import { Opt } from "../fields/Field";

export class TouchInteraction {
    private _id: string = "";
    constructor(name: string) {
        this._id = name
    }
}

export namespace TouchInteractions {
    export function TwoPointEuclidist(pt1: React.Touch, pt2: React.Touch): number {
        return Math.sqrt(Math.pow(pt1.clientX - pt2.clientX, 2) + Math.pow(pt1.clientY - pt2.clientY, 2))
    }

    /**
     * Returns the centroid of an n-arbitrary long list of points (takes the average the x and y components of each point)
     * @param pts - n-arbitrary long list of points
     */
    export function CenterPoint(pts: React.Touch[]): { X: number, Y: number } {
        let centerX = pts.map(pt => pt.clientX).reduce((a, b) => a + b, 0) / pts.length
        let centerY = pts.map(pt => pt.clientY).reduce((a, b) => a + b, 0) / pts.length
        return { X: centerX, Y: centerY }
    }

    /**
     * Returns -1 if pinching out, 0 if not pinching, and 1 if pinching in
     * @param pt1 - new point that corresponds to oldPoint1
     * @param pt2 - new point that corresponds to oldPoint2
     * @param oldPoint1 - previous point 1
     * @param oldPoint2 - previous point 2
     */
    export function Pinching(pt1: React.Touch, pt2: React.Touch, oldPoint1: React.Touch, oldPoint2: React.Touch): number {
        const leniency = 10
        let dist1 = TwoPointEuclidist(oldPoint1, pt1) + leniency
        let dist2 = TwoPointEuclidist(oldPoint2, pt2) + leniency

        if (Math.sign(dist1) === Math.sign(dist2)) {
            let oldDist = TwoPointEuclidist(oldPoint1, oldPoint2)
            let newDist = TwoPointEuclidist(pt1, pt2)
            return Math.sign(oldDist - newDist)
        }
        return 0
    }

    /**
     * Returns the type of Touch Interaction from a list of points.
     * Also returns any data that is associated with a Touch Interaction
     * @param pts - List of points
     */
    export function InterpretPointers(pts: React.Touch[]): { type: Opt<TouchInteraction>, data?: any } {
        const leniency = 200;
        switch (pts.length) {
            case 1:
                return { type: OneFinger }
            case 2:
                return { type: TwoSeperateFingers }
            case 3:
                let pt1 = pts[0]
                let pt2 = pts[1]
                let pt3 = pts[2]
                if (pt1 && pt2 && pt3) {
                    let dist12 = TwoPointEuclidist(pt1, pt2)
                    let dist23 = TwoPointEuclidist(pt2, pt3)
                    let dist13 = TwoPointEuclidist(pt1, pt3)
                    console.log(`distances: ${dist12}, ${dist23}, ${dist13}`)
                    let dist12close = dist12 < leniency
                    let dist23close = dist23 < leniency
                    let dist13close = dist13 < leniency
                    let xor2313 = dist23close ? !dist13close : dist13close
                    let xor = dist12close ? !xor2313 : xor2313
                    // three input xor because javascript doesn't have logical xor's
                    if (xor) {
                        let points: number[] = []
                        let min = Math.min(dist12, dist23, dist13)
                        switch (min) {
                            case dist12:
                                points = [0, 1, 2]
                                break;
                            case dist23:
                                points = [1, 2, 0]
                                break;
                            case dist13:
                                points = [0, 2, 1]
                                break;
                        }
                        return { type: TwoToOneFingers, data: points }
                    }
                    else {
                        return { type: ThreeSeperateFingers, data: null }
                    }
                }
            default:
                return { type: undefined }
        }
    }

    export function IsDragging(oldTouches: Map<number, React.Touch>, newTouches: TouchList, leniency: number): boolean {
        for (let i = 0; i < newTouches.length; i++) {
            let touch = newTouches.item(i)
            if (touch) {
                let oldTouch = oldTouches.get(touch.identifier)
                if (oldTouch) {
                    if (TwoPointEuclidist(touch, oldTouch) >= leniency) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    export const OneFinger = new TouchInteraction("One Finger")
    export const TwoSeperateFingers = new TouchInteraction("Two Seperate Finger")
    export const TwoToOneFingers = new TouchInteraction("Two-One Fingers")
    export const ThreeSeperateFingers = new TouchInteraction("Three Seperate Fingers")
}