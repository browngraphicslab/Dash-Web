import { Rect } from "react-measure";
import { PointData } from "../fields/InkField";
import { NDollarRecognizer } from "./ndollar";

export namespace GestureUtils {
    export class GestureEvent {
        constructor(
            readonly gesture: Gestures,
            readonly points: PointData[],
            readonly bounds: Rect,
            readonly text?: any
        ) { }
    }

    export interface GestureEventDisposer { (): void; }

    export function MakeGestureTarget(
        element: HTMLElement,
        func: (e: Event, ge: GestureEvent) => void
    ): GestureEventDisposer {
        const handler = (e: Event) => func(e, (e as CustomEvent<GestureEvent>).detail);
        element.addEventListener("dashOnGesture", handler);
        return () => {
            element.removeEventListener("dashOnGesture", handler);
        };
    }

    export enum Gestures {
        Box = "box",
        Line = "line",
        StartBracket = "startbracket",
        EndBracket = "endbracket",
        Stroke = "stroke",
        Scribble = "scribble",
        Text = "text",
        Triangle = "triangle",
        Circle = "circle",
        Rectangle = "rectangle",
    }

    export const GestureRecognizer = new NDollarRecognizer(false);
}