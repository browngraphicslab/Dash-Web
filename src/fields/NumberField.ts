import { BasicField } from "./BasicField"
import { Types } from "../server/Message";
import { FIELD_ID } from "./Field";
import { ObjectID } from "bson";

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

    ToJson(): { _id: ObjectID, type: Types, data: number } {
        return {
            _id: new ObjectID(this.Id),
            type: Types.Number,
            data: this.Data
        }
    }
}