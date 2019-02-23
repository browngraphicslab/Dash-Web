import { BasicField } from "./BasicField";
import { Field } from "./Field";

export class PDFField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined) {
        super(data == undefined ? new URL("") : data);
    }

    toString(): string {
        return this.Data.href;
    }

    Copy(): Field {
        return new PDFField(this.Data);
    }

}