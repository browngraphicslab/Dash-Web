import { HistogramField } from "../northstar/dash-fields/HistogramField";
import { HistogramBox } from "../northstar/dash-nodes/HistogramBox";
import { HistogramOperation } from "../northstar/operations/HistogramOperation";
import { CollectionView } from "../views/collections/CollectionView";
import { CollectionViewType } from "../views/collections/CollectionView";
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
import { OmitKeys, JSONUtils } from "../../Utils";
import { Field, Doc, Opt, DocListCastAsync } from "../../new_fields/Doc";
import { ImageField, VideoField, AudioField, PdfField, WebField, YoutubeField } from "../../new_fields/URLField";
import { HtmlField } from "../../new_fields/HtmlField";
import { List } from "../../new_fields/List";
import { Cast, NumCast } from "../../new_fields/Types";
import { IconField } from "../../new_fields/IconField";
import { listSpec } from "../../new_fields/Schema";
import { DocServer } from "../DocServer";
import { dropActionType } from "../util/DragManager";
import { DateField } from "../../new_fields/DateField";
import { UndoManager } from "../util/UndoManager";
import { YoutubeBox } from "../apis/youtube/YoutubeBox";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { LinkManager } from "../util/LinkManager";
import { DocumentManager } from "../util/DocumentManager";
import DirectoryImportBox from "../util/Import & Export/DirectoryImportBox";
import { Scripting, CompileScript } from "../util/Scripting";
import { ButtonBox } from "../views/nodes/ButtonBox";
import { FontIconBox } from "../views/nodes/FontIconBox";
import { SchemaHeaderField, RandomPastel } from "../../new_fields/SchemaHeaderField";
import { PresBox } from "../views/nodes/PresBox";
import { ComputedField, ScriptField } from "../../new_fields/ScriptField";
import { ProxyField } from "../../new_fields/Proxy";
import { DocumentType } from "./DocumentTypes";
import { LinkFollowBox } from "../views/linking/LinkFollowBox";
import { PresElementBox } from "../views/presentationview/PresElementBox";
import { QueryBox } from "../views/nodes/QueryBox";
import { ColorBox } from "../views/nodes/ColorBox";
import { DocuLinkBox } from "../views/nodes/DocuLinkBox";
import { InkingStroke } from "../views/InkingStroke";
import { InkField } from "../../new_fields/InkField";
var requestImageSize = require('../util/request-image-size');
var path = require('path');

export interface DocumentOptions {
    x?: number;
    y?: number;
    z?: number;
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
    fitWidth?: boolean;
    forceActive?: boolean;
    preventTreeViewOpen?: boolean; // ignores the treeViewOpen Doc flag which allows a treeViewItem's expande/collapse state to be independent of other views of the same document in the tree view
    layout?: string | Doc;
    hideHeadings?: boolean; // whether stacking view column headings should be hidden
    isTemplateField?: boolean;
    isTemplateDoc?: boolean;
    templates?: List<string>;
    viewType?: number;
    backgroundColor?: string;
    ignoreClick?: boolean;
    lockedPosition?: boolean; // lock the x,y coordinates of the document so that it can't be dragged
    lockedTransform?: boolean; // lock the panx,pany and scale parameters of the document so that it be panned/zoomed
    opacity?: number;
    defaultBackgroundColor?: string;
    dropAction?: dropActionType;
    chromeStatus?: string;
    columnWidth?: number;
    fontSize?: number;
    curPage?: number;
    currentTimecode?: number; // the current timecode of a time-based document (e.g., current time of a video)  value is in seconds
    displayTimecode?: number; // the time that a document should be displayed (e.g., time an annotation should be displayed on a video)
    documentText?: string;
    borderRounding?: string;
    boxShadow?: string;
    sectionFilter?: string; // field key used to determine headings for sections in stacking and masonry views
    schemaColumns?: List<SchemaHeaderField>;
    dockingConfig?: string;
    autoHeight?: boolean;
    removeDropProperties?: List<string>; // list of properties that should be removed from a document when it is dropped.  e.g., a creator button may be forceActive to allow it be dragged, but the forceActive property can be removed from the dropped document
    dbDoc?: Doc;
    ischecked?: ScriptField; // returns whether a font icon box is checked
    activePen?: Doc; // which pen document is currently active (used as the radio button state for the 'unhecked' pen tool scripts)
    onClick?: ScriptField;
    dragFactory?: Doc; // document to create when dragging with a suitable onDragStart script
    onDragStart?: ScriptField; //script to execute at start of drag operation --  e.g., when a "creator" button is dragged this script generates a different document to drop
    icon?: string;
    gridGap?: number; // gap between items in masonry view
    xMargin?: number; // gap between left edge of document and start of masonry/stacking layouts
    yMargin?: number; // gap between top edge of dcoument and start of masonry/stacking layouts
    sourcePanel?: Doc; // panel to display in 'targetContainer' as the result of a button onClick script
    targetContainer?: Doc; // document whose proto will be set to 'panel' as the result of a onClick click script
    dropConverter?: ScriptField; // script to run when documents are dropped on this Document.
    strokeWidth?: number;
    color?: string;
    // [key: string]: Opt<Field>;
}

class EmptyBox {
    public static LayoutString() {
        return "";
    }
}

export namespace Docs {

    export namespace Prototypes {

        type LayoutSource = { LayoutString: (key: string) => string };
        type PrototypeTemplate = {
            layout: {
                view: LayoutSource,
                dataField: string
            },
            options?: Partial<DocumentOptions>
        };
        type TemplateMap = Map<DocumentType, PrototypeTemplate>;
        type PrototypeMap = Map<DocumentType, Doc>;
        const data = "data";

        const TemplateMap: TemplateMap = new Map([
            [DocumentType.TEXT, {
                layout: { view: FormattedTextBox, dataField: data },
                options: { height: 150, backgroundColor: "#f1efeb", defaultBackgroundColor: "#f1efeb" }
            }],
            [DocumentType.HIST, {
                layout: { view: HistogramBox, dataField: data },
                options: { height: 300, backgroundColor: "black" }
            }],
            [DocumentType.QUERY, {
                layout: { view: QueryBox, dataField: data },
                options: { width: 400 }
            }],
            [DocumentType.COLOR, {
                layout: { view: ColorBox, dataField: data },
                options: { nativeWidth: 220, nativeHeight: 300 }
            }],
            [DocumentType.IMG, {
                layout: { view: ImageBox, dataField: data },
                options: {}
            }],
            [DocumentType.WEB, {
                layout: { view: WebBox, dataField: data },
                options: { height: 300 }
            }],
            [DocumentType.COL, {
                layout: { view: CollectionView, dataField: data },
                options: { panX: 0, panY: 0, scale: 1, width: 500, height: 500 }
            }],
            [DocumentType.KVP, {
                layout: { view: KeyValueBox, dataField: data },
                options: { height: 150 }
            }],
            [DocumentType.VID, {
                layout: { view: VideoBox, dataField: data },
                options: { currentTimecode: 0 },
            }],
            [DocumentType.AUDIO, {
                layout: { view: AudioBox, dataField: data },
                options: { height: 35, backgroundColor: "lightGray" }
            }],
            [DocumentType.PDF, {
                layout: { view: PDFBox, dataField: data },
                options: { nativeWidth: 1200, curPage: 1 }
            }],
            [DocumentType.ICON, {
                layout: { view: IconBox, dataField: data },
                options: { width: Number(MINIMIZED_ICON_SIZE), height: Number(MINIMIZED_ICON_SIZE) },
            }],
            [DocumentType.IMPORT, {
                layout: { view: DirectoryImportBox, dataField: data },
                options: { height: 150 }
            }],
            [DocumentType.LINKDOC, {
                data: new List<Doc>(),
                layout: { view: EmptyBox, dataField: data },
            }],
            [DocumentType.YOUTUBE, {
                layout: { view: YoutubeBox, dataField: data }
            }],
            [DocumentType.BUTTON, {
                layout: { view: ButtonBox, dataField: data },
            }],
            [DocumentType.PRES, {
                layout: { view: PresBox, dataField: data },
                options: {}
            }],
            [DocumentType.FONTICON, {
                layout: { view: FontIconBox, dataField: data },
                options: { width: 40, height: 40, borderRounding: "100%" },
            }],
            [DocumentType.LINKFOLLOW, {
                layout: { view: LinkFollowBox, dataField: data }
            }],
            [DocumentType.PRESELEMENT, {
                layout: { view: PresElementBox, dataField: data }
            }],
            [DocumentType.INK, {
                layout: { view: InkingStroke, dataField: data }
            }]
        ]);

        // All document prototypes are initialized with at least these values
        const defaultOptions: DocumentOptions = { x: 0, y: 0, width: 300 };
        const suffix = "Proto";

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
            ProxyField.initPlugin();
            ComputedField.initPlugin();
            // non-guid string ids for each document prototype
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
         * A collection of all links in the database.  Ideally, this would be a search, but for now all links are cached here.
         */
        export function MainLinkDocument() {
            return Prototypes.get(DocumentType.LINKDOC);
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
            let upper = suffix.toUpperCase();
            let title = prototypeId.toUpperCase().replace(upper, `_${upper}`);
            // synthesize the default options, the type and title from computed values and
            // whatever options pertain to this specific prototype
            let options = { title, type, baseProto: true, ...defaultOptions, ...(template.options || {}) };
            options.layout = layout.view.LayoutString(layout.dataField);
            return Doc.assign(new Doc(prototypeId, true), { ...options, baseLayout: options.layout });
        }

    }

    /**
     * Encapsulates the factory used to create new document instances
     * delegated from top-level prototypes
     */
    export namespace Create {

        const delegateKeys = ["x", "y", "width", "height", "panX", "panY", "nativeWidth", "nativeHeight", "dropAction", "forceActive", "fitWidth"];

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
        export function InstanceFromProto(proto: Doc, data: Field | undefined, options: DocumentOptions, delegId?: string) {
            const { omit: protoProps, extract: delegateProps } = OmitKeys(options, delegateKeys);

            if (!("author" in protoProps)) {
                protoProps.author = Doc.CurrentUserEmail;
            }

            if (!("creationDate" in protoProps)) {
                protoProps.creationDate = new DateField;
            }

            protoProps.isPrototype = true;

            let dataDoc = MakeDataDelegate(proto, protoProps, data);
            let viewDoc = Doc.MakeDelegate(dataDoc, delegId);

            AudioBox.ActiveRecordings.map(d => DocUtils.MakeLink({ doc: viewDoc }, { doc: d }, "audio link", "link to audio: " + d.title));

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
        function MakeDataDelegate<D extends Field>(proto: Doc, options: DocumentOptions, value?: D) {
            const deleg = Doc.MakeDelegate(proto);
            if (value !== undefined) {
                deleg.data = value;
            }
            return Doc.assign(deleg, options);
        }

        export function ImageDocument(url: string, options: DocumentOptions = {}) {
            let imgField = new ImageField(new URL(url));
            let inst = InstanceFromProto(Prototypes.get(DocumentType.IMG), imgField, { title: path.basename(url), ...options });
            let target = imgField.url.href;
            if (new RegExp(window.location.origin).test(target)) {
                let extension = path.extname(target);
                target = `${target.substring(0, target.length - extension.length)}_o${extension}`;
            }
            // if (target !== "http://www.cs.brown.edu/") {
            requestImageSize(target)
                .then((size: any) => {
                    let aspect = size.height / size.width;
                    if (!inst.nativeWidth) {
                        inst.nativeWidth = size.width;
                    }
                    inst.nativeHeight = NumCast(inst.nativeWidth) * aspect;
                    inst.height = NumCast(inst.width) * aspect;
                })
                .catch((err: any) => console.log(err));
            // }
            return inst;
        }
        export function PresDocument(initial: List<Doc> = new List(), options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.PRES), initial, options);
        }

        export function VideoDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.VID), new VideoField(new URL(url)), options);
        }

        export function YoutubeDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.YOUTUBE), new YoutubeField(new URL(url)), options);
        }

        export function AudioDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.AUDIO), new AudioField(new URL(url)), options);
        }

        export function HistogramDocument(histoOp: HistogramOperation, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.HIST), new HistogramField(histoOp), options);
        }

        export function QueryDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.QUERY), "", options);
        }

        export function ColorDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.COLOR), "", options);
        }

        export function TextDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.TEXT), "", options);
        }

        export function InkDocument(color: string, tool: number, strokeWidth: number, points: { x: number, y: number }[], options: DocumentOptions = {}) {
            let doc = InstanceFromProto(Prototypes.get(DocumentType.INK), new InkField(points), options);
            doc.color = color;
            doc.strokeWidth = strokeWidth;
            doc.tool = tool;
            return doc;
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

        export function FreeformDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, viewType: CollectionViewType.Freeform }, id);
        }

        export function LinearDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { chromeStatus: "collapsed", backgroundColor: "black", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, viewType: CollectionViewType.Linear }, id);
        }

        export function SchemaDocument(schemaColumns: SchemaHeaderField[], documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { chromeStatus: "collapsed", schemaColumns: new List(schemaColumns), ...options, viewType: CollectionViewType.Schema });
        }

        export function TreeDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, viewType: CollectionViewType.Tree });
        }

        export function StackingDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, viewType: CollectionViewType.Stacking });
        }

        export function MasonryDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, viewType: CollectionViewType.Masonry });
        }

        export function ButtonDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.BUTTON), undefined, { ...(options || {}) });
        }


        export function FontIconDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.FONTICON), undefined, { ...(options || {}) });
        }

        export function LinkFollowBoxDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.LINKFOLLOW), undefined, { ...(options || {}) });
        }

        export function PresElementBoxDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.PRESELEMENT), undefined, { ...(options || {}) });
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

        const primitives = ["string", "number", "boolean"];

        /**
         * This function takes any valid JSON(-like) data, i.e. parsed or unparsed, and at arbitrarily
         * deep levels of nesting, converts the data and structure into nested documents with the appropriate fields.
         * 
         * After building a hierarchy within / below a top-level document, it then returns that top-level parent.
         * 
         * If we've received a string, treat it like valid JSON and try to parse it into an object. If this fails, the
         * string is invalid JSON, so we should assume that the input is the result of a JSON.parse()
         * call that returned a regular string value to be stored as a Field.
         * 
         * If we've received something other than a string, since the caller might also pass in the results of a
         * JSON.parse() call, valid input might be an object, an array (still typeof object), a boolean or a number.
         * Anything else (like a function, etc. passed in naively as any) is meaningless for this operation.
         * 
         * All TS/JS objects get converted directly to documents, directly preserving the key value structure. Everything else,
         * lacking the key value structure, gets stored as a field in a wrapper document.
         * 
         * @param input for convenience and flexibility, either a valid JSON string to be parsed,
         * or the result of any JSON.parse() call.
         * @param title an optional title to give to the highest parent document in the hierarchy
         */
        export function DocumentHierarchyFromJson(input: any, title?: string): Opt<Doc> {
            if (input === undefined || input === null || ![...primitives, "object"].includes(typeof input)) {
                return undefined;
            }
            let parsed = input;
            if (typeof input === "string") {
                parsed = JSONUtils.tryParse(input);
            }
            let converted: Doc;
            if (typeof parsed === "object" && !(parsed instanceof Array)) {
                converted = convertObject(parsed, title);
            } else {
                (converted = new Doc).json = toField(parsed);
            }
            title && (converted.title = title);
            return converted;
        }

        /**
         * For each value of the object, recursively convert it to its appropriate field value
         * and store the field at the appropriate key in the document if it is not undefined
         * @param object the object to convert
         * @returns the object mapped from JSON to field values, where each mapping 
         * might involve arbitrary recursion (since toField might itself call convertObject)
         */
        const convertObject = (object: any, title?: string): Doc => {
            let target = new Doc(), result: Opt<Field>;
            Object.keys(object).map(key => (result = toField(object[key], key)) && (target[key] = result));
            title && !target.title && (target.title = title);
            return target;
        };

        /**
         * For each element in the list, recursively convert it to a document or other field 
         * and push the field to the list if it is not undefined
         * @param list the list to convert
         * @returns the list mapped from JSON to field values, where each mapping 
         * might involve arbitrary recursion (since toField might itself call convertList)
         */
        const convertList = (list: Array<any>): List<Field> => {
            let target = new List(), result: Opt<Field>;
            list.map(item => (result = toField(item)) && target.push(result));
            return target;
        };


        const toField = (data: any, title?: string): Opt<Field> => {
            if (data === null || data === undefined) {
                return undefined;
            }
            if (primitives.includes(typeof data)) {
                return data;
            }
            if (typeof data === "object") {
                return data instanceof Array ? convertList(data) : convertObject(data, title);
            }
            throw new Error(`How did ${data} of type ${typeof data} end up in JSON?`);
        };

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
                options.nativeHeight = 1200;
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
}

export namespace DocUtils {

    export function Publish(promoteDoc: Doc, targetID: string, addDoc: any, remDoc: any) {
        targetID = targetID.replace(/^-/, "").replace(/\([0-9]*\)$/, "");
        DocServer.GetRefField(targetID).then(doc => {
            if (promoteDoc !== doc) {
                let copy = doc as Doc;
                if (copy) {
                    Doc.Overwrite(promoteDoc, copy, true);
                } else {
                    copy = Doc.MakeCopy(promoteDoc, true, targetID);
                }
                !doc && (copy.title = undefined) && (Doc.GetProto(copy).title = targetID);
                addDoc && addDoc(copy);
                remDoc && remDoc(promoteDoc);
                if (!doc) {
                    DocListCastAsync(promoteDoc.links).then(links => {
                        links && links.map(async link => {
                            if (link) {
                                let a1 = await Cast(link.anchor1, Doc);
                                if (a1 && Doc.AreProtosEqual(a1, promoteDoc)) link.anchor1 = copy;
                                let a2 = await Cast(link.anchor2, Doc);
                                if (a2 && Doc.AreProtosEqual(a2, promoteDoc)) link.anchor2 = copy;
                                LinkManager.Instance.deleteLink(link);
                                LinkManager.Instance.addLink(link);
                            }
                        });
                    });
                }
            }
        });
    }

    export function MakeLink(source: { doc: Doc, ctx?: Doc }, target: { doc: Doc, ctx?: Doc }, title: string = "", description: string = "", id?: string) {
        let sv = DocumentManager.Instance.getDocumentView(source.doc);
        if (sv && sv.props.ContainingCollectionDoc === target.doc) return;
        if (target.doc === CurrentUserUtils.UserDocument) return undefined;

        let linkDocProto = new Doc(id, true);
        UndoManager.RunInBatch(() => {
            linkDocProto.type = DocumentType.LINK;

            linkDocProto.title = title === "" ? source.doc.title + " to " + target.doc.title : title;
            linkDocProto.linkDescription = description;
            linkDocProto.isPrototype = true;

            linkDocProto.anchor1 = source.doc;
            linkDocProto.anchor2 = target.doc;
            linkDocProto.anchor1Context = source.ctx;
            linkDocProto.anchor2Context = target.ctx;
            linkDocProto.anchor1Groups = new List<Doc>([]);
            linkDocProto.anchor2Groups = new List<Doc>([]);
            linkDocProto.anchor1Timecode = source.doc.currentTimecode;
            linkDocProto.anchor2Timecode = target.doc.currentTimecode;
            linkDocProto.layoutKey1 = DocuLinkBox.LayoutString("anchor1");
            linkDocProto.layoutKey2 = DocuLinkBox.LayoutString("anchor2");
            linkDocProto.width = linkDocProto.height = 0;
            linkDocProto.isBackground = true;
            linkDocProto.isButton = true;

            LinkManager.Instance.addLink(linkDocProto);

            Doc.GetProto(source.doc).links = ComputedField.MakeFunction("links(this)");
            Doc.GetProto(target.doc).links = ComputedField.MakeFunction("links(this)");
        }, "make link");
        return linkDocProto;
    }

}

Scripting.addGlobal("Docs", Docs);
