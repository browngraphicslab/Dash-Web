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
import { Cast, NumCast, StrCast, ToConstructor, InterfaceValue, FieldValue } from "../../new_fields/Types";
import { IconField } from "../../new_fields/IconField";
import { listSpec } from "../../new_fields/Schema";
import { DocServer } from "../DocServer";
import { dropActionType } from "../util/DragManager";
import { DateField } from "../../new_fields/DateField";
import { UndoManager } from "../util/UndoManager";
import { RouteStore } from "../../server/RouteStore";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { LinkManager } from "../util/LinkManager";
import { DocumentManager } from "../util/DocumentManager";
import DirectoryImportBox from "../util/Import & Export/DirectoryImportBox";
import { Scripting } from "../util/Scripting";
var requestImageSize = require('../util/request-image-size');
var path = require('path');

export enum DocumentType {
    NONE = "none",
    TEXT = "text",
    HIST = "histogram",
    IMG = "image",
    WEB = "web",
    COL = "collection",
    KVP = "kvp",
    VID = "video",
    AUDIO = "audio",
    PDF = "pdf",
    ICON = "icon",
    IMPORT = "import",
    LINK = "link"
}

export interface DocumentOptions {
    x?: number;
    y?: number;
    type?: string;
    width?: number;
    height?: number;
    nativeWidth?: number;
    nativeHeight?: number;
    title?: string;
    panX?: number;
    panY?: number;
    page?: number;
    scale?: number;
    layout?: string;
    templates?: List<string>;
    viewType?: number;
    backgroundColor?: string;
    dropAction?: dropActionType;
    backgroundLayout?: string;
    curPage?: number;
    documentText?: string;
    borderRounding?: string;
    schemaColumns?: List<string>;
    dockingConfig?: string;
    dbDoc?: Doc;
    // [key: string]: Opt<Field>;
}

export namespace Docs {

    export namespace Prototypes {

        type LayoutSource = {
            LayoutString: (fieldKey?: string) => string
        };
        type PrototypeTemplate = {
            layout: {
                view: LayoutSource,
                collectionView?: LayoutSource
            },
            options?: Partial<DocumentOptions>
        };
        type TemplateMap = Map<DocumentType, PrototypeTemplate>;
        type PrototypeMap = Map<DocumentType, Doc>;

        const TemplateMap: TemplateMap = new Map([
            [DocumentType.TEXT, {
                layout: { view: FormattedTextBox },
                options: { height: 150, backgroundColor: "#f1efeb" }
            }],
            [DocumentType.HIST, {
                layout: { view: HistogramBox, collectionView: CollectionView },
                options: { height: 300, backgroundColor: "black" }
            }],
            [DocumentType.IMG, {
                layout: { view: ImageBox, collectionView: CollectionView },
                options: { nativeWidth: 600, curPage: 0 }
            }],
            [DocumentType.WEB, {
                layout: { view: WebBox },
                options: { height: 300 }
            }],
            [DocumentType.COL, {
                layout: { view: CollectionView },
                options: { panX: 0, panY: 0, scale: 1, width: 500, height: 500 }
            }],
            [DocumentType.KVP, {
                layout: { view: KeyValueBox },
                options: { height: 150 }
            }],
            [DocumentType.VID, {
                layout: { view: VideoBox, collectionView: CollectionVideoView },
                options: { nativeWidth: 600, curPage: 0 },
            }],
            [DocumentType.AUDIO, {
                layout: { view: AudioBox },
                options: { height: 150 }
            }],
            [DocumentType.PDF, {
                layout: { view: PDFBox, collectionView: CollectionPDFView },
                options: { nativeWidth: 1200, curPage: 1 }
            }],
            [DocumentType.ICON, {
                layout: { view: IconBox },
                options: { width: Number(MINIMIZED_ICON_SIZE), height: Number(MINIMIZED_ICON_SIZE) },
            }],
            [DocumentType.IMPORT, {
                layout: { view: DirectoryImportBox },
                options: { height: 150 }
            }]
        ]);

        // All document prototypes are initialized with at least these values
        const defaultOptions: DocumentOptions = { x: 0, y: 0, width: 300 };
        const Suffix = "Proto";

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
            let suffix = "Proto";
            let prototypeIds = Object.values(DocumentType).filter(type => type !== DocumentType.NONE).map(type => type + suffix);
            // fetch the actual prototype documents from the server
            let actualProtos = await DocServer.GetRefFields(prototypeIds);

            // update this object to include any default values: DocumentOptions for all prototypes
            prototypeIds.map(id => {
                let existing = actualProtos[id] as Doc;
                let type = id.replace(suffix, "") as DocumentType;
                // get or create prototype of the specified type...
                let target = existing || buildPrototype(type, id);
                // ...and set it if not undefined (can be undefined only if TemplateMap does not contain
                // an entry dedicated to the given DocumentType)
                target && PrototypeMap.set(type, target);
            });
        }

        /**
         * Retrieves the prototype for the given document type, or
         * undefined if that type's proto doesn't have a configuration
         * in the template map.
         * @param type 
         */
        const PrototypeMap: PrototypeMap = new Map();
        export function get(type: DocumentType): Doc {
            return PrototypeMap.get(type)!;
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
        function buildPrototype(type: DocumentType, prototypeId: string): Opt<Doc> {
            // load template from type
            let template = TemplateMap.get(type);
            if (!template) {
                return undefined;
            }
            let layout = template.layout;
            // create title
            let upper = Suffix.toUpperCase();
            let title = prototypeId.toUpperCase().replace(upper, `_${upper}`);
            // synthesize the default options, the type and title from computed values and
            // whatever options pertain to this specific prototype
            let options = { title: title, type: type, ...defaultOptions, ...(template.options || {}) };
            let primary = layout.view.LayoutString();
            let collectionView = layout.collectionView;
            if (collectionView) {
                options.layout = collectionView.LayoutString("annotations");
                options.backgroundLayout = primary;
            } else {
                options.layout = primary;
            }
            return Doc.assign(new Doc(prototypeId, true), { ...options, baseLayout: primary });
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
        export function InstanceFromProto(proto: Doc, data: Field, options: DocumentOptions, delegId?: string) {
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
            let inst = InstanceFromProto(Prototypes.get(DocumentType.IMG), new ImageField(new URL(url)), { title: path.basename(url), ...options });
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
        }

        export function VideoDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.VID), new VideoField(new URL(url)), options);
        }

        export function AudioDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.AUDIO), new AudioField(new URL(url)), options);
        }

        export function HistogramDocument(histoOp: HistogramOperation, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.HIST), new HistogramField(histoOp), options);
        }

        export function TextDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.TEXT), "", options);
        }

        export function IconDocument(icon: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.ICON), new IconField(icon), options);
        }

        export function PdfDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.PDF), new PdfField(new URL(url)), options);
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
                    DocServer.GetRefField(attr.displayName! + ".alias").then(action((field: Opt<Field>) => {
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
            return InstanceFromProto(Prototypes.get(DocumentType.WEB), new WebField(new URL(url)), options);
        }

        export function HtmlDocument(html: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.WEB), new HtmlField(html), options);
        }

        export function KVPDocument(document: Doc, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.KVP), document, { title: document.title + ".kvp", ...options });
        }

        export function FreeformDocument(documents: Array<Doc>, options: DocumentOptions, makePrototype: boolean = true) {
            if (!makePrototype) {
                return MakeDataDelegate(Prototypes.get(DocumentType.COL), { ...options, viewType: CollectionViewType.Freeform }, new List(documents));
            }
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Freeform });
        }

        export function SchemaDocument(schemaColumns: string[], documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { schemaColumns: new List(schemaColumns), ...options, viewType: CollectionViewType.Schema });
        }

        export function TreeDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Tree });
        }

        export function StackingDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { schemaColumns: new List(["title"]), ...options, viewType: CollectionViewType.Stacking });
        }

        export function DockDocument(documents: Array<Doc>, config: string, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, viewType: CollectionViewType.Docking, dockingConfig: config }, id);
        }

        export function DirectoryImportDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.IMPORT), new List<Doc>(), options);
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
                            ...configs.map(config => CollectionDockingView.makeDocumentConfig(config.doc, undefined, config.initialWidth))
                        ]
                    }
                ]
            };
            return DockDocument(configs.map(c => c.doc), JSON.stringify(layoutConfig), options, id);
        }
    }

    export namespace Get {

        export async function DocumentFromType(type: string, path: string, options: DocumentOptions): Promise<Opt<Doc>> {
            let ctor: ((path: string, options: DocumentOptions) => (Doc | Promise<Doc | undefined>)) | undefined = undefined;
            if (type.indexOf("image") !== -1) {
                ctor = Docs.Create.ImageDocument;
            }
            if (type.indexOf("video") !== -1) {
                ctor = Docs.Create.VideoDocument;
            }
            if (type.indexOf("audio") !== -1) {
                ctor = Docs.Create.AudioDocument;
            }
            if (type.indexOf("pdf") !== -1) {
                ctor = Docs.Create.PdfDocument;
                options.nativeWidth = 1200;
            }
            if (type.indexOf("excel") !== -1) {
                ctor = Docs.Create.DBDocument;
                options.dropAction = "copy";
            }
            if (type.indexOf("html") !== -1) {
                if (path.includes(window.location.hostname)) {
                    let s = path.split('/');
                    let id = s[s.length - 1];
                    return DocServer.GetRefField(id).then(field => {
                        if (field instanceof Doc) {
                            let alias = Doc.MakeAlias(field);
                            alias.x = options.x || 0;
                            alias.y = options.y || 0;
                            alias.width = options.width || 300;
                            alias.height = options.height || options.width || 300;
                            return alias;
                        }
                        return undefined;
                    });
                }
                ctor = Docs.Create.WebDocument;
                options = { height: options.width, ...options, title: path, nativeWidth: undefined };
            }
            return ctor ? ctor(path, options) : undefined;
        }

    }

    export namespace Templating {

        export function CaptionDocument(doc: Doc) {
            const captionDoc = Doc.MakeAlias(doc);
            captionDoc.overlayLayout = FixedCaption();
            captionDoc.width = Cast(doc.width, "number", 0);
            captionDoc.height = Cast(doc.height, "number", 0);
            return captionDoc;
        }

        /**
         * An example of custom display string for an image that shows a caption.
         */
        export function EmbeddedCaption() {
            return (
                `<div style="height:100%">
                    <div style="position:relative; margin:auto; height:85%; width:85%;" >${ImageBox.LayoutString()}</div>
                    <div style="position:relative; height:15%; text-align:center; ">${FormattedTextBox.LayoutString("caption")}</div> 
                </div>`
            );
        }

        export function FixedCaption(fieldName: string = "caption") {
            return (
                `<div style="position:absolute; height:30px; bottom:0; width:100%">
                    <div style="position:absolute; width:100%; height:100%; text-align:center;bottom:0;">${FormattedTextBox.LayoutString(fieldName)}</div> 
                </div>`
            );
        }

        export function OuterCaption() {
            return (`
                <div>
                    <div style="margin:auto; height:calc(100%); width:100%;">
                        {layout}
                    </div>
                    <div style="height:(100% + 25px); width:100%; position:absolute">
                        <FormattedTextBox
                            doc={Document}
                            DocumentViewForField={DocumentView}
                            bindings={bindings}
                            fieldKey={"caption"}
                            isSelected={isSelected}
                            select={select}
                            selectOnLoad={SelectOnLoad}
                            renderDepth={renderDepth
                        />
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
                        <FormattedTextBox
                            doc={Document}
                            DocumentViewForField={DocumentView}
                            bindings={bindings}
                            fieldKey={"caption"}
                            isSelected={isSelected}
                            select={select}
                            selectOnLoad={SelectOnLoad}
                            renderDepth={renderDepth
                        />
                    </div>
                </div>       
            `);
        }
    }
}

export namespace DocUtils {

    export function MakeLink(source: Doc, target: Doc, targetContext?: Doc, title: string = "", description: string = "", tags: string = "Default") {
        if (LinkManager.Instance.doesLinkExist(source, target)) return;
        let sv = DocumentManager.Instance.getDocumentView(source);
        if (sv && sv.props.ContainingCollectionView && sv.props.ContainingCollectionView.props.Document === target) return;
        if (target === CurrentUserUtils.UserDocument) return;

        UndoManager.RunInBatch(() => {
            let linkDoc = Docs.Create.TextDocument({ width: 100, height: 30, borderRounding: "100%" });
            linkDoc.type = DocumentType.LINK;
            let linkDocProto = Doc.GetProto(linkDoc);

            linkDocProto.context = targetContext;
            linkDocProto.title = title === "" ? source.title + " to " + target.title : title;
            linkDocProto.linkDescription = description;
            linkDocProto.linkTags = tags;
            linkDocProto.type = DocumentType.LINK;

            linkDocProto.anchor1 = source;
            linkDocProto.anchor1Page = source.curPage;
            linkDocProto.anchor1Groups = new List<Doc>([]);
            linkDocProto.anchor2 = target;
            linkDocProto.anchor2Page = target.curPage;
            linkDocProto.anchor2Groups = new List<Doc>([]);

            LinkManager.Instance.addLink(linkDoc);

            return linkDoc;
        }, "make link");
    }

}

Scripting.addGlobal("Docs", Docs);
