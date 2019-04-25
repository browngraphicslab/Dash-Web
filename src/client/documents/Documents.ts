import { AudioField } from "../../fields/AudioField";
import { Document } from "../../fields/Document";
import { Field, Opt } from "../../fields/Field";
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
import { CollectionView } from "../views/collections/CollectionView";
import { CollectionViewType } from "../views/collections/CollectionBaseView";
import { AudioBox } from "../views/nodes/AudioBox";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { ImageBox } from "../views/nodes/ImageBox";
import { KeyValueBox } from "../views/nodes/KeyValueBox";
import { PDFBox } from "../views/nodes/PDFBox";
import { VideoBox } from "../views/nodes/VideoBox";
import { WebBox } from "../views/nodes/WebBox";
import { Gateway } from "../northstar/manager/Gateway";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import { action } from "mobx";
import { ColumnAttributeModel } from "../northstar/core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../northstar/core/attribute/AttributeTransformationModel";
import { AggregateFunction } from "../northstar/model/idea/idea";
import { MINIMIZED_ICON_SIZE } from "../views/globalCssVariables.scss";
import { IconBox } from "../views/nodes/IconBox";
import { IconField } from "../../fields/IconFIeld";

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
    documentText?: string;
    borderRounding?: number;
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
    let iconProto: Document;
    const textProtoId = "textProto";
    const histoProtoId = "histoProto";
    const pdfProtoId = "pdfProto";
    const imageProtoId = "imageProto";
    const webProtoId = "webProto";
    const collProtoId = "collectionProto";
    const kvpProtoId = "kvpProto";
    const videoProtoId = "videoProto";
    const audioProtoId = "audioProto";
    const iconProtoId = "iconProto";

    export function initProtos(): Promise<void> {
        return Server.GetFields([textProtoId, histoProtoId, collProtoId, pdfProtoId, imageProtoId, videoProtoId, audioProtoId, webProtoId, kvpProtoId]).then(fields => {
            textProto = fields[textProtoId] as Document || CreateTextPrototype();
            histoProto = fields[histoProtoId] as Document || CreateHistogramPrototype();
            collProto = fields[collProtoId] as Document || CreateCollectionPrototype();
            imageProto = fields[imageProtoId] as Document || CreateImagePrototype();
            webProto = fields[webProtoId] as Document || CreateWebPrototype();
            kvpProto = fields[kvpProtoId] as Document || CreateKVPPrototype();
            videoProto = fields[videoProtoId] as Document || CreateVideoPrototype();
            audioProto = fields[audioProtoId] as Document || CreateAudioPrototype();
            pdfProto = fields[pdfProtoId] as Document || CreatePdfPrototype();
            iconProto = fields[iconProtoId] as Document || CreateIconPrototype();
        });
    }
    function assignOptions(doc: Document, options: DocumentOptions): Document {
        if (options.nativeWidth !== undefined) { doc.SetNumber(KeyStore.NativeWidth, options.nativeWidth); }
        if (options.nativeHeight !== undefined) { doc.SetNumber(KeyStore.NativeHeight, options.nativeHeight); }
        if (options.title !== undefined) { doc.SetText(KeyStore.Title, options.title); }
        if (options.page !== undefined) { doc.SetNumber(KeyStore.Page, options.page); }
        if (options.documentText !== undefined) { doc.SetText(KeyStore.DocumentText, options.documentText); }
        if (options.scale !== undefined) { doc.SetNumber(KeyStore.Scale, options.scale); }
        if (options.width !== undefined) { doc.SetNumber(KeyStore.Width, options.width); }
        if (options.height !== undefined) { doc.SetNumber(KeyStore.Height, options.height); }
        if (options.viewType !== undefined) { doc.SetNumber(KeyStore.ViewType, options.viewType); }
        if (options.backgroundColor !== undefined) { doc.SetText(KeyStore.BackgroundColor, options.backgroundColor); }
        if (options.ink !== undefined) { doc.Set(KeyStore.Ink, new InkField(options.ink)); }
        if (options.layout !== undefined) { doc.SetText(KeyStore.Layout, options.layout); }
        if (options.layoutKeys !== undefined) { doc.Set(KeyStore.LayoutKeys, new ListField(options.layoutKeys)); }
        if (options.copyDraggedItems !== undefined) { doc.SetBoolean(KeyStore.CopyDraggedItems, options.copyDraggedItems); }
        if (options.borderRounding !== undefined) { doc.SetNumber(KeyStore.BorderRounding, options.borderRounding); }
        return doc;
    }

    function assignToDelegate(doc: Document, options: DocumentOptions): Document {
        if (options.x !== undefined) { doc.SetNumber(KeyStore.X, options.x); }
        if (options.y !== undefined) { doc.SetNumber(KeyStore.Y, options.y); }
        if (options.width !== undefined) { doc.SetNumber(KeyStore.Width, options.width); }
        if (options.height !== undefined) { doc.SetNumber(KeyStore.Height, options.height); }
        if (options.panx !== undefined) { doc.SetNumber(KeyStore.PanX, options.panx); }
        if (options.pany !== undefined) { doc.SetNumber(KeyStore.PanY, options.pany); }
        return doc;
    }

    function setupPrototypeOptions(protoId: string, title: string, layout: string, options: DocumentOptions): Document {
        return assignOptions(new Document(protoId), { ...options, title: title, layout: layout });
    }
    function SetInstanceOptions<T, U extends Field & { Data: T }>(doc: Document, options: DocumentOptions, value: [T, { new(): U }] | Document, id?: string) {
        var deleg = doc.MakeDelegate(id);
        if (value instanceof Document) {
            deleg.Set(KeyStore.Data, value);
        }
        else {
            deleg.SetData(KeyStore.Data, value[0], value[1]);
        }
        return assignOptions(deleg, options);
    }

    function CreateImagePrototype(): Document {
        let imageProto = setupPrototypeOptions(imageProtoId, "IMAGE_PROTO", CollectionView.LayoutString("AnnotationsKey"),
            { x: 0, y: 0, nativeWidth: 600, width: 300, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] });
        imageProto.SetText(KeyStore.BackgroundLayout, ImageBox.LayoutString());
        imageProto.SetNumber(KeyStore.CurPage, 0);
        return imageProto;
    }

    function CreateHistogramPrototype(): Document {
        let histoProto = setupPrototypeOptions(histoProtoId, "HISTO PROTO", CollectionView.LayoutString("AnnotationsKey"),
            { x: 0, y: 0, width: 300, height: 300, backgroundColor: "black", layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] });
        histoProto.SetText(KeyStore.BackgroundLayout, HistogramBox.LayoutString());
        return histoProto;
    }
    function CreateIconPrototype(): Document {
        let iconProto = setupPrototypeOptions(iconProtoId, "ICON_PROTO", IconBox.LayoutString(),
            { x: 0, y: 0, width: Number(MINIMIZED_ICON_SIZE), height: Number(MINIMIZED_ICON_SIZE), layoutKeys: [KeyStore.Data] });
        return iconProto;
    }
    function CreateTextPrototype(): Document {
        let textProto = setupPrototypeOptions(textProtoId, "TEXT_PROTO", FormattedTextBox.LayoutString(),
            { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] });
        return textProto;
    }
    function CreatePdfPrototype(): Document {
        let pdfProto = setupPrototypeOptions(pdfProtoId, "PDF_PROTO", CollectionPDFView.LayoutString("AnnotationsKey"),
            { x: 0, y: 0, nativeWidth: 1200, width: 300, layoutKeys: [KeyStore.Data, KeyStore.Annotations] });
        pdfProto.SetNumber(KeyStore.CurPage, 1);
        pdfProto.SetText(KeyStore.BackgroundLayout, PDFBox.LayoutString());
        return pdfProto;
    }
    function CreateWebPrototype(): Document {
        let webProto = setupPrototypeOptions(webProtoId, "WEB_PROTO", WebBox.LayoutString(),
            { x: 0, y: 0, width: 300, height: 300, layoutKeys: [KeyStore.Data] });
        return webProto;
    }
    function CreateCollectionPrototype(): Document {
        let collProto = setupPrototypeOptions(collProtoId, "COLLECTION_PROTO", CollectionView.LayoutString("DataKey"),
            { panx: 0, pany: 0, scale: 1, width: 500, height: 500, layoutKeys: [KeyStore.Data] });
        return collProto;
    }

    function CreateKVPPrototype(): Document {
        let kvpProto = setupPrototypeOptions(kvpProtoId, "KVP_PROTO", KeyValueBox.LayoutString(),
            { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] });
        return kvpProto;
    }
    function CreateVideoPrototype(): Document {
        let videoProto = setupPrototypeOptions(videoProtoId, "VIDEO_PROTO", CollectionVideoView.LayoutString("AnnotationsKey"),
            { x: 0, y: 0, nativeWidth: 600, width: 300, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] });
        videoProto.SetNumber(KeyStore.CurPage, 0);
        videoProto.SetText(KeyStore.BackgroundLayout, VideoBox.LayoutString());
        return videoProto;
    }
    function CreateAudioPrototype(): Document {
        let audioProto = setupPrototypeOptions(audioProtoId, "AUDIO_PROTO", AudioBox.LayoutString(),
            { x: 0, y: 0, width: 300, height: 150, layoutKeys: [KeyStore.Data] });
        return audioProto;
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
        return assignToDelegate(SetInstanceOptions(videoProto, options, [new URL(url), VideoField]), options);
    }
    export function AudioDocument(url: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(audioProto, options, [new URL(url), AudioField]), options);
    }

    export function HistogramDocument(histoOp: HistogramOperation, options: DocumentOptions = {}, id?: string, delegId?: string) {
        return assignToDelegate(SetInstanceOptions(histoProto, options, [histoOp, HistogramField], id).MakeDelegate(delegId), options);
    }
    export function TextDocument(options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(textProto, options, ["", TextField]).MakeDelegate(), options);
    }
    export function IconDocument(icon: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(iconProto, { width: Number(MINIMIZED_ICON_SIZE), height: Number(MINIMIZED_ICON_SIZE), layoutKeys: [KeyStore.Data], layout: IconBox.LayoutString(), ...options }, [icon, IconField]), options);
    }
    export function PdfDocument(url: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(pdfProto, options, [new URL(url), PDFField]).MakeDelegate(), options);
    }
    export async function DBDocument(url: string, options: DocumentOptions = {}) {
        let schemaName = options.title ? options.title : "-no schema-";
        let ctlog = await Gateway.Instance.GetSchema(url, schemaName);
        if (ctlog && ctlog.schemas) {
            let schema = ctlog.schemas[0];
            let schemaDoc = Documents.TreeDocument([], { ...options, nativeWidth: undefined, nativeHeight: undefined, width: 150, height: 100, title: schema.displayName! });
            let schemaDocuments = schemaDoc.GetList(KeyStore.Data, [] as Document[]);
            CurrentUserUtils.GetAllNorthstarColumnAttributes(schema).map(attr => {
                Server.GetField(attr.displayName! + ".alias", action((field: Opt<Field>) => {
                    if (field instanceof Document) {
                        schemaDocuments.push(field);
                    } else {
                        var atmod = new ColumnAttributeModel(attr);
                        let histoOp = new HistogramOperation(schema.displayName!,
                            new AttributeTransformationModel(atmod, AggregateFunction.None),
                            new AttributeTransformationModel(atmod, AggregateFunction.Count),
                            new AttributeTransformationModel(atmod, AggregateFunction.Count));
                        schemaDocuments.push(Documents.HistogramDocument(histoOp, { width: 200, height: 200, title: attr.displayName! }, undefined, attr.displayName! + ".alias"));
                    }
                }));
            });
            return schemaDoc;
        }
        return Documents.TreeDocument([], { width: 50, height: 100, title: schemaName });
    }
    export function WebDocument(url: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(webProto, options, [new URL(url), WebField]).MakeDelegate(), options);
    }
    export function HtmlDocument(html: string, options: DocumentOptions = {}) {
        return assignToDelegate(SetInstanceOptions(webProto, options, [html, HtmlField]).MakeDelegate(), options);
    }
    export function KVPDocument(document: Document, options: DocumentOptions = {}, id?: string) {
        return assignToDelegate(SetInstanceOptions(kvpProto, options, document, id), options);
    }
    export function FreeformDocument(documents: Array<Document>, options: DocumentOptions, id?: string, makePrototype: boolean = true) {
        if (!makePrototype) {
            return SetInstanceOptions(collProto, { ...options, viewType: CollectionViewType.Freeform }, [documents, ListField], id);
        }
        return assignToDelegate(SetInstanceOptions(collProto, { ...options, viewType: CollectionViewType.Freeform }, [documents, ListField], id).MakeDelegate(), options);
    }
    export function SchemaDocument(documents: Array<Document>, options: DocumentOptions, id?: string) {
        return assignToDelegate(SetInstanceOptions(collProto, { ...options, viewType: CollectionViewType.Schema }, [documents, ListField], id), options);
    }
    export function TreeDocument(documents: Array<Document>, options: DocumentOptions, id?: string) {
        return assignToDelegate(SetInstanceOptions(collProto, { ...options, viewType: CollectionViewType.Tree }, [documents, ListField], id), options);
    }
    export function DockDocument(config: string, options: DocumentOptions, id?: string) {
        return assignToDelegate(SetInstanceOptions(collProto, { ...options, viewType: CollectionViewType.Docking }, [config, TextField], id), options);
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
        </div>`;
    }
    export function FixedCaption(fieldName: string = "Caption") {
        return `<div style="position:absolute; height:30px; bottom:0; width:100%">
            <div style="position:absolute; width:100%; height:100%; text-align:center;bottom:0;">`
            + FormattedTextBox.LayoutString(fieldName + "Key") +
            `</div> 
        </div>`;
    }

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
        `);
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
            `);
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
            `);
    }
}