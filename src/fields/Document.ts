import { Key } from "./Key"
import { KeyStore } from "./KeyStore";
import { Field, Cast, FieldWaiting, FieldValue, FieldId } from "./Field"
import { NumberField } from "./NumberField";
import { ObservableMap, computed, action } from "mobx";
import { TextField } from "./TextField";
import { ListField } from "./ListField";
import { Server } from "../client/Server";
import { Types } from "../server/Message";
import { UndoManager } from "../client/util/UndoManager";

export class Document extends Field {
    public fields: ObservableMap<string, { key: Key, field: Field }> = new ObservableMap();
    public _proxies: ObservableMap<string, FieldId> = new ObservableMap();

    constructor(id?: string, save: boolean = true) {
        super(id)

        if (save) {
            Server.UpdateField(this)
        }
    }

    UpdateFromServer(data: [string, string][]) {
        for (const key in data) {
            const element = data[key];
            this._proxies.set(element[0], element[1]);
        }
    }

    public Width = () => { return this.GetNumber(KeyStore.Width, 0) }
    public Height = () => { return this.GetNumber(KeyStore.Height, this.GetNumber(KeyStore.NativeWidth, 0) ? this.GetNumber(KeyStore.NativeHeight, 0) / this.GetNumber(KeyStore.NativeWidth, 0) * this.GetNumber(KeyStore.Width, 0) : 0) }
    public Scale = () => { return this.GetNumber(KeyStore.Scale, 1) }

    @computed
    public get Title() {
        return this.GetText(KeyStore.Title, "<untitled>");
    }

    Get(key: Key, ignoreProto: boolean = false): FieldValue<Field> {
        let field: FieldValue<Field>;
        if (ignoreProto) {
            if (this.fields.has(key.Id)) {
                field = this.fields.get(key.Id)!.field;
            } else if (this._proxies.has(key.Id)) {
                Server.GetDocumentField(this, key);
                /*
                The field might have been instantly filled from the cache
                Maybe we want to just switch back to returning the value
                from Server.GetDocumentField if it's in the cache
                */
                if (this.fields.has(key.Id)) {
                    field = this.fields.get(key.Id)!.field;
                } else {
                    field = FieldWaiting;
                }
            }
        } else {
            let doc: FieldValue<Document> = this;
            while (doc && doc != FieldWaiting && field != FieldWaiting) {
                let curField = doc.fields.get(key.Id);
                let curProxy = doc._proxies.get(key.Id);
                if (!curField || (curProxy && curField.field.Id !== curProxy)) {
                    if (curProxy) {
                        Server.GetDocumentField(doc, key);
                        /*
                        The field might have been instantly filled from the cache
                        Maybe we want to just switch back to returning the value
                        from Server.GetDocumentField if it's in the cache
                        */
                        if (this.fields.has(key.Id)) {
                            field = this.fields.get(key.Id)!.field;
                        } else {
                            field = FieldWaiting;
                        }
                        break;
                    }
                    if ((doc.fields.has(KeyStore.Prototype.Id) || doc._proxies.has(KeyStore.Prototype.Id))) {
                        doc = doc.GetPrototype();
                    } else {
                        break;
                    }
                } else {
                    field = curField.field;
                    break;
                }
            }
            if (doc == FieldWaiting)
                field = FieldWaiting;
        }

        return field;
    }

    GetAsync(key: Key, callback: (field: Field) => void): boolean {
        //This currently doesn't deal with prototypes
        if (this._proxies.has(key.Id)) {
            Server.GetDocumentField(this, key, callback);
            return true;
        }
        return false;
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
        let old = this.fields.get(key.Id);
        let oldField = old ? old.field : undefined;
        if (field) {
            this.fields.set(key.Id, { key, field });
            this._proxies.set(key.Id, field.Id)
            // Server.AddDocumentField(this, key, field);
        } else {
            this.fields.delete(key.Id);
            this._proxies.delete(key.Id)
            // Server.DeleteDocumentField(this, key);
        }
        if (oldField || field) {
            UndoManager.AddEvent({
                undo: () => this.Set(key, oldField),
                redo: () => this.Set(key, field)
            })
        }
        Server.UpdateField(this);
    }

    @action
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

    MakeDelegate(id?: string): Document {
        let delegate = new Document(id);

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
        var title = (this._proxies.has(KeyStore.Title.Id) ? "???" : this.Title) + "(" + this.Id + ")";
        return title;
        //throw new Error("Method not implemented.");
    }
    Copy(): Field {
        throw new Error("Method not implemented.");
    }

    ToJson(): { type: Types, data: [string, string][], _id: string } {
        let fields: [string, string][] = []
        this._proxies.forEach((field, key) => {
            if (field) {
                fields.push([key, field as string])
            }
        });

        return {
            type: Types.Document,
            data: fields,
            _id: this.Id
        }
    }
}