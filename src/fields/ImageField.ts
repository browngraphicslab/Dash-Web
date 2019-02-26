import { BasicField } from "./BasicField";
import { Field } from "./Field";
import {observable} from "mobx"

export class ImageField extends BasicField<URL> {
    constructor(data: URL | undefined = undefined) {
        super(data == undefined ? new URL("http://cs.brown.edu/~bcz/face.gif") : data);
    }

    toString(): string {
        return this.Data.href;
    }

    Copy(): Field {
        return new ImageField(this.Data);
    }
}