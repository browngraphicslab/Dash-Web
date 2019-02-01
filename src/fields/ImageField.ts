import { BasicField } from "./BasicField";
import { Field } from "./Field";

export class ImageField extends BasicField<URL> {
    constructor(data: URL) {
        super(data);
    }

    toString(): string {
        return this.Data.href;
    }

    Copy(): Field {
        return new ImageField(this.Data);
    }

}