import { Field, Cast, Opt, Waiting, WAITING } from "./Field"
import { Key, KeyStore } from "./Key"
import { NumberField } from "./NumberField";
import { ObservableMap, computed, action } from "mobx";
import { TextField } from "./TextField";
import { ListField } from "./ListField";

export class Document extends Field {
    private fields: ObservableMap<Key, Opt<Field>> = new ObservableMap();
    private _sfields: ObservableMap<Key, Field> = new ObservableMap();

    static _untitledDocName = "<untitled>";
    @computed
    public get Title() { return this.GetFieldValue(KeyStore.Title, TextField, Document._untitledDocName); }

    @action
    DeferredSetField(key: Key) {
        var sfield = this._sfields.get(key);
        if (sfield != undefined)
            this.fields.set(key, sfield);
    }

    static times = 0;
    GetFieldFromServerDeferred(key: Key) {
        var me = this;
        setTimeout(function () {
            if (me) {
                me.DeferredSetField(key);
            }
        }, key == KeyStore.Data ? (Document.times++ == 0 ? 5000 : 1000) : key == KeyStore.X ? 2500 : 500)
    }

    GetField(key: Key, ignoreProto: boolean = false): Opt<Field> {
        let field: Opt<Field> = WAITING;
        if (ignoreProto) {
            if (this.fields.has(key)) {
                field = this.fields.get(key);
            } else {
                this.GetFieldFromServerDeferred(key); // bcz: only want to do this if the field is on the server
            }
        } else {
            let doc: Opt<Document> = this;
            while (doc && doc != WAITING) {
                if (!doc.fields.has(key)) {
                    doc.GetFieldFromServerDeferred(key); // bcz: only want to do this if the field is on the server
                    doc = doc.GetPrototype();
                } else {
                    field = doc.fields.get(key);
                    break;
                }
            }
        }

        return field;
    }

    GetFieldT<T extends Field = Field>(key: Key, ctor: { new(...args: any[]): T }, ignoreProto: boolean = false): Opt<T> {
        var getfield = this.GetField(key, ignoreProto);
        if (getfield != WAITING) {
            return Cast(getfield, ctor);
        }
        return WAITING;
    }

    GetFieldOrCreate<T extends Field>(key: Key, ctor: { new(): T }, ignoreProto: boolean = false): T {
        const field = this.GetFieldT(key, ctor, ignoreProto);
        if (field && field != WAITING) {
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

    GetNumberField(key: Key, defaultVal: number): number {
        return this.GetFieldValue(key, NumberField, defaultVal);
    }

    GetTextField(key: Key, defaultVal: string): string {
        return this.GetFieldValue(key, TextField, defaultVal);
    }

    GetListField<T extends Field>(key: Key, defaultVal: T[]): T[] {
        return this.GetFieldValue<T[], ListField<T>>(key, ListField, defaultVal)
    }

    @action
    SetField(key: Key, field: Field | undefined): void {
        if (field) {
            this.fields.set(key, field);
        } else {
            this.fields.delete(key);
        }
    }

    @action
    SetFieldValue<T extends Field>(key: Key, value: any, ctor: { new(): T }): boolean {
        let field = new ctor();
        if (field.TrySetValue(value)) {
            this._sfields.set(key, field);
            return true;
        }
        return false;

        // let field = this.GetField(key, true);
        // if (field != WAITING) {
        //     if (field) {
        //         return field.TrySetValue(value);
        //     } else {
        //         field = new ctor();
        //         if (field.TrySetValue(value)) {
        //             this.SetField(key, field);
        //             return true;
        //         } 
        //     }
        // }
        // return false;
    }

    GetPrototype(): Opt<Document> {
        return this.GetFieldT(KeyStore.Prototype, Document, true);
    }

    GetAllPrototypes(): Document[] {
        let protos: Document[] = [];
        let doc: Opt<Document> = this;
        while (doc && doc != WAITING) {
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