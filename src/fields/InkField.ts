import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom, createSimpleSchema, list, object, map } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString, ToString, Update } from "./FieldSymbols";
import { Scripting } from "../client/util/Scripting";

export enum InkTool {
    None = "none",
    Pen = "pen",
    Highlighter = "highlighter",
    Eraser = "eraser",
    Stamp = "stamp"
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
    // inkData: InkData;


    constructor(data: InkData) {
        super();
        this.inkData = data;
    }

    [Copy]() {
        return new InkField(this.inkData);
    }

    [ToScriptString]() {
        return "new InkField([" + this.inkData.map(i => `{X: ${i.X}, Y: ${i.Y}} `) + "])";
    }
    [ToString]() {
        return "InkField";
    }
}

Scripting.addGlobal("InkField", InkField);