import { Field, FIELD_ID } from "./Field";
import { BasicField } from "./BasicField";
import { Types } from "../server/Message";
import { ObjectId } from "bson";

export class ListField<T extends Field> extends BasicField<T[]> {
    constructor(data: T[] = [], id: FIELD_ID = undefined) {
        super(data.slice(), id);
    }

    ToScriptString(): string {
        return "new ListField([" + this.Data.map(field => field.ToScriptString()).join(", ") + "])";
    }

    Copy(): Field {
        return new ListField<T>(this.Data);
    }

    ToJson(): { type: Types, data: T[], _id: ObjectId } {
        return {
            type: Types.List,
            data: this.Data,
            _id: new ObjectId(this.Id)
        }
    }
}