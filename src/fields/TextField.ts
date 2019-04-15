import { BasicField } from "./BasicField";
import { FieldId } from "./Field";
import { Types } from "../server/Message";

export class TextField extends BasicField<string> {
    constructor(data: string = "", id?: FieldId, save: boolean = true) {
        super(data, save, id);
    }

    ToScriptString(): string {
        return `new TextField("${this.Data}")`;
    }

    Copy() {
        return new TextField(this.Data);
    }

    ToJson() {
        return {
            type: Types.Text,
            data: this.Data,
            id: this.Id
        };
    }
}