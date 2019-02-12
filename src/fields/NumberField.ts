import { BasicField } from "./BasicField"
import { Types } from "../server/Message";
import { FIELD_ID } from "./Field";

export class NumberField extends BasicField<number> {
    constructor(data: number = 0, id: FIELD_ID = undefined) {
        super(data, id);
    }

    ToScriptString(): string {
        return "new NumberField(this.Data)";
    }

    Copy() {
        return new NumberField(this.Data);
    }

    ToJson(): { id: string, type: Types, data: number } {
        return {
            id: this.Id as string,
            type: Types.Number,
            data: this.Data
        }
    }
}