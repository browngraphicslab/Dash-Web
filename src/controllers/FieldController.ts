import { TypedEvent } from "../util/TypedEvent";
import { FieldUpdatedArgs } from "./FieldUpdatedArgs";
import { DocumentReferenceController } from "./DocumentReferenceController";
import { Utils } from "../Utils";

export function Cast<T extends FieldController>(field: Opt<FieldController>, ctor: { new(): T }): Opt<T> {
    if (field) {
        if (ctor && field instanceof ctor) {
            return field;
        }
    }
    return undefined;
}

export type Opt<T> = T | undefined;

export abstract class FieldController {
    FieldUpdated: TypedEvent<Opt<FieldUpdatedArgs>> = new TypedEvent<Opt<FieldUpdatedArgs>>();

    private id: string;
    get Id(): string {
        return this.id;
    }

    constructor(id: Opt<string> = undefined) {
        this.id = id || Utils.GenerateGuid();
    }

    protected DereferenceImpl(): Opt<FieldController> {
        return this;
    }
    protected DereferenceToRootImpl(): Opt<FieldController> {
        return this;
    }

    Dereference<T extends FieldController = FieldController>(ctor?: { new(): T }): Opt<T> {
        let field = this.DereferenceImpl();
        if (ctor && field instanceof ctor) {
            return field;
        } else {
            return undefined;
        }
    }

    DereferenceToRoot<T extends FieldController = FieldController>(ctor?: { new(): T }): Opt<T> {
        let field = this.DereferenceToRootImpl();
        if (ctor && field instanceof ctor) {
            return field;
        } else {
            return undefined;
        }
    }

    Equals(other: FieldController) : boolean {
        return this.id === other.id;
    }

    abstract TrySetValue(value: any): boolean;

    abstract GetValue(): any;

    abstract Copy(): FieldController;

}