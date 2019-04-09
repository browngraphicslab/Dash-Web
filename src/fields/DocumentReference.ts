import { Field, Opt, FieldValue, FieldId } from "./Field";
import { Document } from "./Document";
import { Key } from "./Key";
import { Types } from "../server/Message";
import { ObjectID } from "bson";

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

    UpdateFromServer() {

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

    ToJson(): { type: Types, data: FieldId, _id: string } {
        return {
            type: Types.DocumentReference,
            data: this.document.Id,
            _id: this.Id
        };
    }
}