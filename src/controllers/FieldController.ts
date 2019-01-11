import { TypedEvent } from "../util/TypedEvent";
import { FieldUpdatedArgs } from "./FieldUpdatedArgs";
import { DocumentReferenceController } from "./DocumentReferenceController";

export abstract class FieldController {
    Id: string;

    FieldUpdated: TypedEvent<FieldUpdatedArgs>;

    protected DereferenceImpl(): FieldController {
        return this;
    }
    protected DereferenceToRootImpl(): FieldController {
        let field = this;
        while(field instanceof DocumentReferenceController) {
            field = field.Dereference();
        }
        return field;
    }

    Dereference<T extends FieldController = FieldController>(ctor?: { new(): T }): T {
        let field = this.DereferenceImpl();
        if (ctor && field instanceof ctor) {
            return field;
        } else {
            return null;
        }
    }

    DereferenceToRoot<T extends FieldController = FieldController>(ctor?: { new(): T }): T {
        let field = this.DereferenceToRootImpl();
        if (ctor && field instanceof ctor) {
            return field;
        } else {
            return null;
        }
    }

    abstract TrySetValue(value: any): boolean;

    abstract GetValue(): any;

    abstract Copy(): FieldController;

}