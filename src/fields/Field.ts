
import { Utils } from "../Utils";

export function Cast<T extends Field>(field: Opt<Field>, ctor: { new(): T }): Opt<T> {
    if (field) {
        if (ctor && field instanceof ctor) {
            return field;
        }
    }
    return undefined;
}

export type Waiting = "<Waiting>";
export type Opt<T> = T | undefined | Waiting;
export let WAITING: Waiting = "<Waiting>";

export abstract class Field {
    //FieldUpdated: TypedEvent<Opt<FieldUpdatedArgs>> = new TypedEvent<Opt<FieldUpdatedArgs>>();

    private id: string;
    get Id(): string {
        return this.id;
    }

    constructor(id: Opt<string> = undefined) {
        this.id = id || Utils.GenerateGuid();
    }

    Dereference(): Opt<Field> {
        return this;
    }
    DereferenceToRoot(): Opt<Field> {
        return this;
    }

    DereferenceT<T extends Field = Field>(ctor: { new(): T }): Opt<T> {
        return Cast(this.Dereference(), ctor);
    }

    DereferenceToRootT<T extends Field = Field>(ctor: { new(): T }): Opt<T> {
        return Cast(this.DereferenceToRoot(), ctor);
    }

    Equals(other: Field): boolean {
        return this.id === other.id;
    }

    abstract TrySetValue(value: any): boolean;

    abstract GetValue(): any;

    abstract Copy(): Field;

}