import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom, createSimpleSchema, list, object, map } from "serializr";
import { ObjectField, Copy } from "./ObjectField";
import { number } from "prop-types";
import { any } from "bluebird";
import { deepCopy } from "../Utils";

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
    page: number;
}

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
    readonly inkData: Map<string, StrokeData>;

    constructor(data?: Map<string, StrokeData>) {
        super();
        this.inkData = data || new Map;
    }

    [Copy]() {
        return new InkField(deepCopy(this.inkData))
    }
}
