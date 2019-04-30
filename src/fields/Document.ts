import { Key } from "./Key";
import { KeyStore } from "./KeyStore";
import { Field, Cast, FieldWaiting, FieldValue, FieldId, Opt } from "./Field";
import { NumberField } from "./NumberField";
import { ObservableMap, computed, action, runInAction } from "mobx";
import { TextField } from "./TextField";
import { ListField } from "./ListField";
import { Server } from "../client/Server";
import { Types } from "../server/Message";
import { UndoManager } from "../client/util/UndoManager";
import { HtmlField } from "./HtmlField";
import { BooleanField } from "./BooleanField";
import { allLimit } from "async";
import { prototype } from "nodemailer/lib/smtp-pool";
import { HistogramField } from "../client/northstar/dash-fields/HistogramField";
import { Documents } from "../client/documents/Documents";

export class Document extends Field {
    //TODO tfs: We should probably store FieldWaiting in fields when we request it from the server so that we don't set up multiple server gets for the same document and field
    public fields: ObservableMap<string, { key: Key; field: Field }> = new ObservableMap();
    public _proxies: ObservableMap<string, FieldId> = new ObservableMap();

    constructor(id?: string, save: boolean = true) {
        super(id);

        if (save) {
            Server.UpdateField(this);
        }
    }
    static FromJson(data: any, id: string, save: boolean): Document {
        let doc = new Document(id, save);
        let fields = data as [string, string][];
        fields.forEach(pair => doc._proxies.set(pair[0], pair[1]));
        return doc;
    }

    UpdateFromServer(data: [string, string][]) {
        for (const key in data) {
            const element = data[key];
            this._proxies.set(element[0], element[1]);
        }
    }

    public Width = () => this.GetNumber(KeyStore.Width, 0);
    public Height = () => this.GetNumber(KeyStore.Height, this.GetNumber(KeyStore.NativeWidth, 0) ? (this.GetNumber(KeyStore.NativeHeight, 0) / this.GetNumber(KeyStore.NativeWidth, 0)) * this.GetNumber(KeyStore.Width, 0) : 0);
    public Scale = () => this.GetNumber(KeyStore.Scale, 1);

    @computed
    public get Title(): string {
        let title = this.Get(KeyStore.Title, true);
        if (title || title === FieldWaiting) {
            if (title !== FieldWaiting && title instanceof TextField) {
                return title.Data;
            }
            else return "-waiting-";
        }
        let parTitle = this.GetT(KeyStore.Title, TextField);
        if (parTitle || parTitle === FieldWaiting) {
            if (parTitle !== FieldWaiting) return parTitle.Data + ".alias";
            else return "-waiting-.alias";
        }
        return "-untitled-";
    }

    @computed
    public get Fields() {
        return this.fields;
    }

    /**
     * Get the field in the document associated with the given key. If the
     * associated field has not yet been filled in from the server, a request
     * to the server will automatically be sent, the value will be filled in
     * when the request is completed, and {@link Field.ts#FieldWaiting} will be returned.
     * @param key - The key of the value to get
     * @param ignoreProto - If true, ignore any prototype this document
     * might have and only search for the value on this immediate document.
     * If false (default), search up the prototype chain, starting at this document,
     * for a document that has a field associated with the given key, and return the first
     * one found.
     *
     * @returns If the document does not have a field associated with the given key, returns `undefined`.
     * If the document does have an associated field, but the field has not been fetched from the server, returns {@link Field.ts#FieldWaiting}.
     * If the document does have an associated field, and the field has not been fetched from the server, returns the associated field.
     */
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
            while (doc && field !== FieldWaiting) {
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
                    if (
                        doc.fields.has(KeyStore.Prototype.Id) ||
                        doc._proxies.has(KeyStore.Prototype.Id)
                    ) {
                        doc = doc.GetPrototype();
                    } else {
                        break;
                    }
                } else {
                    field = curField.field;
                    break;
                }
            }
            if (doc === FieldWaiting) field = FieldWaiting;
        }

        return field;
    }

    /**
     * Tries to get the field associated with the given key, and if there is an
     * associated field, calls the given callback with that field.
     * @param key - The key of the value to get
     * @param callback - A function that will be called with the associated field, if it exists,
     * once it is fetched from the server (this may be immediately if the field has already been fetched).
     * Note: The callback will not be called if there is no associated field.
     * @returns `true` if the field exists on the document and `callback` will be called, and `false` otherwise
     */
    GetAsync(key: Key, callback: (field: Opt<Field>) => void): void {
        //TODO: This currently doesn't deal with prototypes
        let field = this.fields.get(key.Id);
        if (field && field.field) {
            callback(field.field);
        } else if (this._proxies.has(key.Id)) {
            Server.GetDocumentField(this, key, callback);
        } else if (this._proxies.has(KeyStore.Prototype.Id)) {
            this.GetTAsync(KeyStore.Prototype, Document, proto => {
                if (proto) {
                    proto.GetAsync(key, callback);
                } else {
                    callback(undefined);
                }
            });
        } else {
            callback(undefined);
        }
    }

    GetTAsync<T extends Field>(key: Key, ctor: { new(): T }): Promise<Opt<T>>;
    GetTAsync<T extends Field>(
        key: Key,
        ctor: { new(): T },
        callback: (field: Opt<T>) => void
    ): void;
    GetTAsync<T extends Field>(
        key: Key,
        ctor: { new(): T },
        callback?: (field: Opt<T>) => void
    ): Promise<Opt<T>> | void {
        let fn = (cb: (field: Opt<T>) => void) => {
            return this.GetAsync(key, field => {
                cb(Cast(field, ctor));
            });
        };
        if (callback) {
            fn(callback);
        } else {
            return new Promise(fn);
        }
    }

    /**
     * Same as {@link Document#GetAsync}, except a field of the given type
     * will be created if there is no field associated with the given key,
     * or the field associated with the given key is not of the given type.
     * @param ctor - Constructor of the field type to get. E.g., TextField, ImageField, etc.
     */
    GetOrCreateAsync<T extends Field>(
        key: Key,
        ctor: { new(): T },
        callback: (field: T) => void
    ): void {
        //This currently doesn't deal with prototypes
        if (this._proxies.has(key.Id) || this.fields.has(key.Id)) {
            Server.GetDocumentField(this, key, field => {
                if (field && field instanceof ctor) {
                    callback(field);
                } else {
                    let newField = new ctor();
                    this.Set(key, newField);
                    callback(newField);
                }
            });
        } else {
            let newField = new ctor();
            this.Set(key, newField);
            callback(newField);
        }
    }

    /**
     * Same as {@link Document#Get}, except that it will additionally
     * check if the field is of the given type.
     * @param ctor - Constructor of the field type to get. E.g., `TextField`, `ImageField`, etc.
     * @returns Same as {@link Document#Get}, except will return `undefined`
     * if there is an associated field but it is of the wrong type.
     */
    GetT<T extends Field = Field>(
        key: Key,
        ctor: { new(...args: any[]): T },
        ignoreProto: boolean = false
    ): FieldValue<T> {
        var getfield = this.Get(key, ignoreProto);
        if (getfield !== FieldWaiting) {
            return Cast(getfield, ctor);
        }
        return FieldWaiting;
    }

    GetOrCreate<T extends Field>(
        key: Key,
        ctor: { new(): T },
        ignoreProto: boolean = false
    ): T {
        const field = this.GetT(key, ctor, ignoreProto);
        if (field && field !== FieldWaiting) {
            return field;
        }
        const newField = new ctor();
        this.Set(key, newField);
        return newField;
    }

    GetData<T, U extends Field & { Data: T }>(
        key: Key,
        ctor: { new(): U },
        defaultVal: T
    ): T {
        let val = this.Get(key);
        let vval = val && val instanceof ctor ? val.Data : defaultVal;
        return vval;
    }

    GetHtml(key: Key, defaultVal: string): string {
        return this.GetData(key, HtmlField, defaultVal);
    }

    GetBoolean(key: Key, defaultVal: boolean): boolean {
        return this.GetData(key, BooleanField, defaultVal);
    }

    GetNumber(key: Key, defaultVal: number): number {
        return this.GetData(key, NumberField, defaultVal);
    }

    GetText(key: Key, defaultVal: string): string {
        return this.GetData(key, TextField, defaultVal);
    }

    GetList<T extends Field>(key: Key, defaultVal: T[]): T[] {
        return this.GetData<T[], ListField<T>>(key, ListField, defaultVal);
    }

    @action
    Set(key: Key, field: Field | undefined, setOnPrototype = false): void {
        let old = this.fields.get(key.Id);
        let oldField = old ? old.field : undefined;
        if (setOnPrototype) {
            this.SetOnPrototype(key, field);
        } else {
            if (field) {
                this.fields.set(key.Id, { key, field });
                this._proxies.set(key.Id, field.Id);
                // Server.AddDocumentField(this, key, field);
            } else {
                this.fields.delete(key.Id);
                this._proxies.delete(key.Id);
                // Server.DeleteDocumentField(this, key);
            }
            Server.UpdateField(this);
        }
        if (oldField || field) {
            UndoManager.AddEvent({
                undo: () => this.Set(key, oldField, setOnPrototype),
                redo: () => this.Set(key, field, setOnPrototype)
            });
        }
    }

    @action
    SetOnPrototype(key: Key, field: Field | undefined): void {
        this.GetTAsync(KeyStore.Prototype, Document, (f: Opt<Document>) => {
            f && f.Set(key, field);
        });
    }

    @action
    SetDataOnPrototype<T, U extends Field & { Data: T }>(key: Key, value: T, ctor: { new(): U }, replaceWrongType = true) {
        this.GetTAsync(KeyStore.Prototype, Document, (f: Opt<Document>) => {
            f && f.SetData(key, value, ctor, replaceWrongType);
        });
    }

    @action
    SetData<T, U extends Field & { Data: T }>(key: Key, value: T, ctor: { new(data: T): U }, replaceWrongType = true) {
        let field = this.Get(key, true);
        if (field instanceof ctor) {
            field.Data = value;
        } else if (!field || replaceWrongType) {
            let newField = new ctor(value);
            // newField.Data = value;
            this.Set(key, newField);
        }
    }

    @action
    SetText(key: Key, value: string, replaceWrongType = true) {
        this.SetData(key, value, TextField, replaceWrongType);
    }
    @action
    SetBoolean(key: Key, value: boolean, replaceWrongType = true) {
        this.SetData(key, value, BooleanField, replaceWrongType);
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
        while (doc && doc !== FieldWaiting) {
            protos.push(doc);
            doc = doc.GetPrototype();
        }
        return protos;
    }

    CreateAlias(id?: string): Document {
        let alias = new Document(id);
        this.GetTAsync(KeyStore.Prototype, Document, (f: Opt<Document>) => {
            f && alias.Set(KeyStore.Prototype, f);
        });

        return alias;
    }

    @action
    CreateLink(dstTarg: Document) {
        let batch = UndoManager.StartBatch("document view drop");
        let linkDoc: Document = Documents.TextDocument({ width: 100, height: 25, title: "-link-" });
        linkDoc.SetText(KeyStore.LinkDescription, "");
        linkDoc.SetText(KeyStore.LinkTags, "Default");

        let srcTarg = this;
        linkDoc.Set(KeyStore.LinkedToDocs, dstTarg);
        linkDoc.Set(KeyStore.LinkedFromDocs, srcTarg);
        const prom1 = new Promise(resolve => dstTarg.GetOrCreateAsync(
            KeyStore.LinkedFromDocs,
            ListField,
            field => {
                (field as ListField<Document>).Data.push(linkDoc);
                resolve();
            }
        ));
        const prom2 = new Promise(resolve => srcTarg.GetOrCreateAsync(
            KeyStore.LinkedToDocs,
            ListField,
            field => {
                (field as ListField<Document>).Data.push(linkDoc);
                resolve();
            }
        ));
        Promise.all([prom1, prom2]).finally(() => batch.end());
        return linkDoc;
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
        return this.Title;
        var title = (this._proxies.has(KeyStore.Title.Id) ? "???" : this.Title) + "(" + this.Id + ")";
        return title;
        //throw new Error("Method not implemented.");
    }
    Copy(copyProto?: boolean, id?: string): Field {
        let copy = new Document();
        this._proxies.forEach((fieldid, keyid) => { // copy each prototype field
            let key = KeyStore.KeyLookup(keyid);
            if (key) {
                this.GetAsync(key, (field: Opt<Field>) => {
                    if (key === KeyStore.Prototype && copyProto) { // handle prototype field specially
                        if (field instanceof Document) {
                            copy.Set(key, field.Copy(false)); // only copying one level of prototypes for now...
                        }
                    }
                    else
                        if (field instanceof Document) {  // ... TODO bcz: should we copy documents or reference them
                            copy.Set(key!, field);
                        }
                        else if (field) {
                            copy.Set(key!, field.Copy());
                        }
                });
            }
        });
        return copy;
    }

    ToJson() {
        let fields: [string, string][] = [];
        this._proxies.forEach((field, key) =>
            field && fields.push([key, field]));

        return {
            type: Types.Document,
            data: fields,
            id: this.Id
        };
    }
}
