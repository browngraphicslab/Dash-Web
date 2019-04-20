import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, primitive } from "serializr";
import { ObjectField } from "./Doc";

@Deserializable("html")
export class HtmlField extends ObjectField {
    @serializable(primitive())
    readonly html: string;

    constructor(html: string) {
        super();
        this.html = html;
    }
}
