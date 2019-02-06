import { BasicField } from "./BasicField";

export class RichTextField extends BasicField<string> {
    constructor(data: string = "") {
        super(data);
    }

    Copy() {
        return new RichTextField(this.Data);
    }

}