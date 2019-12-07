import { NDollarRecognizer } from "./ndollar";
import { Type } from "typescript";
import { InkField } from "../new_fields/InkField";
import { Docs } from "../client/documents/Documents";
import { Doc } from "../new_fields/Doc";

export namespace GestureUtils {
    namespace GestureDataTypes {
        export type BoxData = Array<Doc>;
    }

    export enum Gestures {
        Box = "box"
    }

    export const GestureRecognizer = new NDollarRecognizer(false);

    export function GestureOptions(name: Gestures, gestureData: any): (() => any)[] {
        switch (name) {
            case Gestures.Box:
                if (gestureData as GestureDataTypes.BoxData) {
                    return BoxOptions(gestureData as GestureDataTypes.BoxData);
                }
                break;
        }
        throw new Error("This means that you're trying to do something with the gesture that hasn't been defined yet. Define it in GestureUtils.ts");
    }

    function BoxOptions(gestureData: GestureDataTypes.BoxData): (() => any)[] {
        if (gestureData instanceof Array) {
            return [() => Docs.Create.FreeformDocument(gestureData as Doc[], {})];
        }
        return [];
    }
}