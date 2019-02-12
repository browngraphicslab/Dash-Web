import { Field, Cast, Opt, FieldWaiting, FIELD_ID, FieldValue } from "./Field"
import { Key, KeyStore } from "./Key"
import { NumberField } from "./NumberField";
import { ObservableMap, computed, action, observable } from "mobx";
import { TextField } from "./TextField";
import { ListField } from "./ListField";
import { findDOMNode } from "react-dom";
import { Server } from "../client/Server";
import { Types } from "../server/Message";

export class Document extends Field {
    public fields: ObservableMap<Key, Opt<Field>> = new ObservableMap();
    public _proxies: ObservableMap<Key, FIELD_ID> = new ObservableMap();

    @computed
    public get Title() {
        return this.GetText(KeyStore.Title, "<untitled>");
    }

    Get(key: Key, ignoreProto: boolean = false): FieldValue<Field> {
        let field: FieldValue<Field>;
        if (ignoreProto) {
            if (this.fields.has(key)) {
                field = this.fields.get(key);
            } else if (this._proxies.has(key)) {
                field = Server.GetDocumentField(this, key);
            }
        } else {
            let doc: FieldValue<Document> = this;
            while (doc && doc != FieldWaiting && field != FieldWaiting) {
                if (!doc.fields.has(key)) {
                    if (doc._proxies.has(key)) {
                        field = Server.GetDocumentField(doc, key);
                        break;
                    }
                    if ((doc.fields.has(KeyStore.Prototype) || doc._proxies.has(KeyStore.Prototype))) {
                        doc = doc.GetPrototype();
                    } else
                        break;
                } else {
                    field = doc.fields.get(key);
                    break;
                }
            }
        }

        return field;
    }

    GetT<T extends Field = Field>(key: Key, ctor: { new(...args: any[]): T }, ignoreProto: boolean = false): FieldValue<T> {
        var getfield = this.Get(key, ignoreProto);
        if (getfield != FieldWaiting) {
            return Cast(getfield, ctor);
        }
        return FieldWaiting;
    }

    GetOrCreate<T extends Field>(key: Key, ctor: { new(): T }, ignoreProto: boolean = false): T {
        const field = this.GetT(key, ctor, ignoreProto);
        if (field && field != FieldWaiting) {
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

    @action
    Set(key: Key, field: Field | undefined): void {
        if (field) {
            this.fields.set(key, field);
            Server.AddDocumentField(this, key, field);
        } else {
            this.fields.delete(key);
            Server.DeleteDocumentField(this, key);
        }
    }

    @action
    SetData<T, U extends Field & { Data: T }>(key: Key, value: T, ctor: { new(): U }, replaceWrongType = true) {

        let field = this.Get(key, true);
        //if (field != WAITING) {  // do we want to wait for the field to come back from the server to set it, or do we overwrite?
        if (field instanceof ctor) {
            field.Data = value;
            Server.SetFieldValue(field, value);
        } else if (!field || replaceWrongType) {
            let newField = new ctor();
            newField.Data = value;
            this.Set(key, newField);
        }
        //}
    }

    @action
    SetText(key: Key, value: string, replaceWrongType = true) {
        this.SetData(key, value, TextField, replaceWrongType);
    }

    @action
    SetNumber(key: Key, value: number, replaceWrongType = true) {
        this.SetData(key, value, NumberField, replaceWrongType);
    }

    GetPrototype(): FieldValue<Document> {
        return this.GetT(KeyStore.Prototype, Document, true);
    }

    GetAllPrototypes(): Document[] {
        let protos: Document[] = [];
        let doc: FieldValue<Document> = this;
        while (doc && doc != FieldWaiting) {
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

    ToScriptString(): string {
        return "";
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

    ToJson(): { type: Types, data: [string, string][], id: string } {
        let fields: [string, string][] = []
        this._proxies.forEach((field, key) => {
            if (field) {
                fields.push([key.Name, field as string])
            }
        });

        return {
            type: Types.Document,
            data: fields,
            id: this.Id as string
        }
    }

}