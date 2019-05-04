import { ObjectField, Copy } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";

@Deserializable("RichTextField")
export class RichTextField extends ObjectField {
    @serializable(true)
    readonly Data: string;

    constructor(data: string) {
        super();
        this.Data = data;
    }

    [Copy]() {
        return new RichTextField(this.Data);
    }
}