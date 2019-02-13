import { Document } from "../../fields/Document";
import { Server } from "../Server";
import { KeyStore } from "../../fields/Key";
import { TextField } from "../../fields/TextField";
import { NumberField } from "../../fields/NumberField";
import { ListField } from "../../fields/ListField";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { CollectionSchemaView } from "../views/collections/CollectionSchemaView";
import { ImageField } from "../../fields/ImageField";
import { ImageBox } from "../views/nodes/ImageBox";
import { WebField } from "../../fields/WebField";
import { WebBox } from "../views/nodes/WebBox";
import { CollectionFreeFormView } from "../views/collections/CollectionFreeFormView";
import { FieldId } from "../../fields/Field";

interface DocumentOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    nativeWidth?: number;
    nativeHeight?: number;
    title?: string;
}

export namespace Documents {
    function setupOptions(doc: Document, options: DocumentOptions): void {
        if (options.x) {
            doc.SetData(KeyStore.X, options.x, NumberField);
        }
        if (options.y) {
            doc.SetData(KeyStore.Y, options.y, NumberField);
        }
        if (options.width) {
            doc.SetData(KeyStore.Width, options.width, NumberField);
        }
        if (options.height) {
            doc.SetData(KeyStore.Height, options.height, NumberField);
        }
        if (options.nativeWidth) {
            doc.SetData(KeyStore.NativeWidth, options.nativeWidth, NumberField);
        }
        if (options.nativeHeight) {
            doc.SetData(KeyStore.NativeHeight, options.nativeHeight, NumberField);
        }
        if (options.title) {
            doc.SetData(KeyStore.Title, options.title, TextField);
        }
        doc.SetData(KeyStore.Scale, 1, NumberField);
        doc.SetData(KeyStore.PanX, 0, NumberField);
        doc.SetData(KeyStore.PanY, 0, NumberField);
    }

    let textProto: Document;
    function GetTextPrototype(): Document {
        if (!textProto) {
            textProto = new Document();
            textProto.Set(KeyStore.X, new NumberField(0));
            textProto.Set(KeyStore.Y, new NumberField(0));
            textProto.Set(KeyStore.Width, new NumberField(300));
            textProto.Set(KeyStore.Height, new NumberField(150));
            textProto.Set(KeyStore.Layout, new TextField(FormattedTextBox.LayoutString()));
            textProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return textProto;
    }

    export function TextDocument(options: DocumentOptions = {}): Document {
        let doc = GetTextPrototype().MakeDelegate();
        setupOptions(doc, options);
        // doc.Set(KeyStore.Data, new RichTextField());
        return doc;
    }

    let schemaProto: Document;
    function GetSchemaPrototype(): Document {
        if (!schemaProto) {
            schemaProto = new Document();
            schemaProto.Set(KeyStore.X, new NumberField(0));
            schemaProto.Set(KeyStore.Y, new NumberField(0));
            schemaProto.Set(KeyStore.Width, new NumberField(300));
            schemaProto.Set(KeyStore.Height, new NumberField(150));
            schemaProto.Set(KeyStore.Layout, new TextField(CollectionSchemaView.LayoutString()));
            schemaProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return schemaProto;
    }

    export function SchemaDocument(documents: Array<Document>, options: DocumentOptions = {}): Document {
        let doc = GetSchemaPrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new ListField(documents));
        return doc;
    }


    let dockProto: Document;
    function GetDockPrototype(): Document {
        if (!dockProto) {
            dockProto = new Document();
            dockProto.Set(KeyStore.X, new NumberField(0));
            dockProto.Set(KeyStore.Y, new NumberField(0));
            dockProto.Set(KeyStore.Width, new NumberField(300));
            dockProto.Set(KeyStore.Height, new NumberField(150));
            dockProto.Set(KeyStore.Layout, new TextField(CollectionDockingView.LayoutString()));
            dockProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return dockProto;
    }

    export function DockDocument(documents: Array<Document>, options: DocumentOptions = {}): Document {
        let doc = GetDockPrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new ListField(documents));
        return doc;
    }


    let imageProtoId: FieldId;
    function GetImagePrototype(): Document {
        if (imageProtoId === undefined) {
            let imageProto = new Document();
            imageProtoId = imageProto.Id;
            imageProto.Set(KeyStore.Title, new TextField("IMAGE PROTO"));
            imageProto.Set(KeyStore.X, new NumberField(0));
            imageProto.Set(KeyStore.Y, new NumberField(0));
            imageProto.Set(KeyStore.NativeWidth, new NumberField(300));
            imageProto.Set(KeyStore.NativeHeight, new NumberField(300));
            imageProto.Set(KeyStore.Width, new NumberField(300));
            imageProto.Set(KeyStore.Height, new NumberField(300));
            imageProto.Set(KeyStore.Layout, new TextField(CollectionFreeFormView.LayoutString("AnnotationsKey")));
            imageProto.Set(KeyStore.BackgroundLayout, new TextField(ImageBox.LayoutString()));
            // imageProto.Set(KeyStore.Layout, new TextField('<div style={"background-image: " + {Data}} />'));
            imageProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data, KeyStore.Annotations]));
            Server.AddDocument(imageProto);
            return imageProto;
        }
        return Server.GetField(imageProtoId) as Document;
    }

    export function ImageDocument(url: string, options: DocumentOptions = {}): Document {
        let doc = GetImagePrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new ImageField(new URL(url)));

        let annotation = Documents.TextDocument({ title: "hello" });
        Server.AddDocument(annotation);
        doc.Set(KeyStore.Annotations, new ListField([annotation]));
        Server.AddDocument(doc);
        var sdoc = Server.GetField(doc.Id) as Document;
        return sdoc;
    }

    let webProtoId: FieldId;
    function GetWebPrototype(): Document {
        if (webProtoId === undefined) {
            let webProto = new Document();
            webProtoId = webProto.Id;
            webProto.Set(KeyStore.Title, new TextField("WEB PROTO"));
            webProto.Set(KeyStore.X, new NumberField(0));
            webProto.Set(KeyStore.Y, new NumberField(0));
            webProto.Set(KeyStore.NativeWidth, new NumberField(300));
            webProto.Set(KeyStore.NativeHeight, new NumberField(300));
            webProto.Set(KeyStore.Width, new NumberField(300));
            webProto.Set(KeyStore.Height, new NumberField(300));
            webProto.Set(KeyStore.Layout, new TextField(CollectionFreeFormView.LayoutString("AnnotationsKey")));
            webProto.Set(KeyStore.BackgroundLayout, new TextField(WebBox.LayoutString()));
            webProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data, KeyStore.Annotations]));
            Server.AddDocument(webProto);
            return webProto;
        }
        return Server.GetField(webProtoId) as Document;
    }

    export function WebDocument(url: string, options: DocumentOptions = {}): Document {
        let doc = GetWebPrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new WebField(new URL(url)));
        Server.AddDocument(doc);
        var sdoc = Server.GetField(doc.Id) as Document;
        console.log(sdoc);
        return sdoc;
    }

    let collectionProto: Document;
    function GetCollectionPrototype(): Document {
        if (!collectionProto) {
            collectionProto = new Document();
            collectionProto.Set(KeyStore.X, new NumberField(0));
            collectionProto.Set(KeyStore.Y, new NumberField(0));
            collectionProto.Set(KeyStore.Scale, new NumberField(1));
            collectionProto.Set(KeyStore.PanX, new NumberField(0));
            collectionProto.Set(KeyStore.PanY, new NumberField(0));
            collectionProto.Set(KeyStore.Width, new NumberField(300));
            collectionProto.Set(KeyStore.Height, new NumberField(300));
            collectionProto.Set(KeyStore.Layout, new TextField(CollectionFreeFormView.LayoutString("DataKey")));
            collectionProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return collectionProto;
    }

    export function CollectionDocument(documents: Array<Document>, options: DocumentOptions = {}): Document {
        let doc = GetCollectionPrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new ListField(documents));
        return doc;
    }
}