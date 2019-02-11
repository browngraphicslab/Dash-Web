import { BasicField } from "./BasicField"

export class NumberField extends BasicField<number> {
    constructor(data: number = 0) {
        super(data);
    }

    ToScriptString(): string {
        return "new NumberField(this.Data)";
    }

    Copy() {
        return new NumberField(this.Data);
    }
}