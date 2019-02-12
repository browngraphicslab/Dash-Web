import { Field, Opt, FieldValue } from "./Field";
import { Document } from "./Document";
import { Key } from "./Key";

export class DocumentReference extends Field {
    get Key(): Key {
        return this.key;
    }

    get Document(): Document {
        return this.document;
    }

    constructor(private document: Document, private key: Key) {
        super();
    }

    Dereference(): FieldValue<Field> {
        return this.document.Get(this.key);
    }

    DereferenceToRoot(): FieldValue<Field> {
        let field: FieldValue<Field> = this;
        while (field instanceof DocumentReference) {
            field = field.Dereference();
        }
        return field;
    }

    TrySetValue(value: any): boolean {
        throw new Error("Method not implemented.");
    }
    GetValue() {
        throw new Error("Method not implemented.");
    }
    Copy(): Field {
        throw new Error("Method not implemented.");
    }

    ToScriptString(): string {
        return "";
    }

}