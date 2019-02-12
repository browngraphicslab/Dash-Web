import { BasicField } from "./BasicField";

export class RichTextField extends BasicField<string> {
    constructor(data: string = "") {
        super(data);
    }

    ToScriptString(): string {
        return `new RichTextField(${this.Data})`;
    }

    Copy() {
        return new RichTextField(this.Data);
    }

}