import { ObjectField } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { Copy, ToScriptString } from "./FieldSymbols";

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

    [ToScriptString]() {
        return `new RichTextField("${this.Data}")`;
    }
}