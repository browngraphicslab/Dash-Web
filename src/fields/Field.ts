
import { Utils } from "../Utils";

export function Cast<T extends Field>(field: FieldValue<Field>, ctor: { new(): T }): Opt<T> {
    if (field) {
        if (ctor && field instanceof ctor) {
            return field;
        }
    }
    return undefined;
}

export let FieldWaiting: FIELD_WAITING = "<Waiting>";
export type FIELD_WAITING = "<Waiting>";
export type FIELD_ID = string | undefined;
export type DOC_ID = FIELD_ID;
export type Opt<T> = T | undefined;
export type FieldValue<T> = Opt<T> | FIELD_WAITING;

export abstract class Field {
    //FieldUpdated: TypedEvent<Opt<FieldUpdatedArgs>> = new TypedEvent<Opt<FieldUpdatedArgs>>();

    private id: FIELD_ID;
    get Id(): FIELD_ID {
        return this.id;
    }

    constructor(id: FIELD_ID = undefined) {
        this.id = id || Utils.GenerateGuid();
    }

    Dereference(): FieldValue<Field> {
        return this;
    }
    DereferenceToRoot(): FieldValue<Field> {
        return this;
    }

    DereferenceT<T extends Field = Field>(ctor: { new(): T }): FieldValue<T> {
        return Cast(this.Dereference(), ctor);
    }

    DereferenceToRootT<T extends Field = Field>(ctor: { new(): T }): FieldValue<T> {
        return Cast(this.DereferenceToRoot(), ctor);
    }

    Equals(other: Field): boolean {
        return this.id === other.id;
    }

    abstract ToScriptString(): string;

    abstract TrySetValue(value: any): boolean;

    abstract GetValue(): any;

    abstract Copy(): Field;

}