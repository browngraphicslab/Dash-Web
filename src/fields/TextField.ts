import { BasicField } from "./BasicField"
import { FIELD_ID } from "./Field";
import { Types } from "../server/Message";
import { ObjectID } from "bson";

export class TextField extends BasicField<string> {
    constructor(data: string = "", id: FIELD_ID = undefined) {
        super(data, id);
    }

    ToScriptString(): string {
        return `new TextField("${this.Data}")`;
    }

    Copy() {
        return new TextField(this.Data);
    }

    ToJson(): { type: Types, data: string, _id: ObjectID } {
        return {
            type: Types.Text,
            data: this.Data,
            _id: new ObjectID(this.Id)
        }
    }
}
