import { BasicField } from "./BasicField";
import { Types } from "../server/Message";
import { FIELD_ID } from "./Field";

export class RichTextField extends BasicField<string> {
    constructor(data: string = "", id: FIELD_ID = undefined, save: boolean = true) {
        super(data, save, id);
    }

    ToScriptString(): string {
        return `new RichTextField(${this.Data})`;
    }

    Copy() {
        return new RichTextField(this.Data);
    }

    ToJson(): { type: Types, data: string, _id: string } {
        return {
            type: Types.RichText,
            data: this.Data,
            _id: this.Id
        }
    }

}