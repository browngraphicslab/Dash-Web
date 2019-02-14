import { BasicField } from "./BasicField";
import { Field, FIELD_ID } from "./Field";
import { Types } from "../server/Message";
import { ObjectID } from "bson";

export class ImageField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined, id: FIELD_ID = undefined) {
        super(data == undefined ? new URL("http://cs.brown.edu/~bcz/bob_fettucine.jpg") : data, id);
    }

    toString(): string {
        return this.Data.href;
    }

    ToScriptString(): string {
        return `new ImageField("${this.Data}")`;
    }

    Copy(): Field {
        return new ImageField(this.Data);
    }

    ToJson(): { type: Types, data: URL, _id: string } {
        return {
            type: Types.Image,
            data: this.Data,
            _id: this.Id
        }
    }
}