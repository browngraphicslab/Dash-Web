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
import { MINIMIZED_ICON_SIZE } from "../views/globalCssVariables.scss";
import { IconBox } from "../views/nodes/IconBox";
import { Field, Doc, Opt } from "../../new_fields/Doc";
import { OmitKeys } from "../../Utils";
import { ImageField, VideoField, AudioField, PdfField, WebField } from "../../new_fields/URLField";
import { HtmlField } from "../../new_fields/HtmlField";
import { List } from "../../new_fields/List";
import { Cast, NumCast } from "../../new_fields/Types";
import { IconField } from "../../new_fields/IconField";
import { listSpec } from "../../new_fields/Schema";
import { DocServer } from "../DocServer";
import { InkField } from "../../new_fields/InkField";
import { dropActionType } from "../util/DragManager";
import { DateField } from "../../new_fields/DateField";
import { UndoManager } from "../util/UndoManager";
import { RouteStore } from "../../server/RouteStore";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
var requestImageSize = require('request-image-size');
var path = require('path');

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
    dbDoc?: Doc;
    // [key: string]: Opt<Field>;
}

export namespace Docs {

    export namespace Prototypes {

        // the complete list of document prototypes and their ids
        export let textProto: Doc; const textProtoId = "textProto";
        export let histoProto: Doc; const histoProtoId = "histoProto";
        export let imageProto: Doc; const imageProtoId = "imageProto";
        export let webProto: Doc; const webProtoId = "webProto";
        export let collProto: Doc; const collProtoId = "collectionProto";
        export let kvpProto: Doc; const kvpProtoId = "kvpProto";
        export let videoProto: Doc; const videoProtoId = "videoProto";
        export let audioProto: Doc; const audioProtoId = "audioProto";
        export let pdfProto: Doc; const pdfProtoId = "pdfProto";
        export let iconProto: Doc; const iconProtoId = "iconProto";

        /**
         * This function loads or initializes the prototype for each docment type.
         * 
         * This is an asynchronous function because it has to attempt
         * to fetch the prototype documents from the server.
         * 
         * Once we have this object that maps the prototype ids to a potentially
         * undefined document, we either initialize our private prototype
         * variables with the document returned from the server or, if prototypes
         * haven't been initialized, the newly initialized prototype document.
         */
        export async function initialize(): Promise<void> {
            // non-guid string ids for each document prototype
            let protoIds = [textProtoId, histoProtoId, collProtoId, imageProtoId, webProtoId, kvpProtoId, videoProtoId, audioProtoId, pdfProtoId, iconProtoId];
            // fetch the actual prototype documents from the server
            let actualProtos = await DocServer.getRefFields(protoIds);

            // initialize prototype documents
            textProto = actualProtos[textProtoId] as Doc || CreateTextProto();
            histoProto = actualProtos[histoProtoId] as Doc || CreateHistogramProto();
            collProto = actualProtos[collProtoId] as Doc || CreateCollectionProto();
            imageProto = actualProtos[imageProtoId] as Doc || CreateImageProto();
            webProto = actualProtos[webProtoId] as Doc || CreateWebProto();
            kvpProto = actualProtos[kvpProtoId] as Doc || CreateKVPProto();
            videoProto = actualProtos[videoProtoId] as Doc || CreateVideoProto();
            audioProto = actualProtos[audioProtoId] as Doc || CreateAudioProto();
            pdfProto = actualProtos[pdfProtoId] as Doc || CreatePdfProto();
            iconProto = actualProtos[iconProtoId] as Doc || CreateIconProto();
        }

        /**
         * This is a convenience method that is used to initialize
         * prototype documents for the first time.
         * 
         * @param protoId the id of the prototype, indicating the specific prototype
         * to initialize (see the *protoId list at the top of the namespace)
         * @param title the prototype document's title, follows *-PROTO
         * @param layout the layout key for this prototype and thus the
         * layout key that all delegates will inherit
         * @param options any value specified in the DocumentOptions object likewise
         * becomes the default value for that key for all delegates
         */
        function buildPrototype(protoId: string, title: string, layout: string, options: DocumentOptions): Doc {
            return Doc.assign(new Doc(protoId, true), { ...options, title: title, layout: layout, baseLayout: layout });
        }

        // INDIVIDUAL INITIALIZERS

        function CreateImageProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                nativeWidth: 600,
                width: 300,
                backgroundLayout: ImageBox.LayoutString(),
                curPage: 0
            };
            return buildPrototype(imageProtoId, "IMAGE_PROTO", CollectionView.LayoutString("annotations"), defaultAttrs);
        }

        function CreateHistogramProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                width: 300,
                height: 300,
                backgroundColor: "black",
                backgroundLayout:
                    HistogramBox.LayoutString()
            };
            return buildPrototype(histoProtoId, "HISTO PROTO", CollectionView.LayoutString("annotations"), defaultAttrs);
        }

        function CreateIconProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                width: Number(MINIMIZED_ICON_SIZE),
                height: Number(MINIMIZED_ICON_SIZE)
            };
            return buildPrototype(iconProtoId, "ICON_PROTO", IconBox.LayoutString(), defaultAttrs);
        }

        function CreateTextProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                width: 300,
                height: 150,
                backgroundColor: "#f1efeb"
            };
            return buildPrototype(textProtoId, "TEXT_PROTO", FormattedTextBox.LayoutString(), defaultAttrs);
        }

        function CreatePdfProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                nativeWidth: 1200,
                width: 300,
                backgroundLayout: PDFBox.LayoutString(),
                curPage: 1
            };
            return buildPrototype(pdfProtoId, "PDF_PROTO", CollectionPDFView.LayoutString("annotations"), defaultAttrs);
        }

        function CreateWebProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                width: 300,
                height: 300
            };
            return buildPrototype(webProtoId, "WEB_PROTO", WebBox.LayoutString(), defaultAttrs);
        }

        function CreateCollectionProto(): Doc {
            let defaultAttrs = {
                panX: 0,
                panY: 0,
                scale: 1,
                width: 500,
                height: 500
            };
            return buildPrototype(collProtoId, "COLLECTION_PROTO", CollectionView.LayoutString("data"), defaultAttrs);
        }

        function CreateKVPProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                width: 300,
                height: 150
            };
            return buildPrototype(kvpProtoId, "KVP_PROTO", KeyValueBox.LayoutString(), defaultAttrs);
        }

        function CreateVideoProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                nativeWidth: 600,
                width: 300,
                backgroundLayout: VideoBox.LayoutString(),
                curPage: 0
            };
            return buildPrototype(videoProtoId, "VIDEO_PROTO", CollectionVideoView.LayoutString("annotations"), defaultAttrs);
        }

        function CreateAudioProto(): Doc {
            let defaultAttrs = {
                x: 0,
                y: 0,
                width: 300,
                height: 150
            };
            return buildPrototype(audioProtoId, "AUDIO_PROTO", AudioBox.LayoutString(), defaultAttrs);
        }
    }

    /**
     * Encapsulates the factory used to create new document instances
     * delegated from top-level prototypes
     */
    export namespace Create {

        const delegateKeys = ["x", "y", "width", "height", "panX", "panY"];

        /**
         * This function receives the relevant document prototype and uses
         * it to create a new of that base-level prototype, or the
         * underlying data document, which it then delegates again 
         * to create the view document.
         * 
         * It also takes the opportunity to register the user
         * that created the document and the time of creation.
         * 
         * @param proto the specific document prototype off of which to model
         * this new instance (textProto, imageProto, etc.)
         * @param data the Field to store at this new instance's data key
         * @param options any initial values to provide for this new instance
         * @param delegId if applicable, an existing document id. If undefined, Doc's
         * constructor just generates a new GUID. This is currently used
         * only when creating a DockDocument from the current user's already existing
         * main document.
         */
        function CreateInstanceFromProto(proto: Doc, data: Field, options: DocumentOptions, delegId?: string) {
            const { omit: protoProps, extract: delegateProps } = OmitKeys(options, delegateKeys);

            if (!("author" in protoProps)) {
                protoProps.author = CurrentUserUtils.email;
            }

            if (!("creationDate" in protoProps)) {
                protoProps.creationDate = new DateField;
            }

            protoProps.isPrototype = true;

            let dataDoc = MakeDataDelegate(proto, protoProps, data);
            let viewDoc = Doc.MakeDelegate(dataDoc, delegId);

            return Doc.assign(viewDoc, delegateProps);
        }

        /**
         * This function receives the relevant top level document prototype
         * and models a new instance by delegating from it.
         * 
         * Note that it stores the data it recieves at the delegate's data key,
         * and applies any document options to this new delegate / instance.
         * @param proto the prototype from which to model this new delegate
         * @param options initial values to apply to this new delegate
         * @param value the data to store in this new delegate
         */
        function MakeDataDelegate<D extends Field>(proto: Doc, options: DocumentOptions, value: D) {
            const deleg = Doc.MakeDelegate(proto);
            deleg.data = value;
            return Doc.assign(deleg, options);
        }

        export function ImageDocument(url: string, options: DocumentOptions = {}) {
            let inst = CreateInstanceFromProto(Prototypes.imageProto, new ImageField(new URL(url)), { title: path.basename(url), ...options });
            requestImageSize(window.origin + RouteStore.corsProxy + "/" + url)
                .then((size: any) => {
                    let aspect = size.height / size.width;
                    if (!inst.proto!.nativeWidth) {
                        inst.proto!.nativeWidth = size.width;
                    }
                    inst.proto!.nativeHeight = Number(inst.proto!.nativeWidth!) * aspect;
                    inst.proto!.height = NumCast(inst.proto!.width) * aspect;
                })
                .catch((err: any) => console.log(err));
            return inst;

            // let doc = SetInstanceOptions(GetImagePrototype(), { ...options, layoutKeys: [KeyStore.Data, KeyStore.Annotations, KeyStore.Caption] },
            //     [new URL(url), ImageField]);
            // doc.SetText(KeyStore.Caption, "my caption...");
            // doc.SetText(KeyStore.BackgroundLayout, EmbeddedCaption());
            // doc.SetText(KeyStore.OverlayLayout, FixedCaption());
            // return doc;
        }

        export function VideoDocument(url: string, options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.videoProto, new VideoField(new URL(url)), options);
        }

        export function AudioDocument(url: string, options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.audioProto, new AudioField(new URL(url)), options);
        }

        export function HistogramDocument(histoOp: HistogramOperation, options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.histoProto, new HistogramField(histoOp), options);
        }

        export function TextDocument(options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.textProto, "", options);
        }

        export function IconDocument(icon: string, options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.iconProto, new IconField(icon), options);
        }

        export function PdfDocument(url: string, options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.pdfProto, new PdfField(new URL(url)), options);
        }

        export async function DBDocument(url: string, options: DocumentOptions = {}, columnOptions: DocumentOptions = {}) {
            let schemaName = options.title ? options.title : "-no schema-";
            let ctlog = await Gateway.Instance.GetSchema(url, schemaName);
            if (ctlog && ctlog.schemas) {
                let schema = ctlog.schemas[0];
                let schemaDoc = Docs.Create.TreeDocument([], { ...options, nativeWidth: undefined, nativeHeight: undefined, width: 150, height: 100, title: schema.displayName! });
                let schemaDocuments = Cast(schemaDoc.data, listSpec(Doc), []);
                if (!schemaDocuments) {
                    return;
                }
                CurrentUserUtils.AddNorthstarSchema(schema, schemaDoc);
                const docs = schemaDocuments;
                CurrentUserUtils.GetAllNorthstarColumnAttributes(schema).map(attr => {
                    DocServer.getRefField(attr.displayName! + ".alias").then(action((field: Opt<Field>) => {
                        if (field instanceof Doc) {
                            docs.push(field);
                        } else {
                            var atmod = new ColumnAttributeModel(attr);
                            let histoOp = new HistogramOperation(schema.displayName!,
                                new AttributeTransformationModel(atmod, AggregateFunction.None),
                                new AttributeTransformationModel(atmod, AggregateFunction.Count),
                                new AttributeTransformationModel(atmod, AggregateFunction.Count));
                            docs.push(Docs.Create.HistogramDocument(histoOp, { ...columnOptions, width: 200, height: 200, title: attr.displayName! }));
                        }
                    }));
                });
                return schemaDoc;
            }
            return Docs.Create.TreeDocument([], { width: 50, height: 100, title: schemaName });
        }

        export function WebDocument(url: string, options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.webProto, new WebField(new URL(url)), options);
        }

        export function HtmlDocument(html: string, options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.webProto, new HtmlField(html), options);
        }

        export function KVPDocument(document: Doc, options: DocumentOptions = {}) {
            return CreateInstanceFromProto(Prototypes.kvpProto, document, { title: document.title + ".kvp", ...options });
        }

        export function FreeformDocument(documents: Array<Doc>, options: DocumentOptions, makePrototype: boolean = true) {
            if (!makePrototype) {
                return MakeDataDelegate(Prototypes.collProto, { ...options, viewType: CollectionViewType.Freeform }, new List(documents));
            }
            return CreateInstanceFromProto(Prototypes.collProto, new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Freeform });
        }

        export function SchemaDocument(schemaColumns: string[], documents: Array<Doc>, options: DocumentOptions) {
            return CreateInstanceFromProto(Prototypes.collProto, new List(documents), { schemaColumns: new List(schemaColumns), ...options, viewType: CollectionViewType.Schema });
        }

        export function TreeDocument(documents: Array<Doc>, options: DocumentOptions) {
            return CreateInstanceFromProto(Prototypes.collProto, new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Tree });
        }

        export function StackingDocument(documents: Array<Doc>, options: DocumentOptions) {
            return CreateInstanceFromProto(Prototypes.collProto, new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Stacking });
        }

        export function DockDocument(documents: Array<Doc>, config: string, options: DocumentOptions, id?: string) {
            return CreateInstanceFromProto(Prototypes.collProto, new List(documents), { ...options, viewType: CollectionViewType.Docking, dockingConfig: config }, id);
        }

        export type DocConfig = {
            doc: Doc,
            initialWidth?: number
        };

        export function StandardCollectionDockingDocument(configs: Array<DocConfig>, options: DocumentOptions, id?: string, type: string = "row") {
            let layoutConfig = {
                content: [
                    {
                        type: type,
                        content: [
                            ...configs.map(config => CollectionDockingView.makeDocumentConfig(config.doc, config.initialWidth))
                        ]
                    }
                ]
            };
            return DockDocument(configs.map(c => c.doc), JSON.stringify(layoutConfig), options, id);
        }

        export function CaptionDocument(doc: Doc) {
            const captionDoc = Doc.MakeAlias(doc);
            captionDoc.overlayLayout = Templating.FixedCaption();
            captionDoc.width = Cast(doc.width, "number", 0);
            captionDoc.height = Cast(doc.height, "number", 0);
            return captionDoc;
        }
    }

    export namespace Templating {

        // example of custom display string for an image that shows a caption.
        export function EmbeddedCaption() {
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

        export function OuterCaption() {
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

        export function InnerCaption() {
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
        export function PercentCaption() {
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
}

export namespace DocUtils {

    export function MakeLink(source: Doc, target: Doc) {
        let protoSrc = source.proto ? source.proto : source;
        let protoTarg = target.proto ? target.proto : target;
        UndoManager.RunInBatch(() => {
            let linkDoc = Docs.Create.TextDocument({ width: 100, height: 30, borderRounding: -1 });
            //let linkDoc = new Doc;
            linkDoc.proto!.title = "-link name-";
            linkDoc.proto!.linkDescription = "";
            linkDoc.proto!.linkTags = "Default";

            linkDoc.proto!.linkedTo = target;
            linkDoc.proto!.linkedToPage = target.curPage;
            linkDoc.proto!.linkedFrom = source;
            linkDoc.proto!.linkedFromPage = source.curPage;

            let linkedFrom = Cast(protoTarg.linkedFromDocs, listSpec(Doc));
            if (!linkedFrom) {
                protoTarg.linkedFromDocs = linkedFrom = new List<Doc>();
            }
            linkedFrom.push(linkDoc);

            let linkedTo = Cast(protoSrc.linkedToDocs, listSpec(Doc));
            if (!linkedTo) {
                protoSrc.linkedToDocs = linkedTo = new List<Doc>();
            }
            linkedTo.push(linkDoc);
            return linkDoc;
        }, "make link");
    }

}