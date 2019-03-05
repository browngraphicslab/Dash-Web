import { BasicField } from "./BasicField";
import { Field } from "./Field";
import { observable } from "mobx"
import { Types } from "../server/Message";



export class PDFField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined, save: boolean = true) {
        super(data || new URL("http://cs.brown.edu/~bcz/face.gif"), save);
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

    ToJson(): { type: Types, data: URL, _id: string } {
        return {
            type: Types.PDF,
            data: this.Data,
            _id: this.Id
        }
    }

    @observable
    Page: Number = 1;

}