import { HistogramField } from "../northstar/dash-fields/HistogramField";
import { HistogramBox } from "../northstar/dash-nodes/HistogramBox";
import { HistogramOperation } from "../northstar/operations/HistogramOperation";
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
import { Template } from "../views/Templates";
import { MINIMIZED_ICON_SIZE } from "../views/globalCssVariables.scss";
import { IconBox } from "../views/nodes/IconBox";
import { Field, Doc, Opt } from "../../new_fields/Doc";
import { OmitKeys } from "../../Utils";
import { ImageField, VideoField, AudioField, PdfField, WebField } from "../../new_fields/URLField";
import { HtmlField } from "../../new_fields/HtmlField";
import { List } from "../../new_fields/List";
import { Cast } from "../../new_fields/Types";
import { IconField } from "../../new_fields/IconField";
import { listSpec } from "../../new_fields/Schema";
import { DocServer } from "../DocServer";
import { StrokeData, InkField } from "../../new_fields/InkField";
import { dropActionType } from "../util/DragManager";
import { DateField } from "../../new_fields/DateField";

export interface DocumentOptions {
    x?: number;
    y?: number;
    ink?: InkField;
    width?: number;
    height?: number;
    nativeWidth?: number;
    nativeHeight?: number;
    title?: string;
    panX?: number;
    panY?: number;
    page?: number;
    scale?: number;
    baseLayout?: string;
    layout?: string;
    templates?: List<string>;
    viewType?: number;
    backgroundColor?: string;
    dropAction?: dropActionType;
    backgroundLayout?: string;
    curPage?: number;
    documentText?: string;
    borderRounding?: number;
    schemaColumns?: List<string>;
    dockingConfig?: string;
    // [key: string]: Opt<Field>;
}
const delegateKeys = ["x", "y", "width", "height", "panX", "panY"];

export namespace Docs {
    let textProto: Doc;
    let histoProto: Doc;
    let imageProto: Doc;
    let webProto: Doc;
    let collProto: Doc;
    let kvpProto: Doc;
    let videoProto: Doc;
    let audioProto: Doc;
    let pdfProto: Doc;
    let iconProto: Doc;
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
        return DocServer.GetRefFields([textProtoId, histoProtoId, collProtoId, imageProtoId, webProtoId, kvpProtoId, videoProtoId, audioProtoId, pdfProtoId, iconProtoId]).then(fields => {
            textProto = fields[textProtoId] as Doc || CreateTextPrototype();
            histoProto = fields[histoProtoId] as Doc || CreateHistogramPrototype();
            collProto = fields[collProtoId] as Doc || CreateCollectionPrototype();
            imageProto = fields[imageProtoId] as Doc || CreateImagePrototype();
            webProto = fields[webProtoId] as Doc || CreateWebPrototype();
            kvpProto = fields[kvpProtoId] as Doc || CreateKVPPrototype();
            videoProto = fields[videoProtoId] as Doc || CreateVideoPrototype();
            audioProto = fields[audioProtoId] as Doc || CreateAudioPrototype();
            pdfProto = fields[pdfProtoId] as Doc || CreatePdfPrototype();
            iconProto = fields[iconProtoId] as Doc || CreateIconPrototype();
        });
    }

    function setupPrototypeOptions(protoId: string, title: string, layout: string, options: DocumentOptions): Doc {
        return Doc.assign(new Doc(protoId, true), { ...options, title: title, layout: layout, baseLayout: layout });
    }
    function SetInstanceOptions<U extends Field>(doc: Doc, options: DocumentOptions, value: U) {
        const deleg = Doc.MakeDelegate(doc);
        deleg.data = value;
        return Doc.assign(deleg, options);
    }
    function SetDelegateOptions<U extends Field>(doc: Doc, options: DocumentOptions) {
        const deleg = Doc.MakeDelegate(doc);
        return Doc.assign(deleg, options);
    }

    function CreateImagePrototype(): Doc {
        let imageProto = setupPrototypeOptions(imageProtoId, "IMAGE_PROTO", CollectionView.LayoutString("annotations"),
            { x: 0, y: 0, nativeWidth: 600, width: 300, backgroundLayout: ImageBox.LayoutString(), curPage: 0 });
        return imageProto;
    }

    function CreateHistogramPrototype(): Doc {
        let histoProto = setupPrototypeOptions(histoProtoId, "HISTO PROTO", CollectionView.LayoutString("annotations"),
            { x: 0, y: 0, width: 300, height: 300, backgroundColor: "black", backgroundLayout: HistogramBox.LayoutString() });
        return histoProto;
    }
    function CreateIconPrototype(): Doc {
        let iconProto = setupPrototypeOptions(iconProtoId, "ICON_PROTO", IconBox.LayoutString(),
            { x: 0, y: 0, width: Number(MINIMIZED_ICON_SIZE), height: Number(MINIMIZED_ICON_SIZE) });
        return iconProto;
    }
    function CreateTextPrototype(): Doc {
        let textProto = setupPrototypeOptions(textProtoId, "TEXT_PROTO", FormattedTextBox.LayoutString(),
            { x: 0, y: 0, width: 300, height: 150, backgroundColor: "#f1efeb" });
        return textProto;
    }
    function CreatePdfPrototype(): Doc {
        let pdfProto = setupPrototypeOptions(pdfProtoId, "PDF_PROTO", CollectionPDFView.LayoutString("annotations"),
            { x: 0, y: 0, nativeWidth: 1200, width: 300, backgroundLayout: PDFBox.LayoutString(), curPage: 1 });
        return pdfProto;
    }
    function CreateWebPrototype(): Doc {
        let webProto = setupPrototypeOptions(webProtoId, "WEB_PROTO", WebBox.LayoutString(),
            { x: 0, y: 0, width: 300, height: 300 });
        return webProto;
    }
    function CreateCollectionPrototype(): Doc {
        let collProto = setupPrototypeOptions(collProtoId, "COLLECTION_PROTO", CollectionView.LayoutString("data"),
            { panX: 0, panY: 0, scale: 1, width: 500, height: 500 });
        return collProto;
    }

    function CreateKVPPrototype(): Doc {
        let kvpProto = setupPrototypeOptions(kvpProtoId, "KVP_PROTO", KeyValueBox.LayoutString(),
            { x: 0, y: 0, width: 300, height: 150 });
        return kvpProto;
    }
    function CreateVideoPrototype(): Doc {
        let videoProto = setupPrototypeOptions(videoProtoId, "VIDEO_PROTO", CollectionVideoView.LayoutString("annotations"),
            { x: 0, y: 0, nativeWidth: 600, width: 300, backgroundLayout: VideoBox.LayoutString(), curPage: 0 });
        return videoProto;
    }
    function CreateAudioPrototype(): Doc {
        let audioProto = setupPrototypeOptions(audioProtoId, "AUDIO_PROTO", AudioBox.LayoutString(),
            { x: 0, y: 0, width: 300, height: 150 });
        return audioProto;
    }

    function CreateInstance(proto: Doc, data: Field, options: DocumentOptions) {
        const { omit: protoProps, extract: delegateProps } = OmitKeys(options, delegateKeys);
        if (!("author" in protoProps)) {
            protoProps.author = CurrentUserUtils.email;
        }
        if (!("creationDate" in protoProps)) {
            protoProps.creationDate = new DateField;
        }

        return SetDelegateOptions(SetInstanceOptions(proto, protoProps, data), delegateProps);
    }

    export function ImageDocument(url: string, options: DocumentOptions = {}) {
        return CreateInstance(imageProto, new ImageField(new URL(url)), options);
        // let doc = SetInstanceOptions(GetImagePrototype(), { ...options, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] },
        //     [new URL(url), ImageField]);
        // doc.SetText(KeyStore.Caption, "my caption...");
        // doc.SetText(KeyStore.BackgroundLayout, EmbeddedCaption());
        // doc.SetText(KeyStore.OverlayLayout, FixedCaption());
        // return doc;
    }
    export function VideoDocument(url: string, options: DocumentOptions = {}) {
        return CreateInstance(videoProto, new VideoField(new URL(url)), options);
    }
    export function AudioDocument(url: string, options: DocumentOptions = {}) {
        return CreateInstance(audioProto, new AudioField(new URL(url)), options);
    }

    export function HistogramDocument(histoOp: HistogramOperation, options: DocumentOptions = {}) {
        return CreateInstance(histoProto, new HistogramField(histoOp), options);
    }
    export function TextDocument(options: DocumentOptions = {}) {
        return CreateInstance(textProto, "", options);
    }
    export function IconDocument(icon: string, options: DocumentOptions = {}) {
        return CreateInstance(iconProto, new IconField(icon), options);
    }
    export function PdfDocument(url: string, options: DocumentOptions = {}) {
        return CreateInstance(pdfProto, new PdfField(new URL(url)), options);
    }
    export async function DBDocument(url: string, options: DocumentOptions = {}) {
        let schemaName = options.title ? options.title : "-no schema-";
        let ctlog = await Gateway.Instance.GetSchema(url, schemaName);
        if (ctlog && ctlog.schemas) {
            let schema = ctlog.schemas[0];
            let schemaDoc = Docs.TreeDocument([], { ...options, nativeWidth: undefined, nativeHeight: undefined, width: 150, height: 100, title: schema.displayName! });
            let schemaDocuments = Cast(schemaDoc.data, listSpec(Doc));
            if (!schemaDocuments) {
                return;
            }
            const docs = schemaDocuments;
            CurrentUserUtils.GetAllNorthstarColumnAttributes(schema).map(attr => {
                DocServer.GetRefField(attr.displayName! + ".alias").then(action((field: Opt<Field>) => {
                    if (field instanceof Doc) {
                        docs.push(field);
                    } else {
                        var atmod = new ColumnAttributeModel(attr);
                        let histoOp = new HistogramOperation(schema.displayName!,
                            new AttributeTransformationModel(atmod, AggregateFunction.None),
                            new AttributeTransformationModel(atmod, AggregateFunction.Count),
                            new AttributeTransformationModel(atmod, AggregateFunction.Count));
                        docs.push(Docs.HistogramDocument(histoOp, { width: 200, height: 200, title: attr.displayName! }));
                    }
                }));
            });
            return schemaDoc;
        }
        return Docs.TreeDocument([], { width: 50, height: 100, title: schemaName });
    }
    export function WebDocument(url: string, options: DocumentOptions = {}) {
        return CreateInstance(webProto, new WebField(new URL(url)), options);
    }
    export function HtmlDocument(html: string, options: DocumentOptions = {}) {
        return CreateInstance(webProto, new HtmlField(html), options);
    }
    export function KVPDocument(document: Doc, options: DocumentOptions = {}) {
        return CreateInstance(kvpProto, document, options);
    }
    export function FreeformDocument(documents: Array<Doc>, options: DocumentOptions, makePrototype: boolean = true) {
        if (!makePrototype) {
            return SetInstanceOptions(collProto, { ...options, viewType: CollectionViewType.Freeform }, new List(documents));
        }
        return CreateInstance(collProto, new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Freeform });
    }
    export function SchemaDocument(documents: Array<Doc>, options: DocumentOptions) {
        return CreateInstance(collProto, new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Schema });
    }
    export function TreeDocument(documents: Array<Doc>, options: DocumentOptions) {
        return CreateInstance(collProto, new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Tree });
    }
    export function DockDocument(documents: Array<Doc>, config: string, options: DocumentOptions) {
        return CreateInstance(collProto, new List(documents), { ...options, viewType: CollectionViewType.Docking, dockingConfig: config });
    }

    export function CaptionDocument(doc: Doc) {
        const captionDoc = Doc.MakeAlias(doc);
        captionDoc.overlayLayout = FixedCaption();
        captionDoc.width = Cast(doc.width, "number", 0);
        captionDoc.height = Cast(doc.height, "number", 0);
        return captionDoc;
    }

    // example of custom display string for an image that shows a caption.
    function EmbeddedCaption() {
        return `<div style="height:100%">
            <div style="position:relative; margin:auto; height:85%; width:85%;" >`
            + ImageBox.LayoutString() +
            `</div>
            <div style="position:relative; height:15%; text-align:center; ">`
            + FormattedTextBox.LayoutString("caption") +
            `</div> 
        </div>`;
    }
    export function FixedCaption(fieldName: string = "caption") {
        return `<div style="position:absolute; height:30px; bottom:0; width:100%">
            <div style="position:absolute; width:100%; height:100%; text-align:center;bottom:0;">`
            + FormattedTextBox.LayoutString(fieldName) +
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
        <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={"caption"} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
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
            <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={"caption"} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
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
            <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={"caption"} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
        </div>
    </div>       
            `);
    }
}