import { BasicField } from "./BasicField"
import { Types } from "../server/Message";
import { FIELD_ID } from "./Field";

export class NumberField extends BasicField<number> {
    constructor(data: number = 0, id: FIELD_ID = undefined, save: boolean = true) {
        super(data, false, id);
    }

    ToScriptString(): string {
        return "new NumberField(this.Data)";
    }

    Copy() {
        return new NumberField(this.Data);
    }

    ToJson(): { _id: string, type: Types, data: number } {
        return {
            _id: this.Id,
            type: Types.Number,
            data: this.Data
        }
    }
}