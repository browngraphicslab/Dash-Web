import { BasicField } from "./BasicField";
import { Types } from "../server/Message";
import { FieldId } from "./Field";

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
export type StrokeMap = Map<string, StrokeData>;

export class InkField extends BasicField<StrokeMap> {
    constructor(data: StrokeMap = new Map, id?: FieldId, save: boolean = true) {
        super(data, save, id);
    }

    ToScriptString(): string {
        return `new InkField("${this.Data}")`;
    }

    Copy() {
        return new InkField(this.Data);
    }

    ToJson(): { _id: string; type: Types; data: any; } {
        return {
            type: Types.Ink,
            data: this.Data,
            _id: this.Id,
        }
    }

    static FromJson(id: string, data: any): InkField {
        let map = new Map<string, StrokeData>();
        Object.keys(data).forEach(key => {
            map.set(key, data[key]);
        });
        return new InkField(map, id, false);
    }
}