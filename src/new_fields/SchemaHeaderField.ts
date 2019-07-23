import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, createSimpleSchema, primitive } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString, OnUpdate } from "./FieldSymbols";
import { scriptingGlobal, Scripting } from "../client/util/Scripting";

export const PastelSchemaPalette = new Map<string, string>([
    ["purple", "#f5b5fc"],
    ["green", "#96F7D2"],
    ["yellow", "#F0F696"],
    ["red", "#FCB1B1"]
])

@scriptingGlobal
@Deserializable("schemaheader")
export class SchemaHeaderField extends ObjectField {
    @serializable(primitive())
    heading: string;
    color: string;

    constructor(heading: string = "", color: string = Array.from(PastelSchemaPalette.values())[Math.floor(Math.random() * 4)]) {
        super();

        this.heading = heading;
        this.color = color;
    }

    setHeading(heading: string) {
        this.heading = heading;
        this[OnUpdate]();
    }

    setColor(color: string) {
        this.color = color;
        this[OnUpdate]();
    }

    [Copy]() {
        return new SchemaHeaderField(this.heading, this.color);
    }

    [ToScriptString]() {
        return `invalid`;
    }
}

