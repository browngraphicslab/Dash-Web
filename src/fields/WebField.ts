import { BasicField } from "./BasicField";
import { Field } from "./Field";

export class WebField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined) {
        super(data == undefined ? new URL("https://cs.brown.edu/") : data);
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

}