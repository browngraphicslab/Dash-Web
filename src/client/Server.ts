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
    static Socket: SocketIOClient.Socket = OpenSocket("http://localhost:1234");
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
            callback(cached);
        } else {
            reaction(() => {
                return this.ClientFieldsCached.get(fieldid);
            }, (field, reaction) => {
                if (field !== "<Waiting>") {
                    callback(field)
                    reaction.dispose()
                }
            })
        }
        return cached;
    }

    public static GetFields(fieldIds: FieldId[], callback: (fields: { [id: string]: Field }) => any) {
        SocketStub.SEND_FIELDS_REQUEST(fieldIds, (fields) => {
            for (let key in fields) {
                let field = fields[key];
                if (!this.ClientFieldsCached.has(field.Id)) {
                    this.ClientFieldsCached.set(field.Id, field)
                }
            }
            callback(fields)
        });
    }

    static times = 0; // hack for testing
    public static GetDocumentField(doc: Document, key: Key) {
        // let keyId: string = element[0]
        // let valueId: string = element[1]
        // Server.GetField(keyId, (key: Field) => {
        //     if (key instanceof Key) {
        //         Server.GetField(valueId, (field: Field) => {
        //             console.log(field)
        //             doc.Set(key as Key, field)
        //         })
        //     }
        //     else {
        //         console.log("how did you get a key that isnt a key wtf")
        //     }
        // })
        let field = doc._proxies.get(key.Id);
        if (field) {
            this.GetField(field,
                action((fieldfromserver: Opt<Field>) => {
                    if (fieldfromserver) {
                        doc.fields.set(key.Id, { key, field: fieldfromserver });
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