import { Field } from "./Field";
import { BasicField } from "./BasicField";

export class ListField<T extends Field> extends BasicField<T[]> {
    constructor(data: T[] = []) {
        super(data.slice());
    }

    Copy(): Field {
        return new ListField<T>(this.Data);
    }
}