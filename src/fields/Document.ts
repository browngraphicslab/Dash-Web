import { Field, Cast, Opt, Waiting, WAITING } from "./Field"
import { Key, KeyStore } from "./Key"
import { NumberField } from "./NumberField";
import { ObservableMap, computed, action, observable } from "mobx";
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

    @observable
    GetField(key: Key, ignoreProto: boolean = false): Opt<Field> {
        if (KeyStore.X == key) {
            console.log("");
        }
        let field: Opt<Field>;
        if (ignoreProto) {
            if (this.fields.has(key)) {
                if (KeyStore.X == key) {
                    console.log("");
                }
                field = this.fields.get(key);
            } else {
                field = WAITING;
                var me = this;
                setTimeout(function () {
                    me.DeferredSetField(key);
                }, 100)
            }
        } else {
            let doc: Opt<Document> = this;
            while (doc && doc != WAITING) {
                if (!(doc.fields.has(key))) {
                    var me = this;
                    setTimeout(function () {
                        me.DeferredSetField(key);
                    }, 1000)
                    doc = doc.GetPrototype();
                } else
                    break;
            }

            if (doc && doc != WAITING) {
                if (KeyStore.X == key) {
                    console.log("");
                }
                field = doc.fields.get(key);
            }
        }

        return field;
    }

    @observable
    GetFieldT<T extends Field = Field>(key: Key, ctor: { new(...args: any[]): T }, ignoreProto: boolean = false): Opt<T> {
        var getfield = this.GetField(key, ignoreProto);
        if (getfield != WAITING) {
            return Cast(this.GetField(key, ignoreProto), ctor);
        }
        return WAITING;
    }

    @observable
    GetFieldOrCreate<T extends Field>(key: Key, ctor: { new(): T }, ignoreProto: boolean = false): T {
        const field = this.GetFieldT(key, ctor, ignoreProto);
        if (field && field != WAITING) {
            return field;
        }
        const newField = new ctor();
        this.SetField(key, newField);
        return newField;
    }

    @observable
    GetFieldValue<T, U extends { Data: T }>(key: Key, ctor: { new(): U }, defaultVal: T): T {
        let val = this.GetField(key);
        let vval = (val && val instanceof ctor) ? val.Data : defaultVal;
        return vval;
    }

    @observable
    GetNumberField(key: Key, defaultVal: number): number {
        return this.GetFieldValue(key, NumberField, defaultVal);
    }

    @observable
    GetTextField(key: Key, defaultVal: string): string {
        return this.GetFieldValue(key, TextField, defaultVal);
    }

    @observable
    GetListField<T extends Field>(key: Key, defaultVal: T[]): T[] {
        return this.GetFieldValue<T[], ListField<T>>(key, ListField, defaultVal)
    }

    SetField(key: Key, field: Field | undefined): void {
        if (field) {
            if (KeyStore.X == key) {
                console.log("");
            }
            this.fields.set(key, field);
        } else {
            this.fields.delete(key);
        }
    }

    SetFieldValue<T extends Field>(key: Key, value: any, ctor: { new(): T }): boolean {
        if (KeyStore.X == key) {
            console.log("");
        }
        let field = new ctor();
        if (field.TrySetValue(value)) {
            this._sfields.set(key, field);
            return true;
        } else {
            return false;
        }

        // let field = this.GetField(key, true);
        // if (field == WAITING)
        //     return true;
        // if (field != null) {
        //     return field.TrySetValue(value);
        // } else {
        //     field = new ctor();
        //     if (field.TrySetValue(value)) {
        //         this.SetField(key, field);
        //         return true;
        //     } else {
        //         return false;
        //     }
        // }
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