import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, custom } from "serializr";
import { ObjectField } from "./ObjectField";
import { ToScriptString, ToString, Copy } from "./FieldSymbols";
import { Scripting, scriptingGlobal } from "../client/util/Scripting";

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
    [ToString]() {
        return this.url.href;
    }

    [Copy](): this {
        return new (this.constructor as any)(this.url);
    }
}

export const nullAudio = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";

@scriptingGlobal @Deserializable("audio") export class AudioField extends URLField { }
@scriptingGlobal @Deserializable("image") export class ImageField extends URLField { }
@scriptingGlobal @Deserializable("video") export class VideoField extends URLField { }
@scriptingGlobal @Deserializable("pdf") export class PdfField extends URLField { }
@scriptingGlobal @Deserializable("web") export class WebField extends URLField { }
@scriptingGlobal @Deserializable("youtube") export class YoutubeField extends URLField { }
