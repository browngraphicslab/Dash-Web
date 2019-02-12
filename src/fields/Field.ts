
import { Utils } from "../Utils";
import { Types } from "../server/Message";
import { NumberField } from "./NumberField";
import { TextField } from "./TextField";
import { RichTextField } from "./RichTextField";
import { KeyStore } from "./Key";
import { ImageField } from "./ImageField";
import { ListField } from "./ListField";
import { Document } from "./Document";
import { Server } from "../client/Server";

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

    abstract ToJson(): { id: string, type: Types, data: any }

    public static FromJson(obj: { id: string, type: number, data: any }): Field {
        let data: any = obj.data
        let id: string = obj.id

        switch (obj.type) {
            case Types.Number:
                return new NumberField(data, id)
            case Types.Text:
                return new TextField(data, id)
            case Types.RichText:
                return new RichTextField(data, id)
            case Types.Key:
                return KeyStore.Get(data)
            case Types.Image:
                return new ImageField(data, id)
            case Types.List:
                return new ListField(data, id)
            case Types.Document:
                let doc: Document = new Document(id)
                let fields: [string, string][] = data as [string, string][]
                fields.forEach(element => {
                    let keyName: string = element[0]
                    let valueId: string = element[1]
                    let key = KeyStore.Get(keyName)
                    Server.GetField(valueId, (field: Field) => {
                        doc.Set(key, field)
                    })
                });
                return doc
        }
        return new TextField(data, id)
    }
}