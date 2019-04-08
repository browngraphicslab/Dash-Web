import { AudioField } from "../../fields/AudioField";
import { Document } from "../../fields/Document";
import { Field } from "../../fields/Field";
import { HtmlField } from "../../fields/HtmlField";
import { ImageField } from "../../fields/ImageField";
import { InkField, StrokeData } from "../../fields/InkField";
import { Key } from "../../fields/Key";
import { KeyStore } from "../../fields/KeyStore";
import { ListField } from "../../fields/ListField";
import { PDFField } from "../../fields/PDFField";
import { TextField } from "../../fields/TextField";
import { VideoField } from "../../fields/VideoField";
import { WebField } from "../../fields/WebField";
import { HistogramField } from "../northstar/dash-fields/HistogramField";
import { HistogramBox } from "../northstar/dash-nodes/HistogramBox";
import { HistogramOperation } from "../northstar/operations/HistogramOperation";
import { Server } from "../Server";
import { CollectionPDFView } from "../views/collections/CollectionPDFView";
import { CollectionVideoView } from "../views/collections/CollectionVideoView";
import { CollectionView, CollectionViewType } from "../views/collections/CollectionView";
import { AudioBox } from "../views/nodes/AudioBox";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { ImageBox } from "../views/nodes/ImageBox";
import { KeyValueBox } from "../views/nodes/KeyValueBox";
import { PDFBox } from "../views/nodes/PDFBox";
import { VideoBox } from "../views/nodes/VideoBox";
import { WebBox } from "../views/nodes/WebBox";

export interface DocumentOptions {
    x?: number;
    y?: number;
    ink?: Map<string, StrokeData>;
    width?: number;
    height?: number;
    nativeWidth?: number;
    nativeHeight?: number;
    title?: string;
    panx?: number;
    pany?: number;
    page?: number;
    scale?: number;
    layout?: string;
    layoutKeys?: Key[];
    viewType?: number;
    backgroundColor?: string;
    copyDraggedItems?: boolean;
}

export namespace Documents {
    let textProto: Document;
    let histoProto: Document;
    let imageProto: Document;
    let webProto: Document;
    let collProto: Document;
    let kvpProto: Document;
    let videoProto: Document;
    let audioProto: Document;
    let pdfProto: Document;
    const textProtoId = "textProto";
    const histoProtoId = "histoProto";
    const pdfProtoId = "pdfProto";
    const imageProtoId = "imageProto";
    const webProtoId = "webProto";
    const collProtoId = "collectionProto";
    const kvpProtoId = "kvpProto";
    const videoProtoId = "videoProto"
    const audioProtoId = "audioProto";

    export function initProtos(): Promise<void> {
        return Server.GetFields([textProtoId, histoProtoId, collProtoId, imageProtoId, webProtoId, kvpProtoId]).then(fields => {
            textProto = fields[textProtoId] as Document;
            histoProto = fields[histoProtoId] as Document;
            collProto = fields[collProtoId] as Document;
            imageProto = fields[imageProtoId] as Document || CreateImagePrototype();
            webProto = fields[webProtoId] as Document;
            kvpProto = fields[kvpProtoId] as Document;
        });
    }
    function assignOptions(doc: Document, options: DocumentOptions): Document {
        if (options.nativeWidth !== undefined) { doc.SetNumber(KeyStore.NativeWidth, options.nativeWidth); }
        if (options.nativeHeight !== undefined) { doc.SetNumber(KeyStore.NativeHeight, options.nativeHeight); }
        if (options.title !== undefined) { doc.SetText(KeyStore.Title, options.title); }
        if (options.page !== undefined) { doc.SetNumber(KeyStore.Page, options.page); }
        if (options.scale !== undefined) { doc.SetNumber(KeyStore.Scale, options.scale); }
        if (options.viewType !== undefined) { doc.SetNumber(KeyStore.ViewType, options.viewType); }
        if (options.backgroundColor !== undefined) { doc.SetText(KeyStore.BackgroundColor, options.backgroundColor); }
        if (options.ink !== undefined) { doc.Set(KeyStore.Ink, new InkField(options.ink)); }
        if (options.layout !== undefined) { doc.SetText(KeyStore.Layout, options.layout); }
        if (options.layoutKeys !== undefined) { doc.Set(KeyStore.LayoutKeys, new ListField(options.layoutKeys)); }
        if (options.copyDraggedItems !== undefined) { doc.SetBoolean(KeyStore.CopyDraggedItems, options.copyDraggedItems); }
        return doc;
    }

    function assignToDelegate(doc: Document, options: DocumentOptions): Document {
        if (options.x !== undefined) { doc.SetNumber(KeyStore.X, options.x); }
        if (options.y !== undefined) { doc.SetNumber(KeyStore.Y, options.y); }
        if (options.width !== undefined) { doc.SetNumber(KeyStore.Width, options.width); }
        if (options.height !== undefined) { doc.SetNumber(KeyStore.Height, options.height); }
        if (options.panx !== undefined) { doc.SetNumber(KeyStore.PanX, options.panx); }
        if (options.pany !== undefined) { doc.SetNumber(KeyStore.PanY, options.pany); }
        return doc
    }

    function setupPrototypeOptions(protoId: string, title: string, layout: string, options: DocumentOptions): Document {
        return assignOptions(new Document(protoId), { ...options, title: title, layout: layout });
    }
    function SetInstanceOptions<T, U extends Field & { Data: T }>(doc: Document, options: DocumentOptions, value: [T, { new(): U }] | Document, id?: string) {
        var deleg = doc.MakeDelegate(id);
        if (value instanceof Document)
            deleg.Set(KeyStore.Data, value)
        else
            deleg.SetData(KeyStore.Data, value[0], value[1]);
        return assignOptions(deleg, options);
    }

    function CreateImagePrototype(): Document {
        let imageProto = setupPrototypeOptions(imageProtoId, "IMAGE_PROTO", CollectionView.LayoutString("AnnotationsKey"),
            { x: 0, y: 0, nativeWidth: 300, width: 300, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] });
        imageProto.SetText(KeyStore.BackgroundLayout, ImageBox.LayoutString());
        imageProto.SetNumber(KeyStore.CurPage, 0);
        return imageProto;
    }

    function GetHistogramPrototype(): Document {
        if (!histoProto) {
            histoProto = setupPrototypeOptions(histoProtoId, "HISTO PROTO", CollectionView.LayoutString("AnnotationsKey"),
                { x: 0, y: 0, width: 300, height: 300, backgroundColor: "black", layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] });
            histoProto.SetText(KeyStore.BackgroundLayout, HistogramBox.LayoutString());
        }
        return histoProto;
    }
    function GetTextPrototype(): Document {
        return textProto ? textProto :
            textProto = setupPrototypeOptions(textProtoId, "TEXT_PROTO", FormattedTextBox.LayoutString(),
                { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] });
    }
    function GetPdfPrototype(): Document {
        if (!pdfProto) {
            pdfProto = setupPrototypeOptions(pdfProtoId, "PDF_PROTO", CollectionPDFView.LayoutString("AnnotationsKey"),
                { x: 0, y: 0, nativeWidth: 1200, width: 300, layoutKeys: [KeyStore.Data, KeyStore.Annotations] });
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
                { panx: 0, pany: 0, scale: 1, width: 500, height: 500, layoutKeys: [KeyStore.Data] });
    }

    function GetKVPPrototype(): Document {
        return kvpProto ? kvpProto :
            kvpProto = setupPrototypeOptions(kvpProtoId, "KVP_PROTO", KeyValueBox.LayoutString(),
                { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] })
    }
    function GetVideoPrototype(): Document {
        if (!videoProto) {
            videoProto = setupPrototypeOptions(videoProtoId, "VIDEO_PROTO", CollectionVideoView.LayoutString("AnnotationsKey"),
                { x: 0, y: 0, nativeWidth: 600, width: 300, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] });
            videoProto.SetNumber(KeyStore.CurPage, 0);
            videoProto.SetText(KeyStore.BackgroundLayout, VideoBox.LayoutString());
        }
        return videoProto;
    }
    function GetAudioPrototype(): Document {
        return audioProto ? audioProto :
            audioProto = setupPrototypeOptions(audioProtoId, "AUDIO_PROTO", AudioBox.LayoutString(),
                { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] })
    }


    export function ImageDocument(url: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(imageProto, options, [new URL(url), ImageField]).MakeDelegate(), { ...options, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] });
        // let doc = SetInstanceOptions(GetImagePrototype(), { ...options, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] },
        //     [new URL(url), ImageField]);
        // doc.SetText(KeyStore.Caption, "my caption...");
        // doc.SetText(KeyStore.BackgroundLayout, EmbeddedCaption());
        // doc.SetText(KeyStore.OverlayLayout, FixedCaption());
        // return doc;
    }
    export function VideoDocument(url: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(GetVideoPrototype(), options, [new URL(url), VideoField]), options);
    }
    export function AudioDocument(url: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(GetAudioPrototype(), options, [new URL(url), AudioField]), options);
    }

    export function HistogramDocument(histoOp: HistogramOperation, options: DocumentOptions = {}, id?: string, delegId?: string) {
        return assignToDelegate(SetInstanceOptions(GetHistogramPrototype(), options, [histoOp, HistogramField], id).MakeDelegate(delegId), options);
    }
    export function TextDocument(options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(GetTextPrototype(), options, ["", TextField]).MakeDelegate(), options);
    }
    export function PdfDocument(url: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(GetPdfPrototype(), options, [new URL(url), PDFField]).MakeDelegate(), options);
    }
    export function WebDocument(url: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(GetWebPrototype(), options, [new URL(url), WebField]).MakeDelegate(), options);
    }
    export function HtmlDocument(html: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(GetWebPrototype(), options, [html, HtmlField]).MakeDelegate(), options);
    }
    export function KVPDocument(document: Document, options: DocumentOptions = {}, id?: string) {
        return assignToDelegate(SetInstanceOptions(GetKVPPrototype(), options, document, id), options)
    }
    export function FreeformDocument(documents: Array<Document>, options: DocumentOptions, id?: string, makePrototype: boolean = true) {
        if (!makePrototype) {
            return SetInstanceOptions(GetCollectionPrototype(), { ...options, viewType: CollectionViewType.Freeform }, [documents, ListField], id)
        }
        return assignToDelegate(SetInstanceOptions(GetCollectionPrototype(), { ...options, viewType: CollectionViewType.Freeform }, [documents, ListField], id).MakeDelegate(), options)
    }
    export function SchemaDocument(documents: Array<Document>, options: DocumentOptions, id?: string) {
        return assignToDelegate(SetInstanceOptions(GetCollectionPrototype(), { ...options, viewType: CollectionViewType.Schema }, [documents, ListField], id), options)
    }
    export function TreeDocument(documents: Array<Document>, options: DocumentOptions, id?: string) {
        return assignToDelegate(SetInstanceOptions(GetCollectionPrototype(), { ...options, viewType: CollectionViewType.Tree }, [documents, ListField], id), options)
    }
    export function DockDocument(config: string, options: DocumentOptions, id?: string) {
        return assignToDelegate(SetInstanceOptions(GetCollectionPrototype(), { ...options, viewType: CollectionViewType.Docking }, [config, TextField], id), options)
    }

    export function CaptionDocument(doc: Document) {
        const captionDoc = doc.CreateAlias();
        captionDoc.SetText(KeyStore.OverlayLayout, FixedCaption());
        captionDoc.SetNumber(KeyStore.Width, doc.GetNumber(KeyStore.Width, 0));
        captionDoc.SetNumber(KeyStore.Height, doc.GetNumber(KeyStore.Height, 0));
        return captionDoc;
    }

    // example of custom display string for an image that shows a caption.
    function EmbeddedCaption() {
        return `<div style="height:100%">
            <div style="position:relative; margin:auto; height:85%; width:85%;" >`
            + ImageBox.LayoutString() +
            `</div>
            <div style="position:relative; height:15%; text-align:center; ">`
            + FormattedTextBox.LayoutString("CaptionKey") +
            `</div> 
        </div>` };
    export function FixedCaption(fieldName: string = "Caption") {
        return `<div style="position:absolute; height:30px; bottom:0; width:100%">
            <div style="position:absolute; width:100%; height:100%; text-align:center;bottom:0;">`
            + FormattedTextBox.LayoutString(fieldName + "Key") +
            `</div> 
        </div>` };

    function OuterCaption() {
        return (`
<div>
    <div style="margin:auto; height:calc(100%); width:100%;">
        {layout}
    </div>
    <div style="height:(100% + 25px); width:100%; position:absolute">
        <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={"CaptionKey"} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
    </div>
</div>       
        `)
    }
    function InnerCaption() {
        return (`
    <div>
        <div style="margin:auto; height:calc(100% - 25px); width:100%;">
            {layout}
        </div>
        <div style="height:25px; width:100%; position:absolute">
            <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={"CaptionKey"} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
        </div>
    </div>       
            `)
    }

    /*

    this template requires an additional style setting on the collectionView-cont to make the layout relative
    
.collectionView-cont {
    position: relative;
    width: 100%;
    height: 100%;
}
    */
    function Percentaption() {
        return (`
    <div>
        <div style="margin:auto; height:85%; width:85%;">
            {layout}
        </div>
        <div style="height:15%; width:100%; position:absolute">
            <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={"CaptionKey"} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
        </div>
    </div>       
            `)
    }
}