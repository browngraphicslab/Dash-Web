import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom, createSimpleSchema, list, object, map } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString } from "./FieldSymbols";
import { DeepCopy } from "../Utils";

export enum InkTool {
    None,
    Pen,
    Highlighter,
    Eraser,
    Scrubber
}

export interface PointData {
    x: number;
    y: number;
}

export type InkData = Array<PointData>;

const pointSchema = createSimpleSchema({
    x: true, y: true
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
