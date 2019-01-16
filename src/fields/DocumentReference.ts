import { Field, Opt } from "./Field";
import { Document } from "./Document";
import { Key } from "./Key";
import { DocumentUpdatedArgs } from "./FieldUpdatedArgs";

export class DocumentReference extends Field {
    get Key(): Key{
        return this.key;
    }

    get Document(): Document {
        return this.document;
    }

    constructor(private document: Document, private key: Key) {
        super();
    }

    private DocFieldUpdated(args: DocumentUpdatedArgs):void{
        // this.FieldUpdated.emit(args.fieldArgs);
    }

    Dereference() : Opt<Field> {
        return this.document.GetField(this.key);
    }

    DereferenceToRoot(): Opt<Field> {
        let field: Opt<Field> = this;
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


}