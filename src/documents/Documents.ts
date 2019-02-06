import { Document } from "../fields/Document";
import { KeyStore } from "../fields/Key";
import { TextField } from "../fields/TextField";
import { NumberField } from "../fields/NumberField";
import { ListField } from "../fields/ListField";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { CollectionSchemaView } from "../views/collections/CollectionSchemaView";
import { ImageField } from "../fields/ImageField";
import { RichTextField } from "../fields/RichTextField";
import { ImageBox } from "../views/nodes/ImageBox";
import { CollectionFreeFormView } from "../views/collections/CollectionFreeFormView";

interface DocumentOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    title?: string;
}

export namespace Documents {
    function setupOptions(doc: Document, options: DocumentOptions): void {
        if (options.title) {
            doc.SetField(KeyStore.Title, new TextField(options.title));
        }
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
            textProto.SetField(KeyStore.Layout, new TextField(FormattedTextBox.LayoutString()));
            textProto.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return textProto;
    }

    export function TextDocument(options: DocumentOptions = {}): Document {
        let doc = GetTextPrototype().MakeDelegate();
        setupOptions(doc, options);
        // doc.SetField(KeyStore.Data, new RichTextField());
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
            imageProto.SetFieldValue(KeyStore.Title, "IMAGE PROTO", TextField);
            imageProto.SetFieldValue(KeyStore.X, 0, NumberField);
            imageProto.SetFieldValue(KeyStore.Y, 0, NumberField);
            imageProto.SetFieldValue(KeyStore.Width, 300, NumberField);
            imageProto.SetFieldValue(KeyStore.Height, 300, NumberField);
            imageProto.SetFieldValue(KeyStore.Layout, ImageBox.LayoutString(), TextField);
            // imageProto.SetField(KeyStore.Layout, new TextField('<div style={"background-image: " + {Data}} />'));
            imageProto.SetFieldValue(KeyStore.LayoutKeys, [KeyStore.Data], ListField);
            imageProto.SetFieldValue(KeyStore.Data, "", TextField); // bcz: just for testing purposes
        }
        return imageProto;
    }

    export function ImageDocument(url: string, options: DocumentOptions = {}): Document {
        let doc = GetImagePrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.SetFieldValue(KeyStore.Data, new URL(url), ImageField);
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
            collectionProto.SetField(KeyStore.Layout, new TextField(CollectionFreeFormView.LayoutString()));
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