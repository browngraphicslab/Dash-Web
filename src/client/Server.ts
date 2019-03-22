import { Key } from "../fields/Key"
import { ObservableMap, action, reaction } from "mobx";
import { Field, FieldWaiting, FIELD_WAITING, Opt, FieldId } from "../fields/Field"
import { Document } from "../fields/Document"
import { SocketStub, FieldMap } from "./SocketStub";
import * as OpenSocket from 'socket.io-client';
import { Utils } from "./../Utils";
import { MessageStore, Types } from "./../server/Message";

export class Server {
    public static ClientFieldsCached: ObservableMap<FieldId, Field | FIELD_WAITING> = new ObservableMap();
    static Socket: SocketIOClient.Socket = OpenSocket(`${window.location.protocol}//${window.location.hostname}:4321`);
    static GUID: string = Utils.GenerateGuid()


    // Retrieves the cached value of the field and sends a request to the server for the real value (if it's not cached).
    // Call this is from within a reaction and test whether the return value is FieldWaiting.
    public static GetField(fieldid: FieldId): Promise<Opt<Field>>;
    public static GetField(fieldid: FieldId, callback: (field: Opt<Field>) => void): void;
    public static GetField(fieldid: FieldId, callback?: (field: Opt<Field>) => void): Promise<Opt<Field>> | void {
        let fn = (cb: (field: Opt<Field>) => void) => {

            let cached = this.ClientFieldsCached.get(fieldid);
            if (!cached) {
                this.ClientFieldsCached.set(fieldid, FieldWaiting);
                SocketStub.SEND_FIELD_REQUEST(fieldid, action((field: Field | undefined) => {
                    let cached = this.ClientFieldsCached.get(fieldid);
                    if (cached != FieldWaiting)
                        cb(cached);
                    else {
                        if (field) {
                            this.ClientFieldsCached.set(fieldid, field);
                        } else {
                            this.ClientFieldsCached.delete(fieldid)
                        }
                        cb(field)
                    }
                }));
            } else if (cached != FieldWaiting) {
                setTimeout(() => cb(cached as Field), 0);
            } else {
                reaction(() => {
                    return this.ClientFieldsCached.get(fieldid);
                }, (field, reaction) => {
                    if (field !== "<Waiting>") {
                        reaction.dispose()
                        cb(field)
                    }
                })
            }
        }
        if (callback) {
            fn(callback);
        } else {
            return new Promise(res => fn(res));
        }
    }

    public static GetFields(fieldIds: FieldId[]): Promise<{ [id: string]: Field }>;
    public static GetFields(fieldIds: FieldId[], callback: (fields: FieldMap) => any): void;
    public static GetFields(fieldIds: FieldId[], callback?: (fields: FieldMap) => any): Promise<FieldMap> | void {
        let fn = (cb: (fields: FieldMap) => void) => {

            let neededFieldIds: FieldId[] = [];
            let waitingFieldIds: FieldId[] = [];
            let existingFields: { [id: string]: Field } = {};
            for (let id of fieldIds) {
                let field = this.ClientFieldsCached.get(id);
                if (!field) {
                    neededFieldIds.push(id);
                    this.ClientFieldsCached.set(id, FieldWaiting);
                } else if (field === FieldWaiting) {
                    waitingFieldIds.push(id);
                } else {
                    existingFields[id] = field;
                }
            }
            SocketStub.SEND_FIELDS_REQUEST(neededFieldIds, (fields) => {
                for (let id of neededFieldIds) {
                    let field = fields[id];
                    if (field) {
                        if (!(this.ClientFieldsCached.get(field.Id) instanceof Field)) {
                            this.ClientFieldsCached.set(field.Id, field)
                        } else {
                            throw new Error("we shouldn't be trying to replace things that are already in the cache")
                        }
                    } else {
                        if (this.ClientFieldsCached.get(id) === FieldWaiting) {
                            this.ClientFieldsCached.delete(id);
                        } else {
                            throw new Error("we shouldn't be trying to replace things that are already in the cache")
                        }
                    }
                }
                reaction(() => {
                    return waitingFieldIds.map(id => this.ClientFieldsCached.get(id));
                }, (cachedFields, reaction) => {
                    if (!cachedFields.some(field => !field || field === FieldWaiting)) {
                        reaction.dispose();
                        for (let field of cachedFields) {
                            let realField = field as Field;
                            existingFields[realField.Id] = realField;
                        }
                        cb({ ...fields, ...existingFields })
                    }
                }, { fireImmediately: true })
            });
        };
        if (callback) {
            fn(callback);
        } else {
            return new Promise(res => fn(res));
        }
    }

    public static GetDocumentField(doc: Document, key: Key, callback?: (field: Field) => void) {
        let field = doc._proxies.get(key.Id);
        if (field) {
            this.GetField(field,
                action((fieldfromserver: Opt<Field>) => {
                    if (fieldfromserver) {
                        doc.fields.set(key.Id, { key, field: fieldfromserver });
                        if (callback) {
                            callback(fieldfromserver);
                        }
                    }
                }));
        }
    }

    public static AddDocument(document: Document) {
        SocketStub.SEND_ADD_DOCUMENT(document);
    }
    public static AddDocumentField(doc: Document, key: Key, value: Field) {
        console.log("Add doc field " + doc.Title + " " + key.Name + " fid " + value.Id + " " + value);
        SocketStub.SEND_ADD_DOCUMENT_FIELD(doc, key, value);
    }
    public static DeleteDocumentField(doc: Document, key: Key) {
        SocketStub.SEND_DELETE_DOCUMENT_FIELD(doc, key);
    }

    public static UpdateField(field: Field) {
        if (!this.ClientFieldsCached.has(field.Id)) {
            this.ClientFieldsCached.set(field.Id, field)
        }
        SocketStub.SEND_SET_FIELD(field);
    }

    static connected(message: string) {
        Server.Socket.emit(MessageStore.Bar.Message, Server.GUID);
    }

    @action
    private static cacheField(clientField: Field) {
        var cached = this.ClientFieldsCached.get(clientField.Id);
        if (!cached || cached == FieldWaiting) {
            this.ClientFieldsCached.set(clientField.Id, clientField);
        } else {
            // probably should overwrite the values within any field that was already here...
        }
        return this.ClientFieldsCached.get(clientField.Id) as Field;
    }

    @action
    static updateField(field: { _id: string, data: any, type: Types }) {
        if (Server.ClientFieldsCached.has(field._id)) {
            var f = Server.ClientFieldsCached.get(field._id);
            if (f && f != FieldWaiting) {
                // console.log("Applying        : " + field._id);
                f.UpdateFromServer(field.data);
                f.init(() => { });
            } else {
                // console.log("Not applying wa : " + field._id);
            }
        } else {
            // console.log("Not applying mi : " + field._id);
        }
    }
}

Utils.AddServerHandler(Server.Socket, MessageStore.Foo, Server.connected);
Utils.AddServerHandler(Server.Socket, MessageStore.SetField, Server.updateField);
