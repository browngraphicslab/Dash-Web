import { ObjectField } from "./Doc";
import { serializable } from "serializr";

export class RichTextField extends ObjectField {
    @serializable(true)
    readonly Data: string;

    constructor(data: string) {
        super();
        this.Data = data;
    }
}