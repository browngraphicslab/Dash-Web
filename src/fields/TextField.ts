import { BasicField } from "./BasicField"
import { FIELD_ID } from "./Field";
import { Types } from "../server/Message";

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

    ToJson(): { type: Types, data: string, id: string } {
        return {
            type: Types.Text,
            data: this.Data,
            id: this.Id as string
        }
    }
}
