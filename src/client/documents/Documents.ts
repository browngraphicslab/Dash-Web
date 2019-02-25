import { Document } from "../../fields/Document";
import { Server } from "../Server";
import { KeyStore } from "../../fields/KeyStore";
import { TextField } from "../../fields/TextField";
import { NumberField } from "../../fields/NumberField";
import { ListField } from "../../fields/ListField";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { ImageField } from "../../fields/ImageField";
import { ImageBox } from "../views/nodes/ImageBox";
import { WebField } from "../../fields/WebField";
import { WebBox } from "../views/nodes/WebBox";
import { CollectionFreeFormView } from "../views/collections/CollectionFreeFormView";
import { FieldId } from "../../fields/Field";
import { CollectionView, CollectionViewType } from "../views/collections/CollectionView";
import { FieldView } from "../views/nodes/FieldView";

export interface DocumentOptions {
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
        Server.GetFields([collectionProtoId, textProtoId, imageProtoId], (fields) => {
            collectionProto = fields[collectionProtoId] as Document;
            imageProto = fields[imageProtoId] as Document;
            textProto = fields[textProtoId] as Document;
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
        // doc.Set(KeyStore.Data, new RichTextField());
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
            imageProto.Set(KeyStore.Width, new NumberField(300));
            imageProto.Set(KeyStore.Layout, new TextField(CollectionView.LayoutString("AnnotationsKey")));
            imageProto.SetNumber(KeyStore.ViewType, CollectionViewType.Freeform)
            imageProto.Set(KeyStore.BackgroundLayout, new TextField(ImageBox.LayoutString()));
            // imageProto.Set(KeyStore.Layout, new TextField('<div style={"background-image: " + {Data}} />'));
            imageProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data, KeyStore.Annotations]));
            return imageProto;
        }
        return imageProto;

    }

    // example of custom display string for an image that shows a caption.
    function EmbeddedCaption() {
        return `<div style="height:100%">
            <div style="position:relative; margin:auto; height:85%;" >`
            + ImageBox.LayoutString() +
            `</div>
            <div style="position:relative; overflow:auto; height:15%; text-align:center; ">`
            + FormattedTextBox.LayoutString("CaptionKey") +
            `</div> 
        </div>` };
    function FixedCaption() {
        return `<div style="position:absolute; height:30px; bottom:0; width:100%">
            <div style="position:absolute; width:100%; height:100%; overflow:auto;text-align:center;bottom:0;">`
            + FormattedTextBox.LayoutString("CaptionKey") +
            `</div> 
        </div>` };

    export function ImageDocument(url: string, options: DocumentOptions = {}): Document {
        let doc = GetImagePrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new ImageField(new URL(url)));
        doc.Set(KeyStore.Caption, new TextField("my caption..."));
        doc.Set(KeyStore.BackgroundLayout, new TextField(EmbeddedCaption()));
        doc.Set(KeyStore.OverlayLayout, new TextField(FixedCaption()));
        doc.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data, KeyStore.Annotations, KeyStore.Caption]));
        console.log("" + doc.GetNumber(KeyStore.Height, 311));
        return doc;
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
    const collectionProtoId = "collectionProto";
    function GetCollectionPrototype(): Document {
        if (!collectionProto) {
            collectionProto = new Document(collectionProtoId);
            collectionProto.Set(KeyStore.Scale, new NumberField(1));
            collectionProto.Set(KeyStore.PanX, new NumberField(0));
            collectionProto.Set(KeyStore.PanY, new NumberField(0));
            collectionProto.Set(KeyStore.Layout, new TextField(CollectionView.LayoutString("DataKey")));
            collectionProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
        }
        return collectionProto;
    }

    export function CollectionDocument(data: Array<Document> | string, viewType: CollectionViewType, options: DocumentOptions = {}, id?: string): Document {
        let doc = GetCollectionPrototype().MakeDelegate(id);
        setupOptions(doc, options);
        if (typeof data === "string") {
            doc.SetText(KeyStore.Data, data);
        } else {
            doc.SetData(KeyStore.Data, data, ListField);
        }
        doc.SetNumber(KeyStore.ViewType, viewType);
        return doc;
    }

    export function FreeformDocument(documents: Array<Document>, options: DocumentOptions, id?: string) {
        return CollectionDocument(documents, CollectionViewType.Freeform, options, id)
    }

    export function SchemaDocument(documents: Array<Document>, options: DocumentOptions, id?: string) {
        return CollectionDocument(documents, CollectionViewType.Schema, options, id)
    }

    export function DockDocument(config: string, options: DocumentOptions, id?: string) {
        return CollectionDocument(config, CollectionViewType.Docking, options, id)
    }
}