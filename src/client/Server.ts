import { Field, FieldWaiting, FIELD_ID, FIELD_WAITING, FieldValue, Opt } from "../fields/Field"
import { Key, KeyStore } from "../fields/Key"
import { ObservableMap, action } from "mobx";
import { Document } from "../fields/Document"
import { SocketStub } from "./SocketStub";
import * as OpenSocket from 'socket.io-client';
import { Utils } from "./../Utils";
import { MessageStore, Types } from "./../server/Message";
import { ListField } from "../fields/ListField";

export class Server {
    public static ClientFieldsCached: ObservableMap<FIELD_ID, Field | FIELD_WAITING> = new ObservableMap();
    static Socket: SocketIOClient.Socket = OpenSocket("http://localhost:1234");
    static GUID: string = Utils.GenerateGuid()


    // Retrieves the cached value of the field and sends a request to the server for the real value (if it's not cached).
    // Call this is from within a reaction and test whether the return value is FieldWaiting.
    // 'hackTimeout' is here temporarily for simplicity when debugging things.
    public static GetField(fieldid: FIELD_ID, callback: (field: Opt<Field>) => void = (f) => { }, doc: Document, key: Key, hackTimeout: number = -1) {
        if (!this.ClientFieldsCached.get(fieldid)) {
            var ft = this.times++;
            var title = (!doc.fields.has(KeyStore.Title.Id) ? "???" : doc.Title) + "(" + doc.Id + ")";
            var mesg = "   Query> field(" + ft + ") " + title + " " + key.Name;
            console.log(mesg);
            this.ClientFieldsCached.set(fieldid, FieldWaiting);
            //simulating a server call with a registered callback action
            SocketStub.SEND_FIELD_REQUEST(fieldid, action((field: Field | undefined) => {
                console.log("   Reply> field(" + ft + ") " + title + " " + key.Name + " = " + (field ? field.GetValue() : "<undefined>"));

                if (this.ClientFieldsCached.has(fieldid) && this.ClientFieldsCached.get(fieldid) != FieldWaiting)
                    callback(this.ClientFieldsCached.get(fieldid) as Field);
                else {
                    if (field) {
                        this.ClientFieldsCached.set(fieldid, field);
                    }
                    callback(field)
                }
            }));
        } else if (this.ClientFieldsCached.get(fieldid) != FieldWaiting) {
            callback(this.ClientFieldsCached.get(fieldid) as Field);
        }
        return this.ClientFieldsCached.get(fieldid);
    }

    public static GetFields(fieldIds: FIELD_ID[], callback: (fields: { [id: string]: Field }) => any) {
        SocketStub.SEND_FIELDS_REQUEST(fieldIds, (fields) => {
            for (let key in fields) {
                let field = fields[key];
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
        return this.GetField(doc._proxies.get(key.Id),
            action((fieldfromserver: Opt<Field>) => {
                if (fieldfromserver) {
                    doc.fields.set(key.Id, { key, field: fieldfromserver });
                }
            }), doc, key);
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

    private static lock: boolean = false;

    static printfield(field: Field) {
        if (field instanceof Key) {
            return field.Name;
        }
        else if (field instanceof Document) {
            var title = (field._proxies.has(KeyStore.Title.Id) ? field.Title : "???")
            return title;
        } else if (field instanceof ListField) {
            var str = "[";
            (field as ListField<Field>).Data.map(d => str += this.printfield(d));
            str += "]";
            return str;
        }
        return field.GetValue()
    }

    public static UpdateField(field: Field) {
        if (this.lock) {
            // setTimeout(this.UpdateField, 1000, field)
        }
        this.lock = true
        var type = "field"
        if (field instanceof Key) {
            type = "Key";
        }
        else if (field instanceof Document) {
            type = "Doc";
        } else if (field instanceof ListField) {
            type = "List"
        }
        console.log("Set: " + type + "(" + field.Id + ") =" + this.printfield(field));
        SocketStub.SEND_SET_FIELD(field, (args: any) => {
            if (this.lock) {
                this.lock = false
            }
        });
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
                console.log("Update from server:" + Server.printfield(f));
                f.UpdateFromServer(field.data);
                f.init(() => { });
            }
        }
    }
}

Server.Socket.on(MessageStore.Foo.Message, Server.connected);
Server.Socket.on(MessageStore.SetField.Message, Server.updateField);