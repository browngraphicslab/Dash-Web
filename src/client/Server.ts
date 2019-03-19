import { Key } from "../fields/Key"
import { ObservableMap, action, reaction } from "mobx";
import { Field, FieldWaiting, FIELD_WAITING, Opt, FieldId } from "../fields/Field"
import { Document } from "../fields/Document"
import { SocketStub } from "./SocketStub";
import * as OpenSocket from 'socket.io-client';
import { Utils } from "./../Utils";
import { MessageStore, Types } from "./../server/Message";

export class Server {
    public static ClientFieldsCached: ObservableMap<FieldId, Field | FIELD_WAITING> = new ObservableMap();
    static Socket: SocketIOClient.Socket = OpenSocket(`${window.location.protocol}//${window.location.hostname}:4321`);
    static GUID: string = Utils.GenerateGuid()


    // Retrieves the cached value of the field and sends a request to the server for the real value (if it's not cached).
    // Call this is from within a reaction and test whether the return value is FieldWaiting.
    // 'hackTimeout' is here temporarily for simplicity when debugging things.
    public static GetField(fieldid: FieldId, callback: (field: Opt<Field>) => void): Opt<Field> | FIELD_WAITING {
        let cached = this.ClientFieldsCached.get(fieldid);
        if (!cached) {
            this.ClientFieldsCached.set(fieldid, FieldWaiting);
            SocketStub.SEND_FIELD_REQUEST(fieldid, action((field: Field | undefined) => {
                let cached = this.ClientFieldsCached.get(fieldid);
                if (cached != FieldWaiting)
                    callback(cached);
                else {
                    if (field) {
                        this.ClientFieldsCached.set(fieldid, field);
                    } else {
                        this.ClientFieldsCached.delete(fieldid)
                    }
                    callback(field)
                }
            }));
        } else if (cached != FieldWaiting) {
            setTimeout(() => callback(cached as Field), 0);
        } else {
            reaction(() => {
                return this.ClientFieldsCached.get(fieldid);
            }, (field, reaction) => {
                if (field !== "<Waiting>") {
                    reaction.dispose()
                    callback(field)
                }
            })
        }
        return cached;
    }

    public static GetFields(fieldIds: FieldId[], callback: (fields: { [id: string]: Field }) => any) {
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
            for (let key in fields) {
                let field = fields[key];
                if (!(this.ClientFieldsCached.get(field.Id) instanceof Field)) {
                    this.ClientFieldsCached.set(field.Id, field)
                }
            }
            reaction(() => {
                return waitingFieldIds.map(this.ClientFieldsCached.get);
            }, (cachedFields, reaction) => {
                if (!cachedFields.some(field => !field || field === FieldWaiting)) {
                    reaction.dispose();
                    for (let field of cachedFields) {
                        let realField = field as Field;
                        existingFields[realField.Id] = realField;
                    }
                    callback({ ...fields, ...existingFields })
                }
            }, { fireImmediately: true })
        });
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
                f.UpdateFromServer(field.data);
                f.init(() => { });
            }
        }
    }
}

Server.Socket.on(MessageStore.Foo.Message, Server.connected);
Server.Socket.on(MessageStore.SetField.Message, Server.updateField);
