import { BasicField } from "./BasicField";
import { FieldId } from "./Field";
import { Types } from "../server/Message";

export class IconField extends BasicField<string> {
    constructor(data: string = "", id?: FieldId, save: boolean = true) {
        super(data, save, id);
    }

    ToScriptString(): string {
        return `new IconField("${this.Data}")`;
    }

    Copy() {
        return new IconField(this.Data);
    }

    ToJson() {
        return {
            type: Types.Icon,
            data: this.Data,
            id: this.Id
        };
    }
}