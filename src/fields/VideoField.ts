import { BasicField } from "./BasicField";
import { Field, FieldId } from "./Field";
import { Types } from "../server/Message";

export class VideoField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined, id?: FieldId, save: boolean = true) {
        super(data === undefined ? new URL("http://techslides.com/demos/sample-videos/small.mp4") : data, save, id);
    }

    toString(): string {
        return this.Data.href;
    }

    ToScriptString(): string {
        return `new VideoField("${this.Data}")`;
    }

    Copy(): Field {
        return new VideoField(this.Data);
    }

    ToJson(): { type: Types, data: string, _id: string } {
        return {
            type: Types.Video,
            data: this.Data.href,
            _id: this.Id
        };
    }

}