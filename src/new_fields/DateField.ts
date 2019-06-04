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

    [Copy]() {
        return new DateField(this.date);
    }

    [ToScriptString]() {
        return `new DateField(new Date(${this.date.toISOString()}))`;
    }
}
