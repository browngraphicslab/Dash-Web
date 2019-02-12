import { Document } from "../fields/Document";
import { KeyStore } from "../fields/Key";
import { TextField } from "../fields/TextField";
import { NumberField } from "../fields/NumberField";
import { ListField } from "../fields/ListField";

interface DocumentOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

export namespace Documents {
    function setupOptions(doc: Document, options: DocumentOptions): void {
        if(options.x) {
            doc.SetFieldValue(KeyStore.X, options.x, NumberField);
        }
        if(options.y) {
            doc.SetFieldValue(KeyStore.Y, options.y, NumberField);
        }
        if(options.width) {
            doc.SetFieldValue(KeyStore.Width, options.width, NumberField);
        }
        if(options.height) {
            doc.SetFieldValue(KeyStore.Height, options.height, NumberField);
        }
    }

    let textProto:Document;
    function GetTextPrototype(): Document {
        if(!textProto) {
            textProto = new Document();
            textProto.SetField(KeyStore.X, new NumberField(0));
            textProto.SetField(KeyStore.Y, new NumberField(0));
            textProto.SetField(KeyStore.Width, new NumberField(300));
            textProto.SetField(KeyStore.Height, new NumberField(150));
            textProto.SetField(KeyStore.Layout, new TextField("<FieldTextBox doc={doc} fieldKey={DataKey} />"));
            textProto.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return textProto;
    }

    export function TextDocument(text: string, options:DocumentOptions = {}): Document {
        let doc = GetTextPrototype().MakeDelegate();
        setupOptions(doc, options);
        // doc.SetField(KeyStore.Data, new TextField(text));
        return doc;
    }

    let imageProto:Document;
    function GetImagePrototype(): Document {
        if(!imageProto) {
            imageProto = new Document();
            imageProto.SetField(KeyStore.X, new NumberField(0));
            imageProto.SetField(KeyStore.Y, new NumberField(0));
            imageProto.SetField(KeyStore.Width, new NumberField(300));
            imageProto.SetField(KeyStore.Height, new NumberField(300));
            imageProto.SetField(KeyStore.Layout, new TextField('<img src={Data} alt="Image not found"/>'));
            imageProto.SetField(KeyStore.LayoutFields, new ListField([KeyStore.Data]));
        }
        return imageProto;
    }

    export function ImageDocument(url: string, options:DocumentOptions = {}): Document {
        let doc = GetImagePrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.SetField(KeyStore.Data, new TextField(url));
        return doc;
    }

    let collectionProto:Document;
    function GetCollectionPrototype(): Document {
        if(!collectionProto) {
            collectionProto = new Document();
            collectionProto.SetField(KeyStore.X, new NumberField(150));
            collectionProto.SetField(KeyStore.Y, new NumberField(0));
            collectionProto.SetField(KeyStore.Width, new NumberField(300));
            collectionProto.SetField(KeyStore.Height, new NumberField(300));
            collectionProto.SetField(KeyStore.Layout, new TextField('<CollectionFreeFormView doc={doc} fieldKey={DataKey}/>'));
            collectionProto.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return collectionProto;
    }

    export function CollectionDocument( documents: Array<Document>, options:DocumentOptions = {}): Document {
        let doc = GetCollectionPrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.SetField(KeyStore.Data, new ListField(documents));
        return doc;
    }
}