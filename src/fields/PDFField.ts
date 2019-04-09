import { BasicField } from "./BasicField";
import { Field, FieldId } from "./Field";
import { observable } from "mobx";
import { Types } from "../server/Message";



export class PDFField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined, id?: FieldId, save: boolean = true) {
        super(data === undefined ? new URL("http://cs.brown.edu/~bcz/bob_fettucine.jpg") : data, save, id);
    }

    toString(): string {
        return this.Data.href;
    }

    Copy(): Field {
        return new PDFField(this.Data);
    }

    ToScriptString(): string {
        return `new PDFField("${this.Data}")`;
    }

    ToJson(): { type: Types, data: string, _id: string } {
        return {
            type: Types.PDF,
            data: this.Data.href,
            _id: this.Id
        };
    }

    @observable
    Page: Number = 1;

}