import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom } from "serializr";
import { ObjectField, Copy } from "./ObjectField";

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

export class URLField extends ObjectField {
    @serializable(url())
    readonly url: URL;

    constructor(url: URL) {
        super();
        this.url = url;
    }

    [Copy](): this {
        return new (this.constructor as any)(this.url);
    }
}

@Deserializable("audio") export class AudioField extends URLField { }
@Deserializable("image") export class ImageField extends URLField { }
@Deserializable("video") export class VideoField extends URLField { }
@Deserializable("pdf") export class PdfField extends URLField { }
@Deserializable("web") export class WebField extends URLField { }