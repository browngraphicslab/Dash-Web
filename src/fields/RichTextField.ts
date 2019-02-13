import { BasicField } from "./BasicField";
import { Types } from "../server/Message";
import { FIELD_ID } from "./Field";
import { ObjectID } from "bson";

export class RichTextField extends BasicField<string> {
    constructor(data: string = "", id: FIELD_ID = undefined) {
        super(data, id);
    }

    ToScriptString(): string {
        return `new RichTextField(${this.Data})`;
    }

    Copy() {
        return new RichTextField(this.Data);
    }

    ToJson(): { type: Types, data: string, _id: String } {
        return {
            type: Types.RichText,
            data: this.Data,
            _id: this.Id
        }
    }

}