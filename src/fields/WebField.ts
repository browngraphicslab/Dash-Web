import { BasicField } from "./BasicField";
import { Field, FieldId } from "./Field";
import { Types } from "../server/Message";

export class WebField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined, id?: FieldId, save: boolean = true) {
        super(data == undefined ? new URL("https://crossorigin.me/" + "https://cs.brown.edu/") : data, save, id);
    }

    toString(): string {
        return this.Data.href;
    }

    ToScriptString(): string {
        return `new WebField("${this.Data}")`;
    }

    Copy(): Field {
        return new WebField(this.Data);
    }

    ToJson(): { type: Types, data: URL, _id: string } {
        return {
            type: Types.Web,
            data: this.Data,
            _id: this.Id
        }
    }

}