import { Field, Cast, Opt } from "./Field"
import { Key, KeyStore } from "./Key"
import { ObservableMap } from "mobx";
import { NumberField } from "./NumberField";
import { TextField } from "./TextField";

export class Document extends Field {
    private fields: ObservableMap<Key, Field> = new ObservableMap();

    GetField(key: Key, ignoreProto: boolean = false): Opt<Field> {
        let field: Opt<Field>;
        if (ignoreProto) {
            if (this.fields.has(key)) {
                field = this.fields.get(key);
            }
        } else {
            let doc: Opt<Document> = this;
            while (doc && !(doc.fields.has(key))) {
                doc = doc.GetPrototype();
            }

            if (doc) {
                field = doc.fields.get(key);
            }
        }

        return field;
    }

    GetFieldT<T extends Field = Field>(key: Key, ctor: { new(): T }, ignoreProto: boolean = false): Opt<T> {
        return Cast(this.GetField(key, ignoreProto), ctor);
    }

    GetFieldOrCreate<T extends Field>(key: Key, ctor: { new(): T }, ignoreProto: boolean = false): T {
        const field = this.GetFieldT(key, ctor, ignoreProto);
        if (field) {
            return field;
        }
        const newField = new ctor();
        this.SetField(key, newField);
        return newField;
    }

    GetFieldValue<T, U extends { Data: T }>(key: Key, ctor: { new(): U }, defaultVal: T): T {
        let val = this.GetField(key);
        let vval = (val && val instanceof ctor) ? val.Data : defaultVal;
        return vval;
    }

    GetNumberValue(key: Key, defaultVal: number): number {
        return this.GetFieldValue(key, NumberField, defaultVal);
    }

    GetTextValue(key: Key, defaultVal: string): string {
        return this.GetFieldValue(key, TextField, defaultVal);
    }

    SetField(key: Key, field: Field | undefined): void {
        if (field) {
            this.fields.set(key, field);
        } else {
            this.fields.delete(key);
        }
    }

    SetFieldValue<T extends Field>(key: Key, value: any, ctor: { new(): T }): boolean {
        let field = this.GetField(key, true);
        if (field != null) {
            return field.TrySetValue(value);
        } else {
            field = new ctor();
            if (field.TrySetValue(value)) {
                this.SetField(key, field);
                return true;
            } else {
                return false;
            }
        }
    }

    GetPrototype(): Opt<Document> {
        return this.GetFieldT(KeyStore.Prototype, Document, true);
    }

    GetAllPrototypes(): Document[] {
        let protos: Document[] = [];
        let doc: Opt<Document> = this;
        while (doc != null) {
            protos.push(doc);
            doc = doc.GetPrototype();
        }
        return protos;
    }

    MakeDelegate(): Document {
        let delegate = new Document();

        delegate.SetField(KeyStore.Prototype, this);

        return delegate;
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