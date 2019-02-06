import { Field, FieldWaiting, FIELD_ID, DOC_ID, FIELD_WAITING } from "./fields/Field"
import { Key, KeyStore } from "./fields/Key"
import { ObservableMap, computed, action, observable } from "mobx";
import { Document } from "./fields/Document"
import { TextField } from "./fields/TextField";

export class Server {
    static FieldStore: ObservableMap<FIELD_ID, Field> = new ObservableMap();
    static DocumentStore: ObservableMap<DOC_ID, ObservableMap<Key, FIELD_ID>> = new ObservableMap();
    public static ClientFieldsWaiting: ObservableMap<FIELD_ID, boolean> = new ObservableMap();
    public static ClientFieldsCached: ObservableMap<DOC_ID, Field | FIELD_WAITING> = new ObservableMap();

    public static GetDocument(docid: DOC_ID) {
        if (this.ClientFieldsCached.has(docid))
            return this.ClientFieldsCached.get(docid) as Document;

        if (this.DocumentStore.has(docid)) {
            var clientDoc = new Document(docid);
            this.cacheFieldInstance(clientDoc);
            return clientDoc;  // bcz: careful ... this assumes the document is on the server.  if it's not, the client will have a document with no backing store.
        }
    }

    public static AddDocument(document: Document) {
        this.DocumentStore.set(document.Id, new ObservableMap());
        document.fields.forEach((field, key) => {
            this.FieldStore.set((field as Field).Id, (field as Field));
            this.DocumentStore.get(document.Id)!.set(key, (field as Field).Id);
        });
    }
    public static AddDocumentField(doc: Document, key: Key, value: Field) {
        if (this.DocumentStore.get(doc.Id))
            this.DocumentStore.get(doc.Id)!.set(key, value.Id);
    }
    public static DeleteDocumentField(doc: Document, key: Key) {
        if (this.DocumentStore.get(doc.Id))
            this.DocumentStore.get(doc.Id)!.delete(key);
    }
    public static SetFieldValue(field: Field, value: any) {
        if (this.FieldStore.get(field.Id))
            this.FieldStore.get(field.Id)!.TrySetValue(value);
    }

    @action
    public static GetDocumentField(doc: Document, key: Key) {
        var fieldid = doc._proxies.get(key);
        if (!this.ClientFieldsCached.has(fieldid)) {
            this.ClientFieldsCached.set(fieldid, FieldWaiting);

            // replace this block with appropriate callback-style fetch code from actual server
            setTimeout(action(() => {
                var fieldfromserver = this.FieldStore.get(fieldid);
                this.ClientFieldsWaiting.delete(fieldid);
                doc._proxies.delete(key);
                fieldfromserver = this.cacheFieldInstance(fieldfromserver!);
                doc.fields.set(key, fieldfromserver);
            }),
                key == KeyStore.Data ? (this.times++ == 0 ? 5000 : 1000) : key == KeyStore.X ? 2500 : 500
            )
        }
        return this.ClientFieldsCached.get(fieldid);
    }
    static times = 0; // hack for testing

    @action
    static cacheFieldInstance(clientField: Field) {
        var cached = this.ClientFieldsCached.get(clientField.Id);
        if (!cached || cached == FieldWaiting) {
            this.ClientFieldsCached.set(clientField.Id, clientField);

            // if the field is a document, then we need to inquire all of its fields from the server...
            if (clientField instanceof Document) {
                clientField.Set(KeyStore.Title, new TextField(clientField.Title));
                setTimeout(action(() => {
                    var clientDocFields = this.DocumentStore.get(clientField.Id);
                    clientDocFields!.forEach((field: FIELD_ID, key: Key) => clientField._proxies.set(key, field));
                }
                ),
                    1500);
            }
        }
        return this.ClientFieldsCached.get(clientField.Id) as Field;
    }
}
