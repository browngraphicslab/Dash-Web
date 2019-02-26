import { Document } from "../fields/Document";
import { Server } from "../Server";
import { KeyStore } from "../fields/Key";
import { TextField } from "../fields/TextField";
import { NumberField } from "../fields/NumberField";
import { ListField } from "../fields/ListField";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { CollectionSchemaView } from "../views/collections/CollectionSchemaView";
import { ImageField } from "../fields/ImageField";
import { ImageBox } from "../views/nodes/ImageBox";
import { CollectionFreeFormView } from "../views/collections/CollectionFreeFormView";
import { FIELD_ID } from "../fields/Field";

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
        // doc.SetField(KeyStore.Data, new RichTextField());
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


    let imageProtoId: FIELD_ID;
    function GetImagePrototype(): Document {
        if (imageProtoId === undefined) {
            let imageProto = new Document();
            imageProtoId = imageProto.Id;
            imageProto.Set(KeyStore.Title, new TextField("IMAGE PROTO"));
            imageProto.Set(KeyStore.X, new NumberField(0));
            imageProto.Set(KeyStore.Y, new NumberField(0));
            imageProto.Set(KeyStore.Width, new NumberField(300));
            imageProto.Set(KeyStore.Height, new NumberField(300));
            imageProto.Set(KeyStore.Layout, new TextField(ImageBox.LayoutString()));
            // imageProto.SetField(KeyStore.Layout, new TextField('<div style={"background-image: " + {Data}} />'));
            imageProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
            Server.AddDocument(imageProto);
            return imageProto;
        }
        return Server.GetDocument(imageProtoId, true)!;
    }

    //for PDF
    //let PDFProtoId: FIELD_ID;
    //function GetPDFPrototype(): Document {
        //if (PDFProtoId === undefined) {
            //let PDFProto = new Document();
            //PDFProtoId = PDFProto.Id;
            //PDFProto.Set(KeyStore.Title, new TextField("PDF PROTO"));
           // PDFProto.Set(KeyStore.X, new NumberField(0));
            //PDFProto.Set(KeyStore.Y, new NumberField(0));
            //PDFProto.Set(KeyStore.Width, new NumberField(300));
           // PDFProto.Set(KeyStore.Height, new NumberField(300));
           // PDFProto.Set(KeyStore.Layout, new TextField(PDFBox.LayoutString()));
            //PDFProto.Set(KeyStore.LayoutKeys, new ListField([KeyStore.Data]));
            //Server.AddDocument(PDFProto);
           // return PDFProto;
        //}
        //return Server.GetDocument(PDFProtoId, true)!;
    //}

    //export function PDFDocument(url: string, options: DocumentOptions = {}): Document{
        //let doc = GetPDFPrototype().MakeDelegate(); 
        //setupOptions(doc, options); 
        //doc.Set(KeyStore.Data, new PDFField(new URL(url))); 
        //Server.AddDocument(doc); 
        //return Server.GetDocument(doc.Id, true); 
    //}

    export function ImageDocument(url: string, options: DocumentOptions = {}): Document {
        let doc = GetImagePrototype().MakeDelegate();
        setupOptions(doc, options);
        doc.Set(KeyStore.Data, new ImageField(new URL(url)));
        Server.AddDocument(doc);
        return Server.GetDocument(doc.Id, true)!;
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
            collectionProto.Set(KeyStore.Layout, new TextField(CollectionFreeFormView.LayoutString()));
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