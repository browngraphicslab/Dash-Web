import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, createSimpleSchema, primitive } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString, OnUpdate } from "./FieldSymbols";
import { scriptingGlobal, Scripting } from "../client/util/Scripting";
import { ColumnType } from "../client/views/collections/CollectionSchemaView";

export const PastelSchemaPalette = new Map<string, string>([
    ["pink1", "#FFB4E8"],
    ["pink2", "#ff9cee"],
    ["pink3", "#ffccf9"],
    ["pink4", "#fcc2ff"],
    ["pink5", "#f6a6ff"],
    ["purple1", "#b28dff"],
    ["purple2", "#c5a3ff"],
    ["purple3", "#d5aaff"],
    ["purple4", "#ecd4ff"],
    ["purple5", "#fb34ff"],
    ["purple6", "#dcd3ff"],
    ["purple7", "#a79aff"],
    ["purple8", "#b5b9ff"],
    ["purple9", "#97a2ff"],
    ["bluegreen1", "#afcbff"],
    ["bluegreen2", "#aff8db"],
    ["bluegreen3", "#c4faf8"],
    ["bluegreen4", "#85e3ff"],
    ["bluegreen5", "#ace7ff"],
    ["bluegreen6", "#6eb5ff"],
    ["bluegreen7", "#bffcc6"],
    ["bluegreen8", "#dbffd6"],
    ["yellow1", "#f3ffe3"],
    ["yellow2", "#e7ffac"],
    ["yellow3", "#ffffd1"],
    ["yellow4", "#fff5ba"],
    ["red1", "#ffc9de"],
    ["red2", "#ffabab"],
    ["red3", "#ffbebc"],
    ["red4", "#ffcbc1"],
]);

export const RandomPastel = () => Array.from(PastelSchemaPalette.values())[Math.floor(Math.random() * PastelSchemaPalette.size)];

@scriptingGlobal
@Deserializable("schemaheader")
export class SchemaHeaderField extends ObjectField {
    @serializable(primitive())
    heading: string;
    color: string;
    type: number;

    constructor(heading: string = "", color?: string, type?: ColumnType) {
        console.log("CREATING SCHEMA HEADER FIELD");
        super();

        this.heading = heading;
        this.color = color === "" || color === undefined ? RandomPastel() : color;
        if (type) {
            this.type = type;
        }
        else {
            this.type = 0;
        }
    }

    setHeading(heading: string) {
        this.heading = heading;
        this[OnUpdate]();
    }

    setColor(color: string) {
        this.color = color;
        this[OnUpdate]();
    }

    setType(type: ColumnType) {
        this.type = type;
        this[OnUpdate]();
    }

    [Copy]() {
        return new SchemaHeaderField(this.heading, this.color, this.type);
    }

    [ToScriptString]() {
        return `invalid`;
    }
}

