import { BasicField } from "./BasicField";
import { Field } from "./Field";

export class RichTextField extends BasicField<string> {
    constructor(data: string = "") {
        super(data);
    }

    Copy(): Field {
        return new RichTextField(this.Data);
    }

}