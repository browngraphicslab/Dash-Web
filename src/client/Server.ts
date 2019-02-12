import { Field, FieldWaiting, FieldId, FIELD_WAITING, FieldValue, Opt } from "../fields/Field"
import { Key, KeyStore } from "../fields/Key"
import { ObservableMap, action } from "mobx";
import { Document } from "../fields/Document"
import { SocketStub } from "./SocketStub";

export class Server {
    private static ClientFieldsCached: ObservableMap<FieldId, Field | FIELD_WAITING> = new ObservableMap();

    // Retrieves the cached value of the field and sends a request to the server for the real value (if it's not cached).
    // Call this is from within a reaction and test whether the return value is FieldWaiting.
    // 'hackTimeout' is here temporarily for simplicity when debugging things.
    public static GetField(fieldid: FieldId, callback: (field: Field) => void = (f) => { }, hackTimeout: number = -1) {
        if (!this.ClientFieldsCached.get(fieldid)) {
            this.ClientFieldsCached.set(fieldid, FieldWaiting);
            //simulating a server call with a registered callback action
            SocketStub.SEND_FIELD_REQUEST(fieldid,
                action((field: Field) => callback(Server.cacheField(field))),
                hackTimeout);
        } else if (this.ClientFieldsCached.get(fieldid) != FieldWaiting) {
            callback(this.ClientFieldsCached.get(fieldid) as Field);
        }
        return this.ClientFieldsCached.get(fieldid);
    }

    static times = 0; // hack for testing
    public static GetDocumentField(doc: Document, key: Key): FieldValue<Field> {
        var hackTimeout: number = key == KeyStore.Data ? (this.times++ == 0 ? 5000 : 1000) : key == KeyStore.X ? 2500 : 500;

        let fieldId = doc._proxies.get(key);
        if (fieldId) {
            return this.GetField(fieldId,
                action((fieldfromserver: Field) => {
                    doc._proxies.delete(key);
                    doc.fields.set(key, fieldfromserver);
                })
                , hackTimeout);
        }
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
    public static SetFieldValue(field: Field, value: any) {
        SocketStub.SEND_SET_FIELD(field, value);
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
