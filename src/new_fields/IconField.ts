import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, primitive } from "serializr";
import { ObjectField } from "./ObjectField";

@Deserializable("icon")
export class IconField extends ObjectField {
    @serializable(primitive())
    readonly layout: string;

    constructor(layout: string) {
        super();
        this.layout = layout;
    }
}
