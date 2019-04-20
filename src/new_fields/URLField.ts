import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom } from "serializr";
import { ObjectField } from "./Doc";

function url() {
    return custom(
        function (value: URL) {
            return value.href;
        },
        function (jsonValue: string) {
            return new URL(jsonValue);
        }
    );
}

@Deserializable("url")
export class URLField extends ObjectField {
    @serializable(url())
    readonly url: URL;

    constructor(url: URL) {
        super();
        this.url = url;
    }
}