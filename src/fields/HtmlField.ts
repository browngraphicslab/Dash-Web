import { BasicField } from "./BasicField";
import { Types } from "../server/Message";
import { FieldId } from "./Field";

export class HtmlField extends BasicField<string> {
    constructor(data: string = "<html></html>", id?: FieldId, save: boolean = true) {
        super(data, save, id);
    }

    ToScriptString(): string {
        return `new HtmlField("${this.Data}")`;
    }

    Copy() {
        return new HtmlField(this.Data);
    }

    ToJson(): { _id: string; type: Types; data: string; } {
        return {
            type: Types.Html,
            data: this.Data,
            _id: this.Id,
        };
    }
}