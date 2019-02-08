import { Field } from "./Field";
import { BasicField } from "./BasicField";

export class ListField<T extends Field> extends BasicField<T[]> {
    constructor(data: T[] = []) {
        super(data.slice());
    }

    ToScriptString(): string {
        return "new ListField([" + this.Data.map(field => field.ToScriptString()).join(", ") + "])";
    }

    Copy(): Field {
        return new ListField<T>(this.Data);
    }
}