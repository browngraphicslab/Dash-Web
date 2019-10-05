import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom, createSimpleSchema, list, object, map } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString } from "./FieldSymbols";
import { DeepCopy } from "../Utils";

export enum InkTool {
    None,
    Pen,
    Highlighter,
    Eraser
}

export interface StrokeData {
    pathData: Array<{ x: number, y: number }>;
    color: string;
    width: string;
    tool: InkTool;
    displayTimecode: number;
}

export type InkData = Map<string, StrokeData>;

const pointSchema = createSimpleSchema({
    x: true, y: true
});

const strokeDataSchema = createSimpleSchema({
    pathData: list(object(pointSchema)),
    "*": true
});

@Deserializable("ink")
export class InkField extends ObjectField {
    @serializable(map(object(strokeDataSchema)))
    readonly inkData: InkData;

    constructor(data?: InkData) {
        super();
        this.inkData = data || new Map;
    }

    [Copy]() {
        return new InkField(DeepCopy(this.inkData));
    }

    [ToScriptString]() {
        return "invalid";
    }
}
