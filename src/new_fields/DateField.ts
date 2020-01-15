import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, date } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString } from "./FieldSymbols";
import { scriptingGlobal, Scripting } from "../client/util/Scripting";

@scriptingGlobal
@Deserializable("date")
export class DateField extends ObjectField {
    @serializable(date())
    readonly date: Date;

    constructor(date: Date = new Date()) {
        super();
        this.date = date;
    }

    compare = (other: DateField): number => {
        return (other.date === this.date) ? 0 : ((other.date > this.date) ? 1 : -1);
    }

    [Copy]() {
        return new DateField(this.date);
    }

    toString() {
        return `${this.date.toISOString()}`;
    }

    [ToScriptString]() {
        return `new DateField(new Date(${this.date.toISOString()}))`;
    }
}

Scripting.addGlobal(function d(...dateArgs: any[]) {
    return new DateField(new (Date as any)(...dateArgs));
});
