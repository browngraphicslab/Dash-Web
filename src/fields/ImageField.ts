import { BasicField } from "./BasicField";
import { Field } from "./Field";

export class ImageField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined) {
        super(data == undefined ? new URL("http://cs.brown.edu/~bcz/face.gif") : data);
    }

    toString(): string {
        return this.Data.href;
    }

    ToScriptString(): string {
        return `new ImageField(${this.Data})`;
    }

    Copy(): Field {
        return new ImageField(this.Data);
    }

}