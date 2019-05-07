import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, date } from "serializr";
import { ObjectField, Copy } from "./ObjectField";

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
}
