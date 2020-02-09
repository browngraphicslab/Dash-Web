import { NDollarRecognizer } from "./ndollar";
import { Type } from "typescript";
import { InkField, PointData } from "../new_fields/InkField";
import { Docs } from "../client/documents/Documents";
import { Doc, WidthSym, HeightSym } from "../new_fields/Doc";
import { NumCast } from "../new_fields/Types";
import { CollectionFreeFormView } from "../client/views/collections/collectionFreeForm/CollectionFreeFormView";
import { Rect } from "react-measure";
import { Scripting } from "../client/util/Scripting";

export namespace GestureUtils {
    export class GestureEvent {
        constructor(
            readonly gesture: Gestures,
            readonly points: PointData[],
            readonly bounds: Rect,
            readonly callbackFn?: Function,
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
        Text = "text"
    }

    export const GestureRecognizer = new NDollarRecognizer(false);

    export function GestureOptions(name: string, gestureData?: any): (params: {}) => any {
        switch (name) {
            case Gestures.Box:
                break;
        }
        throw new Error("This means that you're trying to do something with the gesture that hasn't been defined yet. Define it in GestureUtils.ts");
    }
}