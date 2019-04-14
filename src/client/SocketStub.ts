import { Key } from "../fields/Key";
import { Field, FieldId, Opt } from "../fields/Field";
import { ObservableMap } from "mobx";
import { Document } from "../fields/Document";
import { MessageStore, DocumentTransfer } from "../server/Message";
import { Utils } from "../Utils";
import { Server } from "./Server";
import { ServerUtils } from "../server/ServerUtil";


export interface FieldMap {
    [id: string]: Opt<Field>;
}

//TODO tfs: I think it might be cleaner to not have SocketStub deal with turning what the server gives it into Fields (in other words not call ServerUtils.FromJson), and leave that for the Server class.
export class SocketStub {

    static FieldStore: ObservableMap<FieldId, Field> = new ObservableMap();
    public static SEND_ADD_DOCUMENT(document: Document) {

        // Send a serialized version of the document to the server
        // ...SOCKET(ADD_DOCUMENT, serialied document)

        // server stores each document field in its repository of stored fields
        // document.fields.forEach((f, key) => this.FieldStore.set((f as Field).Id, f as Field));
        // let strippedDoc = new Document(document.Id);
        // document.fields.forEach((f, key) => {
        //     if (f) {
        //         // let args: SetFieldArgs = new SetFieldArgs(f.Id, f.GetValue())
        //         let args: Transferable = f.ToJson()
        //         Utils.Emit(Server.Socket, MessageStore.SetField, args)
        //     }
        // })

        // // server stores stripped down document (w/ only field id proxies) in the field store
        // this.FieldStore.set(document.Id, new Document(document.Id));
        // document.fields.forEach((f, key) => (this.FieldStore.get(document.Id) as Document)._proxies.set(key.Id, (f as Field).Id));

        console.log("sending " + document.Title);
        // Utils.Emit(Server.Socket, MessageStore.AddDocument, new DocumentTransfer(document.ToJson()));
    }

    public static SEND_FIELD_REQUEST(fieldid: FieldId): Promise<Opt<Field>>;
    public static SEND_FIELD_REQUEST(fieldid: FieldId, callback: (field: Opt<Field>) => void): void;
    public static SEND_FIELD_REQUEST(fieldid: FieldId, callback?: (field: Opt<Field>) => void): Promise<Opt<Field>> | void {
        let fn = function (cb: (field: Opt<Field>) => void) {
            Utils.EmitCallback(Server.Socket, MessageStore.GetField, fieldid, (field: any) => {
                if (field) {
                    ServerUtils.FromJson(field).init(cb);
                } else {
                    cb(undefined);
                }
            });
        };
        if (callback) {
            fn(callback);
        } else {
            return new Promise(fn);
        }
    }

    public static SEND_FIELDS_REQUEST(fieldIds: FieldId[], callback: (fields: FieldMap) => any) {
        Utils.EmitCallback(Server.Socket, MessageStore.GetFields, fieldIds, (fields: any[]) => {
            let fieldMap: any = {};
            let proms: Promise<any>[] = [];
            for (let field of fields) {
                let f = ServerUtils.FromJson(field);
                fieldMap[field._id] = f;
                proms.push(new Promise(res => f.init(res)));
            }
            Promise.all(proms).then(() => callback(fieldMap));
        });
    }

    public static SEND_ADD_DOCUMENT_FIELD(doc: Document, key: Key, value: Field) {

        // Send a serialized version of the field to the server along with the
        // associated info of the document id and key where it is used.

        // ...SOCKET(ADD_DOCUMENT_FIELD, document id, key id, serialized field)

        // server updates its document to hold a proxy mapping from key => fieldId
        var document = this.FieldStore.get(doc.Id) as Document;
        if (document) {
            document._proxies.set(key.Id, value.Id);
        }

        // server adds the field to its repository of fields
        this.FieldStore.set(value.Id, value);
        // Utils.Emit(Server.Socket, MessageStore.AddDocument, new DocumentTransfer(doc.ToJson()))
    }

    public static SEND_DELETE_DOCUMENT_FIELD(doc: Document, key: Key) {
        // Send a request to delete the field stored under the specified key from the document

        // ...SOCKET(DELETE_DOCUMENT_FIELD, document id, key id)

        // Server removes the field id from the document's list of field proxies
        var document = this.FieldStore.get(doc.Id) as Document;
        if (document) {
            document._proxies.delete(key.Id);
        }
    }

    public static SEND_SET_FIELD(field: Field) {
        // Send a request to set the value of a field

        // ...SOCKET(SET_FIELD, field id, serialized field value)

        // Server updates the value of the field in its fieldstore
        Utils.Emit(Server.Socket, MessageStore.SetField, field.ToJson());
    }
}
