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
import { CollectionView, CollectionViewType } from "../views/collections/CollectionView";
import { HtmlField } from "../../fields/HtmlField";
import { Key } from "../../fields/Key"
import { Field } from "../../fields/Field";
import { KeyValueBox } from "../views/nodes/KeyValueBox"
import { KVPField } from "../../fields/KVPField";
import { VideoField } from "../../fields/VideoField"
import { VideoBox } from "../views/nodes/VideoBox";
import { AudioField } from "../../fields/AudioField";
import { AudioBox } from "../views/nodes/AudioBox";
import { PDFField } from "../../fields/PDFField";
import { PDFBox } from "../views/nodes/PDFBox";
import { CollectionPDFView } from "../views/collections/CollectionPDFView";
import { RichTextField } from "../../fields/RichTextField";

export interface DocumentOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    nativeWidth?: number;
    nativeHeight?: number;
    title?: string;
    panx?: number;
    pany?: number;
    scale?: number;
    layout?: string;
    layoutKeys?: Key[];
    viewType?: number;
}

export namespace Documents {
    let textProto: Document;
    let imageProto: Document;
    let webProto: Document;
    let collProto: Document;
    let kvpProto: Document;
    let videoProto: Document;
    let audioProto: Document;
    let pdfProto: Document;
    const textProtoId = "textProto";
    const pdfProtoId = "pdfProto";
    const imageProtoId = "imageProto";
    const webProtoId = "webProto";
    const collProtoId = "collectionProto";
    const kvpProtoId = "kvpProto";
    const videoProtoId = "videoProto"
    const audioProtoId = "audioProto";

    export function initProtos(mainDocId: string, callback: (mainDoc?: Document) => void) {
        Server.GetFields([collProtoId, textProtoId, imageProtoId, mainDocId], (fields) => {
            collProto = fields[collProtoId] as Document;
            imageProto = fields[imageProtoId] as Document;
            textProto = fields[textProtoId] as Document;
            webProto = fields[webProtoId] as Document;
            kvpProto = fields[kvpProtoId] as Document;
            callback(fields[mainDocId] as Document)
        });
    }
    function assignOptions(doc: Document, options: DocumentOptions): Document {
        if (options.x !== undefined) { doc.SetNumber(KeyStore.X, options.x); }
        if (options.y !== undefined) { doc.SetNumber(KeyStore.Y, options.y); }
        if (options.width !== undefined) { doc.SetNumber(KeyStore.Width, options.width); }
        if (options.height !== undefined) { doc.SetNumber(KeyStore.Height, options.height); }
        if (options.nativeWidth !== undefined) { doc.SetNumber(KeyStore.NativeWidth, options.nativeWidth); }
        if (options.nativeHeight !== undefined) { doc.SetNumber(KeyStore.NativeHeight, options.nativeHeight); }
        if (options.title !== undefined) { doc.SetText(KeyStore.Title, options.title); }
        if (options.panx !== undefined) { doc.SetNumber(KeyStore.PanX, options.panx); }
        if (options.pany !== undefined) { doc.SetNumber(KeyStore.PanY, options.pany); }
        if (options.scale !== undefined) { doc.SetNumber(KeyStore.Scale, options.scale); }
        if (options.viewType !== undefined) { doc.SetNumber(KeyStore.ViewType, options.viewType); }
        if (options.layout !== undefined) { doc.SetText(KeyStore.Layout, options.layout); }
        if (options.layoutKeys !== undefined) { doc.Set(KeyStore.LayoutKeys, new ListField(options.layoutKeys)); }
        return doc;
    }
    function setupPrototypeOptions(protoId: string, title: string, layout: string, options: DocumentOptions): Document {
        return assignOptions(new Document(protoId), { ...options, title: title, layout: layout });
    }
    function SetInstanceOptions<T, U extends Field & { Data: T }>(doc: Document, options: DocumentOptions, value: T, ctor: { new(): U }, id?: string) {
        var deleg = doc.MakeDelegate(id);
        deleg.SetData(KeyStore.Data, value, ctor);
        return assignOptions(deleg, options);
    }

    function GetImagePrototype(): Document {
        if (!imageProto) {
            imageProto = setupPrototypeOptions(imageProtoId, "IMAGE_PROTO", CollectionView.LayoutString("AnnotationsKey"),
                { x: 0, y: 0, nativeWidth: 300, width: 300, layoutKeys: [KeyStore.Data, KeyStore.Annotations] });
            imageProto.SetText(KeyStore.BackgroundLayout, ImageBox.LayoutString());
        }
        return imageProto;
    }
    function GetTextPrototype(): Document {
        return textProto ? textProto :
            textProto = setupPrototypeOptions(textProtoId, "TEXT_PROTO", FormattedTextBox.LayoutString(),
                { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] });
    }
    function GetPdfPrototype(): Document {
        if (!pdfProto) {
            pdfProto = setupPrototypeOptions(pdfProtoId, "PDF_PROTO", CollectionPDFView.LayoutString("AnnotationsKey"),
                { x: 0, y: 0, nativeWidth: 600, width: 300, layoutKeys: [KeyStore.Data, KeyStore.Annotations] });
            pdfProto.SetNumber(KeyStore.CurPage, 1);
            pdfProto.SetText(KeyStore.BackgroundLayout, PDFBox.LayoutString());
        }
        return pdfProto;
    }
    function GetWebPrototype(): Document {
        return webProto ? webProto :
            webProto = setupPrototypeOptions(webProtoId, "WEB_PROTO", WebBox.LayoutString(),
                { x: 0, y: 0, width: 300, height: 300, layoutKeys: [KeyStore.Data] });
    }
    function GetCollectionPrototype(): Document {
        return collProto ? collProto :
            collProto = setupPrototypeOptions(collProtoId, "COLLECTION_PROTO", CollectionView.LayoutString("DataKey"),
                { panx: 0, pany: 0, scale: 1, layoutKeys: [KeyStore.Data] });
    }

    function GetKVPPrototype(): Document {
        return kvpProto ? kvpProto :
            kvpProto = setupPrototypeOptions(kvpProtoId, "KVP_PROTO", KeyValueBox.LayoutString(),
                { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] })
    }
    function GetVideoPrototype(): Document {
        return videoProto ? videoProto :
            videoProto = setupPrototypeOptions(videoProtoId, "VIDEO_PROTO", VideoBox.LayoutString(),
                { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] })
    }
    function GetAudioPrototype(): Document {
        return audioProto ? audioProto :
            audioProto = setupPrototypeOptions(audioProtoId, "AUDIO_PROTO", AudioBox.LayoutString(),
                { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] })
    }


    export function ImageDocument(url: string, options: DocumentOptions = {}) {
        let doc = SetInstanceOptions(GetImagePrototype(), { ...options, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] },
            new URL(url), ImageField);
        doc.SetText(KeyStore.Caption, "my caption...");
        doc.SetText(KeyStore.BackgroundLayout, EmbeddedCaption());
        doc.SetText(KeyStore.OverlayLayout, FixedCaption());
        return doc;
    }
    export function VideoDocument(url: string, options: DocumentOptions = {}) {
        return SetInstanceOptions(GetVideoPrototype(), options, new URL(url), VideoField);
    }
    export function AudioDocument(url: string, options: DocumentOptions = {}) {
        return SetInstanceOptions(GetAudioPrototype(), options, new URL(url), AudioField);
    }
    export function TextDocument(options: DocumentOptions = {}) {
        return SetInstanceOptions(GetTextPrototype(), options, "", RichTextField);
    }
    export function PdfDocument(url: string, options: DocumentOptions = {}) {
        return SetInstanceOptions(GetPdfPrototype(), options, new URL(url), PDFField);
    }
    export function WebDocument(url: string, options: DocumentOptions = {}) {
        return SetInstanceOptions(GetWebPrototype(), options, new URL(url), WebField);
    }
    export function HtmlDocument(html: string, options: DocumentOptions = {}) {
        return SetInstanceOptions(GetWebPrototype(), options, html, HtmlField);
    }
    export function FreeformDocument(documents: Array<Document>, options: DocumentOptions, id?: string) {
        return SetInstanceOptions(GetCollectionPrototype(), { ...options, viewType: CollectionViewType.Freeform }, documents, ListField, id)
    }
    export function SchemaDocument(documents: Array<Document>, options: DocumentOptions, id?: string) {
        return SetInstanceOptions(GetCollectionPrototype(), { ...options, viewType: CollectionViewType.Schema }, documents, ListField, id)
    }
    export function DockDocument(config: string, options: DocumentOptions, id?: string) {
        return SetInstanceOptions(GetCollectionPrototype(), { ...options, viewType: CollectionViewType.Docking }, config, TextField, id)
    }
    export function KVPDocument(document: Document, options: DocumentOptions = {}, id?: string) {
        var deleg = GetKVPPrototype().MakeDelegate(id);
        deleg.Set(KeyStore.Data, document);
        return assignOptions(deleg, options);
    }

    // example of custom display string for an image that shows a caption.
    function EmbeddedCaption() {
        return `<div style="height:100%">
            <div style="position:relative; margin:auto; height:85%;" >`
            + ImageBox.LayoutString() +
            `</div>
            <div style="position:relative; height:15%; text-align:center; ">`
            + FormattedTextBox.LayoutString("CaptionKey") +
            `</div> 
        </div>` };
    function FixedCaption() {
        return `<div style="position:absolute; height:30px; bottom:0; width:100%">
            <div style="position:absolute; width:100%; height:100%; text-align:center;bottom:0;">`
            + FormattedTextBox.LayoutString("CaptionKey") +
            `</div> 
        </div>` };
}