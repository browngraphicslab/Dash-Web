import { Field, FieldWaiting, FIELD_ID, DOC_ID, FIELD_WAITING } from "./fields/Field"
import { Key, KeyStore } from "./fields/Key"
import { ObservableMap, computed, action, observable } from "mobx";
import { Document } from "./fields/Document"
import * as OpenSocket from 'socket.io-client';
import { Utils } from "./Utils";
import { MessageStore } from "./server/Message";

export class Server {
    static FieldStore: ObservableMap<FIELD_ID, Field> = new ObservableMap();
    static DocumentStore: ObservableMap<DOC_ID, ObservableMap<Key, FIELD_ID>> = new ObservableMap();
    static Socket: SocketIOClient.Socket = OpenSocket("http://localhost:8080")
    static GUID: string = Utils.GenerateGuid()

    public static ClientFieldsCached: ObservableMap<DOC_ID, Field | FIELD_WAITING> = new ObservableMap();

    // 'hack' is here temoporarily for simplicity when debugging things.
    // normally, you can't assume this will return a document since the server responds asynchronously 
    // and there might not actually be a matching document on the server.
    // the right way to call this is from within a reaction where you test whether the return value is FieldWaiting.
    public static GetDocument(docid: DOC_ID, hack: boolean = false) {
        if (!this.ClientFieldsCached.has(docid)) {
            this.SEND_DOCUMENT_REQUEST(docid, hack);
        }
        return this.ClientFieldsCached.get(docid) as Document;
    }
    public static AddDocument(document: Document) {
        // Replace with call to server
        this.DocumentStore.set(document.Id, new ObservableMap());
        document.fields.forEach((field, key) => {
            this.FieldStore.set((field as Field).Id, (field as Field));
            this.DocumentStore.get(document.Id)!.set(key, (field as Field).Id);
        });
    }
    public static AddDocumentField(doc: Document, key: Key, value: Field) {
        // Replace with call to server
        if (this.DocumentStore.get(doc.Id))
            this.DocumentStore.get(doc.Id)!.set(key, value.Id);
    }
    public static DeleteDocumentField(doc: Document, key: Key) {
        // Replace with call to server
        if (this.DocumentStore.get(doc.Id))
            this.DocumentStore.get(doc.Id)!.delete(key);
    }
    public static SetFieldValue(field: Field, value: any) {
        // Replace with call to server
        if (this.FieldStore.get(field.Id))
            this.FieldStore.get(field.Id)!.TrySetValue(value);
    }


    @action
    public static GetDocumentField(doc: Document, key: Key) {
        var fieldid = doc._proxies.get(key);
        if (!this.ClientFieldsCached.has(fieldid)) {
            this.ClientFieldsCached.set(fieldid, FieldWaiting);
            this.SEND_DOCUMENT_FIELD_REQUEST(doc, key, fieldid);
        }

        var field = this.ClientFieldsCached.get(fieldid);
        if (field != FieldWaiting) {
            doc._proxies.delete(key); // perhaps another document inquired the same field 
        }
        return field;
    }
    static times = 0; // hack for testing

    @action
    static cacheField(clientField: Field) {
        var cached = this.ClientFieldsCached.get(clientField.Id);
        if (!cached || cached == FieldWaiting) {
            this.ClientFieldsCached.set(clientField.Id, clientField);
        } else {
            // probably should overwrite the values within any field that was already here...
        }
        return this.ClientFieldsCached.get(clientField.Id) as Field;
    }

    public static SEND_DOCUMENT_FIELD_REQUEST(doc: Document, key: Key, fieldid: FIELD_ID) {
        //simulating a server call with a registered callback action
        setTimeout(() => this.receivedDocumentField(doc, key, fieldid, this.FieldStore.get(fieldid)),
            key == KeyStore.Data ? (this.times++ == 0 ? 5000 : 1000) : key == KeyStore.X ? 2500 : 500
        )
    }

    public static SEND_DOCUMENT_REQUEST(docid: DOC_ID, hack: boolean = false) {
        if (hack) { // temporary for debugging
            this.receivedDocument(docid, this.DocumentStore.get(docid)!)
        } else {
            //simulating a server call with a registered callback action
            setTimeout(() => this.receivedDocument(docid, this.DocumentStore.get(docid)!), 1500);
        }
    }

    @action
    static connected(message: string) {
        console.log(message)
        Server.Socket.emit("id", Server.GUID)
    }

    @action
    static receivedDocument(docid: DOC_ID, fieldlist: ObservableMap<Key, FIELD_ID>) {
        var cachedDoc = this.cacheField(new Document(docid));
        fieldlist!.forEach((field: FIELD_ID, key: Key) => (cachedDoc as Document)._proxies.set(key, field));
    }

    @action
    static receivedDocumentField(doc: Document, key: Key, fieldid: FIELD_ID, fieldfromserver: Field | undefined) {
        doc._proxies.delete(key);
        var cachedField = this.cacheField(fieldfromserver!);

        // if the field is a document and it wasn't already cached, then we need to inquire all of its fields from the server...
        if (cachedField instanceof Document && fieldfromserver! == cachedField) {
            this.SEND_DOCUMENT_REQUEST(cachedField.Id);
        }
        doc.fields.set(key, cachedField);
    }
}

Server.Socket.on(MessageStore.Handshake.Message, Server.connected);