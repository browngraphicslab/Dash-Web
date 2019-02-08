import { BasicField } from "./BasicField"

export class TextField extends BasicField<string> {
    constructor(data: string = "") {
        super(data);
    }

    ToScriptString(): string {
        return `new TextField("${this.Data}")`;
    }

    Copy() {
        return new TextField(this.Data);
    }
}
