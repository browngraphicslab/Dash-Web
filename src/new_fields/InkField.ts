import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom, createSimpleSchema, list, object, map } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString } from "./FieldSymbols";

export enum InkTool {
    None,
    Pen,
    Highlighter,
    Eraser,
    Scrubber
}

export interface PointData {
    X: number;
    Y: number;
}

export type InkData = Array<PointData>;

const pointSchema = createSimpleSchema({
    X: true, Y: true
});

const strokeDataSchema = createSimpleSchema({
    pathData: list(object(pointSchema)),
    "*": true
});

@Deserializable("ink")
export class InkField extends ObjectField {
    @serializable(list(object(strokeDataSchema)))
    readonly inkData: InkData;

    constructor(data: InkData) {
        super();
        this.inkData = data;
    }

    [Copy]() {
        return new InkField(this.inkData);
    }

    [ToScriptString]() {
        return "invalid";
    }
}
