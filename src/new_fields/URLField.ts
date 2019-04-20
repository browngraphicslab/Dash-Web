import { Deserializable } from "../client/util/SerializationHelper";
import { serializable } from "serializr";
import { ObjectField } from "./Doc";

function url() {
    return {
        serializer: function (value: URL) {
            return value.href;
        },
        deserializer: function (jsonValue: string, done: (err: any, val: any) => void) {
            done(undefined, new URL(jsonValue));
        }
    };
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