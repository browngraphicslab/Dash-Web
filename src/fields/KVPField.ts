import { BasicField } from "./BasicField"
import { FieldId } from "./Field";
import { Types } from "../server/Message";
import { Document } from "./Document"

export class KVPField extends BasicField<Document> {
    constructor(data: Document | undefined = undefined, id?: FieldId, save: boolean = true) {
        super(data == undefined ? new Document() : data, save, id);
    }

    toString(): string {
        return this.Data.Title;
    }

    ToScriptString(): string {
        return `new KVPField("${this.Data}")`;
    }

    Copy() {
        return new KVPField(this.Data);
    }

    ToJson(): { type: Types, data: Document, _id: string } {
        return {
            type: Types.Text,
            data: this.Data,
            _id: this.Id
        }
    }
}