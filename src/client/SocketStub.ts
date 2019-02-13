import { Field, FIELD_ID } from "../fields/Field"
import { Key, KeyStore } from "../fields/Key"
import { ObservableMap, action } from "mobx";
import { Document } from "../fields/Document"
import { MessageStore, SetFieldArgs, GetFieldArgs, DocumentTransfer, Types } from "../server/Message";
import { Utils } from "../Utils";
import { Server } from "./Server";

export class SocketStub {

    static FieldStore: ObservableMap<FIELD_ID, Field> = new ObservableMap();
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

        Utils.Emit(Server.Socket, MessageStore.AddDocument, new DocumentTransfer(document.ToJson()))
    }

    public static SEND_FIELD_REQUEST(fieldid: FIELD_ID, callback: (field: Field) => void) {
        if (fieldid) {
            let args: GetFieldArgs = new GetFieldArgs(fieldid)
            Utils.EmitCallback(Server.Socket, MessageStore.GetField, args, (field: Field) => callback(field))
        }
    }

    public static SEND_ADD_DOCUMENT_FIELD(doc: Document, key: Key, value: Field) {

        // Send a serialized version of the field to the server along with the
        // associated info of the document id and key where it is used.

        // ...SOCKET(ADD_DOCUMENT_FIELD, document id, key id, serialized field)

        // server updates its document to hold a proxy mapping from key => fieldId
        var document = this.FieldStore.get(doc.Id) as Document;
        if (document)
            document._proxies.set(key.Id, value.Id);

        // server adds the field to its repository of fields
        this.FieldStore.set(value.Id, value);
        // Utils.Emit(Server.Socket, MessageStore.AddDocument, new DocumentTransfer(doc.ToJson()))
    }

    public static SEND_DELETE_DOCUMENT_FIELD(doc: Document, key: Key) {
        // Send a request to delete the field stored under the specified key from the document

        // ...SOCKET(DELETE_DOCUMENT_FIELD, document id, key id)

        // Server removes the field id from the document's list of field proxies
        var document = this.FieldStore.get(doc.Id) as Document;
        if (document)
            document._proxies.delete(key.Id);
    }

    public static SEND_SET_FIELD(field: Field) {
        // Send a request to set the value of a field

        // ...SOCKET(SET_FIELD, field id, serialized field value)

        // Server updates the value of the field in its fieldstore
        Utils.Emit(Server.Socket, MessageStore.SetField, field.ToJson())
    }
}
