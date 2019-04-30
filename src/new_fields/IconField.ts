import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, primitive } from "serializr";
import { ObjectField } from "./ObjectField";

@Deserializable("icon")
export class IconField extends ObjectField {
    @serializable(primitive())
    readonly icon: string;

    constructor(icon: string) {
        super();
        this.icon = icon;
    }
}
