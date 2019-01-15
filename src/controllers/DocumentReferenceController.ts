import { FieldController, Opt } from "./FieldController";
import { DocumentController } from "./DocumentController";
import { KeyController } from "./KeyController";
import { DocumentUpdatedArgs } from "./FieldUpdatedArgs";

export class DocumentReferenceController extends FieldController {
    get Key(): KeyController{
        return this.key;
    }

    get Document(): DocumentController {
        return this.document;
    }

    constructor(private document: DocumentController, private key: KeyController) {
        super();
    }

    private DocFieldUpdated(args: DocumentUpdatedArgs):void{
        // this.FieldUpdated.emit(args.fieldArgs);
    }

    Dereference() : Opt<FieldController> {
        return this.document.GetField(this.key);
    }

    DereferenceToRoot(): Opt<FieldController> {
        let field: Opt<FieldController> = this;
        while (field instanceof DocumentReferenceController) {
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
    Copy(): FieldController {
        throw new Error("Method not implemented.");
    }


}