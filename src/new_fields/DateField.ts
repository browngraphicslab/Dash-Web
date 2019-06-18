import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, date } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString } from "./FieldSymbols";

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

    [ToScriptString]() {
        return `new DateField(new Date(${this.date.toISOString()}))`;
    }
}
