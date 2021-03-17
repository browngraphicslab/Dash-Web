import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, primitive } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString, ToString, OnUpdate } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";
import { ColumnType } from "../client/views/collections/CollectionSchemaView";

export const PastelSchemaPalette = new Map<string, string>([
    // ["pink1", "#FFB4E8"],
    ["pink2", "#ff9cee"],
    ["pink3", "#ffccf9"],
    ["pink4", "#fcc2ff"],
    ["pink5", "#f6a6ff"],
    ["purple1", "#b28dff"],
    ["purple2", "#c5a3ff"],
    ["purple3", "#d5aaff"],
    ["purple4", "#ecd4ff"],
    // ["purple5", "#fb34ff"],
    ["purple6", "#dcd3ff"],
    ["purple7", "#a79aff"],
    ["purple8", "#b5b9ff"],
    ["purple9", "#97a2ff"],
    ["bluegreen1", "#afcbff"],
    ["bluegreen2", "#aff8db"],
    ["bluegreen3", "#c4faf8"],
    ["bluegreen4", "#85e3ff"],
    ["bluegreen5", "#ace7ff"],
    // ["bluegreen6", "#6eb5ff"],
    ["bluegreen7", "#bffcc6"],
    ["bluegreen8", "#dbffd6"],
    ["yellow1", "#f3ffe3"],
    ["yellow2", "#e7ffac"],
    ["yellow3", "#ffffd1"],
    ["yellow4", "#fff5ba"],
    // ["red1", "#ffc9de"],
    ["red2", "#ffabab"],
    ["red3", "#ffbebc"],
    ["red4", "#ffcbc1"],
    ["orange1", "#ffd5b3"],
    ["gray", "#f1efeb"]
]);

export const RandomPastel = () => Array.from(PastelSchemaPalette.values())[Math.floor(Math.random() * PastelSchemaPalette.size)];

export const DarkPastelSchemaPalette = new Map<string, string>([
    ["pink2", "#c932b0"],
    ["purple4", "#913ad6"],
    ["bluegreen1", "#3978ed"],
    ["bluegreen7", "#2adb3e"],
    ["bluegreen5", "#21b0eb"],
    ["yellow4", "#edcc0c"],
    ["red2", "#eb3636"],
    ["orange1", "#f2740f"],
]);

@scriptingGlobal
@Deserializable("schemaheader")
export class SchemaHeaderField extends ObjectField {
    @serializable(primitive())
    heading: string;
    @serializable(primitive())
    color: string;
    @serializable(primitive())
    type: number;
    @serializable(primitive())
    width: number;
    @serializable(primitive())
    collapsed: boolean | undefined;
    @serializable(primitive())
    desc: boolean | undefined; // boolean determines sort order, undefined when no sort

    constructor(heading: string = "", color: string = RandomPastel(), type?: ColumnType, width?: number, desc?: boolean, collapsed?: boolean) {
        super();

        this.heading = heading;
        this.color = color;
        this.type = type ? type : 0;
        this.width = width ? width : -1;
        this.desc = desc;
        this.collapsed = collapsed;
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

    setWidth(width: number) {
        this.width = width;
        this[OnUpdate]();
    }

    setDesc(desc: boolean | undefined) {
        this.desc = desc;
        this[OnUpdate]();
    }

    setCollapsed(collapsed: boolean | undefined) {
        this.collapsed = collapsed;
        this[OnUpdate]();
    }

    [Copy]() {
        return new SchemaHeaderField(this.heading, this.color, this.type);
    }

    [ToScriptString]() {
        return `header(${this.heading},${this.type}})`;
    }
    [ToString]() {
        return `SchemaHeaderField`;
    }
}