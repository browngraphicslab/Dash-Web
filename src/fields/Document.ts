import { Field, Cast, Opt } from "./Field"
import { Key, KeyStore } from "./Key"
import { NumberField } from "./NumberField";
import { ObservableMap, computed } from "mobx";
import { TextField } from "./TextField";
import { ListField } from "./ListField";

export class Document extends Field {
    private fields: ObservableMap<Key, Field> = new ObservableMap();

    static _untitledDocName = "<untitled>";
    @computed
    public get Title() {
        return this.GetData(KeyStore.Title, TextField, Document._untitledDocName);
    }

    Get(key: Key, ignoreProto: boolean = false): Opt<Field> {
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

    GetT<T extends Field = Field>(key: Key, ctor: { new(...args: any[]): T }, ignoreProto: boolean = false): Opt<T> {
        return Cast(this.Get(key, ignoreProto), ctor);
    }

    GetOrCreate<T extends Field>(key: Key, ctor: { new(): T }, ignoreProto: boolean = false): T {
        const field = this.GetT(key, ctor, ignoreProto);
        if (field) {
            return field;
        }
        const newField = new ctor();
        this.Set(key, newField);
        return newField;
    }

    GetData<T, U extends Field & { Data: T }>(key: Key, ctor: { new(): U }, defaultVal: T): T {
        let val = this.Get(key);
        let vval = (val && val instanceof ctor) ? val.Data : defaultVal;
        return vval;
    }

    GetNumber(key: Key, defaultVal: number): number {
        return this.GetData(key, NumberField, defaultVal);
    }

    GetText(key: Key, defaultVal: string): string {
        return this.GetData(key, TextField, defaultVal);
    }

    GetList<T extends Field>(key: Key, defaultVal: T[]): T[] {
        return this.GetData<T[], ListField<T>>(key, ListField, defaultVal)
    }

    Set(key: Key, field: Field | undefined): void {
        if (field) {
            this.fields.set(key, field);
        } else {
            this.fields.delete(key);
        }
    }

    SetData<T, U extends Field & { Data: T }>(key: Key, value: T, ctor: { new(): U }, replaceWrongType = true) {
        let field = this.Get(key, true);
        if (field instanceof ctor) {
            field.Data = value;
        } else if (!field || replaceWrongType) {
            let newField = new ctor();
            newField.Data = value;
            this.Set(key, newField);
        }
    }

    SetVal<T extends Field>(key: Key, value: any, ctor: { new(): T }, replaceWrongType = true): boolean {
        let field = this.Get(key, true);
        if (field != null) {
            return field.TrySetValue(value);
        } else if (field && replaceWrongType) {
            field = new ctor();
            if (field.TrySetValue(value)) {
                this.Set(key, field);
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    SetText(key: Key, value: string, replaceWrongType = true) {
        this.SetData(key, value, TextField, replaceWrongType);
    }

    SetNumber(key: Key, value: number, replaceWrongType = true) {
        this.SetData(key, value, NumberField, replaceWrongType);
    }

    GetPrototype(): Opt<Document> {
        return this.GetT(KeyStore.Prototype, Document, true);
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

        delegate.Set(KeyStore.Prototype, this);

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