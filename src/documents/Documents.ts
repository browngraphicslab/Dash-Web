import { Document } from "../fields/Document";
import { KeyStore } from "../fields/Key";
import { TextField } from "../fields/TextField";
import { NumberField } from "../fields/NumberField";
import { ListField } from "../fields/ListField";
import { FieldTextBox } from "../views/nodes/FieldTextBox";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { CollectionSchemaView } from "../views/collections/CollectionSchemaView";
import { ImageBox } from "../views/nodes/ImageBox";

interface DocumentOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    title?: string;
}

export namespace Documents {
    function setupOptions(doc: Document, options: DocumentOptions): void {
        if (options.x) {
            doc.SetFieldValue(KeyStore.X, options.x, NumberField);
        }
        if (options.y) {
            doc.SetFieldValue(KeyStore.Y, options.y, NumberField);
        }
        if (options.width) {
            doc.SetFieldValue(KeyStore.Width, options.width, NumberField);
        }
        if (options.height) {
            doc.SetFieldValue(KeyStore.Height, options.height, NumberField);
        }
        if (options.title) {
            doc.SetFieldValue(KeyStore.Title, options.title, TextField);
        }
        doc.SetFieldValue(KeyStore.Scale, 1, NumberField);
        doc.SetFieldValue(KeyStore.PanX, 0, NumberField);
        doc.SetFieldValue(KeyStore.PanY, 0, NumberField);
    }

    let textProto: Document;
    function GetTextPrototype(): Document {
        if (!textProto) {
            textProto = new Document();
            textProto.SetField(KeyStore.X, new NumberField(0));
            textProto.SetField(KeyStore.Y, new NumberField(0));
            textProto.SetField(KeyStore.Width, new NumberField(300));
            textProto.SetField(KeyStore.Height, new NumberField(150));
            textProto.SetField(KeyStore.Layout, new TextField(FieldTextBox.LayoutString()));
            textProto.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return textProto;
    }

    export function TextDocument(text: string, options: DocumentOptions = {}): Document {
        let doc = GetTextPrototype().MakeDelegate();
        setupOptions(doc, options);
        // doc.SetField(KeyStore.Data, new TextField(text));
        return doc;
    }

    let schemaProto: Document;
    function GetSchemaPrototype(): Document {
        if (!schemaProto) {
            schemaProto = new Document();
            schemaProto.SetField(KeyStore.X, new NumberField(0));
            schemaProto.SetField(KeyStore.Y, new NumberField(0));
            schemaProto.SetField(KeyStore.Width, new NumberField(300));
            schemaProto.SetField(KeyStore.Height, new NumberField(150));
            schemaProto.SetField(KeyStore.Layout, new TextField(CollectionSchemaView.LayoutString()));
            schemaProto.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return schemaProto;
    }

    export function SchemaDocument(documents: Array<Document>, options: DocumentOptions = {}): Document {
        let doc = GetSchemaPrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.SetField(KeyStore.Data, new ListField(documents));
        return doc;
    }


    let dockProto: Document;
    function GetDockPrototype(): Document {
        if (!dockProto) {
            dockProto = new Document();
            dockProto.SetField(KeyStore.X, new NumberField(0));
            dockProto.SetField(KeyStore.Y, new NumberField(0));
            dockProto.SetField(KeyStore.Width, new NumberField(300));
            dockProto.SetField(KeyStore.Height, new NumberField(150));
            dockProto.SetField(KeyStore.Layout, new TextField(CollectionDockingView.LayoutString()));
            dockProto.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return dockProto;
    }

    export function DockDocument(documents: Array<Document>, options: DocumentOptions = {}): Document {
        let doc = GetDockPrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.SetField(KeyStore.Data, new ListField(documents));
        return doc;
    }


    let imageProto: Document;
    function GetImagePrototype(): Document {
        if (!imageProto) {
            imageProto = new Document();
            imageProto.SetField(KeyStore.X, new NumberField(0));
            imageProto.SetField(KeyStore.Y, new NumberField(0));
            imageProto.SetField(KeyStore.Width, new NumberField(300));
            imageProto.SetField(KeyStore.Height, new NumberField(300));
            imageProto.SetField(KeyStore.Layout, new TextField(ImageBox.LayoutString()));
            // imageProto.SetField(KeyStore.Layout, new TextField('<div style={"background-image: " + {Data}} />'));
            imageProto.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return imageProto;
    }

    export function ImageDocument(url: string, options: DocumentOptions = {}): Document {
        let doc = GetImagePrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.SetField(KeyStore.Data, new TextField(url));
        return doc;
    }

    let collectionProto: Document;
    function GetCollectionPrototype(): Document {
        if (!collectionProto) {
            collectionProto = new Document();
            collectionProto.SetField(KeyStore.X, new NumberField(0));
            collectionProto.SetField(KeyStore.Y, new NumberField(0));
            collectionProto.SetField(KeyStore.Scale, new NumberField(1));
            collectionProto.SetField(KeyStore.PanX, new NumberField(0));
            collectionProto.SetField(KeyStore.PanY, new NumberField(0));
            collectionProto.SetField(KeyStore.Width, new NumberField(300));
            collectionProto.SetField(KeyStore.Height, new NumberField(300));
            collectionProto.SetField(KeyStore.Layout, new TextField('<CollectionFreeFormView Document={Document} fieldKey={DataKey} ContainingDocumentView={ContainingDocumentView}/>'));
            collectionProto.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return collectionProto;
    }

    export function CollectionDocument(documents: Array<Document>, options: DocumentOptions = {}): Document {
        let doc = GetCollectionPrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.SetField(KeyStore.Data, new ListField(documents));
        return doc;
    }
}