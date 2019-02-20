import { Document } from "../../fields/Document";
import { Server } from "../Server";
import { KeyStore } from "../../fields/KeyStore";
import { TextField } from "../../fields/TextField";
import { NumberField } from "../../fields/NumberField";
import { ListField } from "../../fields/ListField";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { CollectionSchemaView } from "../views/collections/CollectionSchemaView";
import { ImageField } from "../../fields/ImageField";
import { ImageBox } from "../views/nodes/ImageBox";
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
    export function initProtos(callback: () => void) {
        Server.GetFields([collectionProtoId, textProtoId, imageProtoId, schemaProtoId, dockProtoId], (fields) => {
            collectionProto = fields[collectionProtoId] as Document;
            imageProto = fields[imageProtoId] as Document;
            textProto = fields[textProtoId] as Document;
            dockProto = fields[dockProtoId] as Document;
            schemaProto = fields[schemaProtoId] as Document;
            callback()
        });
    }

    function setupOptions(doc: Document, options: DocumentOptions): void {
        if (options.x !== undefined) {
            doc.SetData(KeyStore.X, options.x, NumberField);
        }
        if (options.y !== undefined) {
            doc.SetData(KeyStore.Y, options.y, NumberField);
        }
        if (options.width !== undefined) {
            doc.SetData(KeyStore.Width, options.width, NumberField);
        }
        if (options.height !== undefined) {
            doc.SetData(KeyStore.Height, options.height, NumberField);
        }
        if (options.nativeWidth !== undefined) {
            doc.SetData(KeyStore.NativeWidth, options.nativeWidth, NumberField);
        }
        if (options.nativeHeight !== undefined) {
            doc.SetData(KeyStore.NativeHeight, options.nativeHeight, NumberField);
        }
        if (options.title !== undefined) {
            doc.SetData(KeyStore.Title, options.title, TextField);
        }
        doc.SetData(KeyStore.Scale, 1, NumberField);
        doc.SetData(KeyStore.PanX, 0, NumberField);
        doc.SetData(KeyStore.PanY, 0, NumberField);
    }

    let textProto: Document;
    const textProtoId = "textProto";
    function GetTextPrototype(): Document {
        if (!textProto) {
            textProto = new Document(textProtoId);
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
        // doc.SetField(KeyStore.Data, new RichTextField());
        return doc;
    }

    let schemaProto: Document;
    const schemaProtoId = "schemaProto";
    function GetSchemaPrototype(): Document {
        if (!schemaProto) {
            schemaProto = new Document(schemaProtoId);
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
    const dockProtoId = "dockProto";
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

    export function DockDocument(config: string, options: DocumentOptions = {}, id?: string): Document {
        let doc = GetDockPrototype().MakeDelegate(id);
        setupOptions(doc, options);
        doc.SetText(KeyStore.Data, config);
        return doc;
    }


    let imageProto: Document;
    const imageProtoId = "imageProto";
    function GetImagePrototype(): Document {
        if (!imageProto) {
            imageProto = new Document(imageProtoId);
            imageProto.Set(KeyStore.Title, new TextField("IMAGE PROTO"));
            imageProto.Set(KeyStore.X, new NumberField(0));
            imageProto.Set(KeyStore.Y, new NumberField(0));
            imageProto.Set(KeyStore.NativeWidth, new NumberField(300));
            imageProto.Set(KeyStore.NativeHeight, new NumberField(300));
            imageProto.Set(KeyStore.Width, new NumberField(300));
            imageProto.Set(KeyStore.Height, new NumberField(300));
            imageProto.Set(KeyStore.Layout, new TextField(CollectionFreeFormView.LayoutString("AnnotationsKey")));
            imageProto.Set(KeyStore.BackgroundLayout, new TextField(ImageBox.LayoutString()));
            // imageProto.SetField(KeyStore.Layout, new TextField('<div style={"background-image: " + {Data}} />'));
            imageProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data, KeyStore.Annotations]));
            return imageProto;
        }
        return imageProto;
    }

    export function ImageDocument(url: string, options: DocumentOptions = {}): Document {
        let doc = GetImagePrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new ImageField(new URL(url)));

        let annotation = Documents.TextDocument({ title: "hello" });
        doc.Set(KeyStore.Annotations, new ListField([annotation]));
        return doc;
    }

    let collectionProto: Document;
    const collectionProtoId = "collectionProto";
    function GetCollectionPrototype(): Document {
        if (!collectionProto) {
            collectionProto = new Document(collectionProtoId);
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

    export function CollectionDocument(documents: Array<Document>, options: DocumentOptions = {}, id?: string): Document {
        let doc = GetCollectionPrototype().MakeDelegate(id);
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new ListField(documents));
        return doc;
    }
}