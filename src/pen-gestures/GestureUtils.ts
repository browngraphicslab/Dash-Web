import { NDollarRecognizer } from "./ndollar";
import { Type } from "typescript";
import { InkField } from "../new_fields/InkField";
import { Docs } from "../client/documents/Documents";
import { Doc, WidthSym, HeightSym } from "../new_fields/Doc";
import { NumCast } from "../new_fields/Types";
import { CollectionFreeFormView } from "../client/views/collections/collectionFreeForm/CollectionFreeFormView";

export namespace GestureUtils {
    namespace GestureDataTypes {
        export type BoxData = Array<Doc>;
    }

    export enum Gestures {
        Box = "box",
        Line = "line"
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