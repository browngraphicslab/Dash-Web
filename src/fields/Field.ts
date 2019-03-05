
import { Utils } from "../Utils";
import { Types } from "../server/Message";
import { computed } from "mobx";

export function Cast<T extends Field>(field: FieldValue<Field>, ctor: { new(): T }): Opt<T> {
    if (field) {
        if (ctor && field instanceof ctor) {
            return field;
        }
    }
    return undefined;
}

export const FieldWaiting: FIELD_WAITING = "<Waiting>";
export type FIELD_WAITING = "<Waiting>";
export type FieldId = string;
export type Opt<T> = T | undefined;
export type FieldValue<T> = Opt<T> | FIELD_WAITING;

export abstract class Field {
    //FieldUpdated: TypedEvent<Opt<FieldUpdatedArgs>> = new TypedEvent<Opt<FieldUpdatedArgs>>();

    init(callback: (res: Field) => any) {
        callback(this);
    }

    private id: FieldId;

    @computed
    get Id(): FieldId {
        return this.id;
    }

    constructor(id: Opt<FieldId> = undefined) {
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

    abstract UpdateFromServer(serverData: any): void;

    abstract ToScriptString(): string;

    abstract TrySetValue(value: any): boolean;

    abstract GetValue(): any;

    abstract Copy(): Field;

    abstract ToJson(): { _id: string, type: Types, data: any }
}