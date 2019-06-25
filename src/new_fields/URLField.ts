import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom } from "serializr";
import { ObjectField } from "./ObjectField";
import { ToScriptString, Copy } from "./FieldSymbols";

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

export abstract class URLField extends ObjectField {
    @serializable(url())
    readonly url: URL;

    constructor(url: string);
    constructor(url: URL);
    constructor(url: URL | string) {
        super();
        if (typeof url === "string") {
            url = new URL(url);
        }
        this.url = url;
    }

    [ToScriptString]() {
        return `new ${this.constructor.name}("${this.url.href}")`;
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
@Deserializable("youtube") export class YoutubeField extends URLField { }