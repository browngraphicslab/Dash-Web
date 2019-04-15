import { BasicField } from "./BasicField";
import { Field, FieldId } from "./Field";
import { Types } from "../server/Message";

export class AudioField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined, id?: FieldId, save: boolean = true) {
        super(data === undefined ? new URL("http://techslides.com/demos/samples/sample.mp3") : data, save, id);
    }

    toString(): string {
        return this.Data.href;
    }


    ToScriptString(): string {
        return `new AudioField("${this.Data}")`;
    }

    Copy(): Field {
        return new AudioField(this.Data);
    }

    ToJson() {
        return {
            type: Types.Audio,
            data: this.Data.href,
            id: this.Id
        };
    }

}