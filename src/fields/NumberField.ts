import { BasicField } from "./BasicField"

export class NumberField extends BasicField<number> {
    constructor(data: number = 0) {
        super(data);
    }

    Copy() {
        return new NumberField(this.Data);
    }
}