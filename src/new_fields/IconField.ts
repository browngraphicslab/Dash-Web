import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, primitive } from "serializr";
import { ObjectField } from "./ObjectField";
import { Copy, ToScriptString, ToString } from "./FieldSymbols";

@Deserializable("icon")
export class IconField extends ObjectField {
    @serializable(primitive())
    readonly icon: string;

    constructor(icon: string) {
        super();
        this.icon = icon;
    }

    [Copy]() {
        return new IconField(this.icon);
    }

    [ToScriptString]() {
        return "invalid";
    }
    [ToString]() {
        return "ICONfield";
    }
}
