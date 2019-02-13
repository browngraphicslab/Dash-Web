import { Field, FieldWaiting, FIELD_ID, FIELD_WAITING, FieldValue } from "../fields/Field"
import { Key, KeyStore } from "../fields/Key"
import { ObservableMap, action } from "mobx";
import { Document } from "../fields/Document"
import { SocketStub } from "./SocketStub";
import * as OpenSocket from 'socket.io-client';
import { Utils } from "./../Utils";
import { MessageStore } from "./../server/Message";

export class Server {
    private static ClientFieldsCached: ObservableMap<FIELD_ID, Field | FIELD_WAITING> = new ObservableMap();
    static Socket: SocketIOClient.Socket = OpenSocket("http://localhost:1234")
    static GUID: string = Utils.GenerateGuid()

    // Retrieves the cached value of the field and sends a request to the server for the real value (if it's not cached).
    // Call this is from within a reaction and test whether the return value is FieldWaiting.
    // 'hackTimeout' is here temporarily for simplicity when debugging things.
    public static GetField(fieldid: FIELD_ID, callback: (field: Field) => void = (f) => { }, hackTimeout: number = -1) {
        if (!this.ClientFieldsCached.get(fieldid)) {
            this.ClientFieldsCached.set(fieldid, FieldWaiting);
            //simulating a server call with a registered callback action
            SocketStub.SEND_FIELD_REQUEST(fieldid,
                action((field: Field) => callback(Server.cacheField(field))));
        } else if (this.ClientFieldsCached.get(fieldid) != FieldWaiting) {
            callback(this.ClientFieldsCached.get(fieldid) as Field);
        }
        return this.ClientFieldsCached.get(fieldid);
    }

    static times = 0; // hack for testing
    public static GetDocumentField(doc: Document, key: Key) {
        var hackTimeout: number = key == KeyStore.Data ? (this.times++ == 0 ? 5000 : 1000) : key == KeyStore.X ? 2500 : 500;

        return this.GetField(doc._proxies.get(key.Id),
            action((fieldfromserver: Field) => {
                doc._proxies.delete(key.Id);
                doc.fields.set(key, fieldfromserver);
            })
            , hackTimeout);
    }

    public static AddDocument(document: Document) {
        SocketStub.SEND_ADD_DOCUMENT(document);
    }
    public static AddDocumentField(doc: Document, key: Key, value: Field) {
        SocketStub.SEND_ADD_DOCUMENT_FIELD(doc, key, value);
    }
    public static DeleteDocumentField(doc: Document, key: Key) {
        SocketStub.SEND_DELETE_DOCUMENT_FIELD(doc, key);
    }
    public static UpdateField(field: Field) {
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
}

Server.Socket.on(MessageStore.Foo.Message, Server.connected);