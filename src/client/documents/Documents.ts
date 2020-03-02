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
import { OmitKeys, JSONUtils, Utils } from "../../Utils";
import { Field, Doc, Opt, DocListCastAsync, FieldResult, DocListCast } from "../../new_fields/Doc";
import { ImageField, VideoField, AudioField, PdfField, WebField, YoutubeField } from "../../new_fields/URLField";
import { HtmlField } from "../../new_fields/HtmlField";
import { List } from "../../new_fields/List";
import { Cast, NumCast, StrCast } from "../../new_fields/Types";
import { listSpec } from "../../new_fields/Schema";
import { DocServer } from "../DocServer";
import { dropActionType } from "../util/DragManager";
import { DateField } from "../../new_fields/DateField";
import { YoutubeBox } from "../apis/youtube/YoutubeBox";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { LinkManager } from "../util/LinkManager";
import { DocumentManager } from "../util/DocumentManager";
import DirectoryImportBox from "../util/Import & Export/DirectoryImportBox";
import { Scripting } from "../util/Scripting";
import { ButtonBox } from "../views/nodes/ButtonBox";
import { SliderBox } from "../views/nodes/SliderBox";
import { FontIconBox } from "../views/nodes/FontIconBox";
import { SchemaHeaderField } from "../../new_fields/SchemaHeaderField";
import { PresBox } from "../views/nodes/PresBox";
import { ComputedField, ScriptField } from "../../new_fields/ScriptField";
import { ProxyField } from "../../new_fields/Proxy";
import { DocumentType } from "./DocumentTypes";
import { RecommendationsBox } from "../views/RecommendationsBox";
//import { PresBox } from "../views/nodes/PresBox";
//import { PresField } from "../../new_fields/PresField";
import { PresElementBox } from "../views/presentationview/PresElementBox";
import { DashWebRTCVideo } from "../views/webcam/DashWebRTCVideo";
import { QueryBox } from "../views/nodes/QueryBox";
import { ColorBox } from "../views/nodes/ColorBox";
import { DocuLinkBox } from "../views/nodes/DocuLinkBox";
import { DocumentBox } from "../views/nodes/DocumentBox";
import { InkingStroke } from "../views/InkingStroke";
import { InkField } from "../../new_fields/InkField";
import { InkingControl } from "../views/InkingControl";
import { RichTextField } from "../../new_fields/RichTextField";
import { extname } from "path";
import { MessageStore } from "../../server/Message";
import { ContextMenuProps } from "../views/ContextMenuItem";
import { ContextMenu } from "../views/ContextMenu";
import { LinkBox } from "../views/nodes/LinkBox";
const requestImageSize = require('../util/request-image-size');
const path = require('path');

export interface DocumentOptions {
    _autoHeight?: boolean;
    _panX?: number;
    _panY?: number;
    _width?: number;
    _height?: number;
    _nativeWidth?: number;
    _nativeHeight?: number;
    _fitWidth?: boolean;
    _fitToBox?: boolean; // whether a freeformview should zoom/scale to create a shrinkwrapped view of its contents
    _LODdisable?: boolean;
    _showTitleHover?: string; // 
    _showTitle?: string; // which field to display in the title area.  leave empty to have no title
    _showCaption?: string; // which field to display in the caption area.  leave empty to have no caption
    _scrollTop?: number; // scroll location for pdfs
    _chromeStatus?: string;
    _viewType?: number;
    _gridGap?: number; // gap between items in masonry view
    _xMargin?: number; // gap between left edge of document and start of masonry/stacking layouts
    _yMargin?: number; // gap between top edge of dcoument and start of masonry/stacking layouts
    _xPadding?: number;
    _yPadding?: number;
    _itemIndex?: number; // which item index the carousel viewer is showing
    _showSidebar?: boolean;  //whether an annotationsidebar should be displayed for text docuemnts
    _singleLine?: boolean; // whether text document is restricted to a single line (carriage returns make new document)
    x?: number;
    y?: number;
    z?: number;
    dropAction?: dropActionType;
    childDropAction?: dropActionType;
    layoutKey?: string;
    type?: string;
    title?: string;
    page?: number;
    scale?: number;
    isDisplayPanel?: boolean; // whether the panel functions as GoldenLayout "stack" used to display documents
    forceActive?: boolean;
    layout?: string | Doc;
    hideHeadings?: boolean; // whether stacking view column headings should be hidden
    isTemplateForField?: string; // the field key for which the containing document is a rendering template
    isTemplateDoc?: boolean;
    templates?: List<string>;
    backgroundColor?: string | ScriptField;  // background color for data doc 
    _backgroundColor?: string | ScriptField; // background color for each template layout doc ( overrides backgroundColor )
    color?: string; // foreground color data doc
    _color?: string;  // foreground color for each template layout doc (overrides color)
    ignoreClick?: boolean;
    lockedPosition?: boolean; // lock the x,y coordinates of the document so that it can't be dragged
    lockedTransform?: boolean; // lock the panx,pany and scale parameters of the document so that it be panned/zoomed
    opacity?: number;
    defaultBackgroundColor?: string;
    isBackground?: boolean;
    isButton?: boolean;
    columnWidth?: number;
    fontSize?: number;
    curPage?: number;
    currentTimecode?: number; // the current timecode of a time-based document (e.g., current time of a video)  value is in seconds
    displayTimecode?: number; // the time that a document should be displayed (e.g., time an annotation should be displayed on a video)
    borderRounding?: string;
    boxShadow?: string;
    sectionFilter?: string; // field key used to determine headings for sections in stacking and masonry views
    schemaColumns?: List<SchemaHeaderField>;
    dockingConfig?: string;
    annotationOn?: Doc;
    removeDropProperties?: List<string>; // list of properties that should be removed from a document when it is dropped.  e.g., a creator button may be forceActive to allow it be dragged, but the forceActive property can be removed from the dropped document
    dbDoc?: Doc;
    linkRelationship?: string; // type of relatinoship a link represents
    ischecked?: ScriptField; // returns whether a font icon box is checked
    activePen?: Doc; // which pen document is currently active (used as the radio button state for the 'unhecked' pen tool scripts)
    onClick?: ScriptField;
    onChildClick?: ScriptField; // script given to children of a collection to execute when they are clicked
    onPointerDown?: ScriptField;
    onPointerUp?: ScriptField;
    dropConverter?: ScriptField; // script to run when documents are dropped on this Document.
    dragFactory?: Doc; // document to create when dragging with a suitable onDragStart script
    onDragStart?: ScriptField; //script to execute at start of drag operation --  e.g., when a "creator" button is dragged this script generates a different document to drop
    clipboard?: Doc;
    icon?: string;
    sourcePanel?: Doc; // panel to display in 'targetContainer' as the result of a button onClick script
    targetContainer?: Doc; // document whose proto will be set to 'panel' as the result of a onClick click script
    strokeWidth?: number;
    treeViewPreventOpen?: boolean; // ignores the treeViewOpen Doc flag which allows a treeViewItem's expand/collapse state to be independent of other views of the same document in the tree view
    treeViewHideTitle?: boolean; // whether to hide the title of a tree view
    treeViewHideHeaderFields?: boolean; // whether to hide the drop down options for tree view items.
    treeViewOpen?: boolean; // whether this document is expanded in a tree view
    treeViewChecked?: ScriptField; // script to call when a tree view checkbox is checked
    isFacetFilter?: boolean; // whether document functions as a facet filter in a tree view
    limitHeight?: number; // maximum height for newly created (eg, from pasting) text documents
    // [key: string]: Opt<Field>;
    pointerHack?: boolean; // for buttons, allows onClick handler to fire onPointerDown
    textTransform?: string; // is linear view expanded
    letterSpacing?: string; // is linear view expanded
    flexDirection?: "unset" | "row" | "column" | "row-reverse" | "column-reverse";
    selectedIndex?: number;
    syntaxColor?: string; // can be applied to text for syntax highlighting all matches in the text
    linearViewIsExpanded?: boolean; // is linear view expanded
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
                options: { _height: 150, _xMargin: 10, _yMargin: 10 }
            }],
            [DocumentType.HIST, {
                layout: { view: HistogramBox, dataField: data },
                options: { _height: 300, backgroundColor: "black" }
            }],
            [DocumentType.QUERY, {
                layout: { view: QueryBox, dataField: data },
                options: { _width: 400 }
            }],
            [DocumentType.COLOR, {
                layout: { view: ColorBox, dataField: data },
                options: { _nativeWidth: 220, _nativeHeight: 300 }
            }],
            [DocumentType.IMG, {
                layout: { view: ImageBox, dataField: data },
                options: {}
            }],
            [DocumentType.WEB, {
                layout: { view: WebBox, dataField: data },
                options: { _height: 300 }
            }],
            [DocumentType.COL, {
                layout: { view: CollectionView, dataField: data },
                options: { _panX: 0, _panY: 0, scale: 1 } // , _width: 500, _height: 500 }
            }],
            [DocumentType.KVP, {
                layout: { view: KeyValueBox, dataField: data },
                options: { _height: 150 }
            }],
            [DocumentType.DOCUMENT, {
                layout: { view: DocumentBox, dataField: data },
                options: { _height: 250 }
            }],
            [DocumentType.VID, {
                layout: { view: VideoBox, dataField: data },
                options: { currentTimecode: 0 },
            }],
            [DocumentType.AUDIO, {
                layout: { view: AudioBox, dataField: data },
                options: { _height: 35, backgroundColor: "lightGray" }
            }],
            [DocumentType.PDF, {
                layout: { view: PDFBox, dataField: data },
                options: { curPage: 1 }
            }],
            [DocumentType.IMPORT, {
                layout: { view: DirectoryImportBox, dataField: data },
                options: { _height: 150 }
            }],
            [DocumentType.LINK, {
                layout: { view: LinkBox, dataField: data },
                options: { _height: 150 }
            }],
            [DocumentType.LINKDOC, {
                data: new List<Doc>(),
                layout: { view: EmptyBox, dataField: data },
                options: { childDropAction: "alias", title: "LINK DB" }
            }],
            [DocumentType.YOUTUBE, {
                layout: { view: YoutubeBox, dataField: data }
            }],
            [DocumentType.BUTTON, {
                layout: { view: ButtonBox, dataField: data },
            }],
            [DocumentType.SLIDER, {
                layout: { view: SliderBox, dataField: data },
            }],
            [DocumentType.PRES, {
                layout: { view: PresBox, dataField: data },
                options: {}
            }],
            [DocumentType.FONTICON, {
                layout: { view: FontIconBox, dataField: data },
                options: { _width: 40, _height: 40, borderRounding: "100%" },
            }],
            [DocumentType.RECOMMENDATION, {
                layout: { view: RecommendationsBox },
                options: { width: 200, height: 200 },
            }],
            [DocumentType.WEBCAM, {
                layout: { view: DashWebRTCVideo, dataField: data }
            }],
            [DocumentType.PRESELEMENT, {
                layout: { view: PresElementBox, dataField: data }
            }],
            [DocumentType.INK, {
                layout: { view: InkingStroke, dataField: data },
                options: { backgroundColor: "transparent" }
            }]
        ]);

        // All document prototypes are initialized with at least these values
        const defaultOptions: DocumentOptions = { x: 0, y: 0, _width: 300 }; // bcz: do we really want to set anything here?  could also try to set in render() methods for types that need a default
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
            const prototypeIds = Object.values(DocumentType).filter(type => type !== DocumentType.NONE).map(type => type + suffix);
            // fetch the actual prototype documents from the server
            const actualProtos = await DocServer.GetRefFields(prototypeIds);

            // update this object to include any default values: DocumentOptions for all prototypes
            prototypeIds.map(id => {
                const existing = actualProtos[id] as Doc;
                const type = id.replace(suffix, "") as DocumentType;
                // get or create prototype of the specified type...
                const target = existing || buildPrototype(type, id);
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
            const template = TemplateMap.get(type);
            if (!template) {
                return undefined;
            }
            const layout = template.layout;
            // create title
            const upper = suffix.toUpperCase();
            const title = prototypeId.toUpperCase().replace(upper, `_${upper}`);
            // synthesize the default options, the type and title from computed values and
            // whatever options pertain to this specific prototype
            const options = { title, type, baseProto: true, ...defaultOptions, ...(template.options || {}) };
            options.layout = layout.view.LayoutString(layout.dataField);
            const doc = Doc.assign(new Doc(prototypeId, true), { layoutKey: "layout", ...options });
            return doc;
        }

    }

    /**
     * Encapsulates the factory used to create new document instances
     * delegated from top-level prototypes
     */
    export namespace Create {

        export function Buxton() {
            let responded = false;
            const loading = new Doc;
            loading.title = "Please wait for the import script...";
            const parent = TreeDocument([loading], {
                title: "The Buxton Collection",
                _width: 400,
                _height: 400,
                _LODdisable: true
            });
            const parentProto = Doc.GetProto(parent);
            const { _socket } = DocServer;
            _socket.off(MessageStore.BuxtonDocumentResult.Message);
            _socket.off(MessageStore.BuxtonImportComplete.Message);
            Utils.AddServerHandler(_socket, MessageStore.BuxtonDocumentResult, ({ device, errors }) => {
                if (!responded) {
                    responded = true;
                    parentProto.data = new List<Doc>();
                }
                if (device) {
                    const { __images } = device;
                    delete device.__images;
                    const { ImageDocument, StackingDocument } = Docs.Create;
                    const constructed = __images.map(({ url, nativeWidth, nativeHeight }) => ({ url: Utils.prepend(url), nativeWidth, nativeHeight }));
                    const deviceImages = constructed.map(({ url, nativeWidth, nativeHeight }, i) => ImageDocument(url, {
                        title: `image${i}.${extname(url)}`,
                        _nativeWidth: nativeWidth,
                        _nativeHeight: nativeHeight
                    }));
                    const doc = StackingDocument(deviceImages, { title: device.title, _LODdisable: true });
                    const deviceProto = Doc.GetProto(doc);
                    deviceProto.hero = new ImageField(constructed[0].url);
                    Docs.Get.DocumentHierarchyFromJson(device, undefined, deviceProto);
                    Doc.AddDocToList(parentProto, "data", doc);
                } else if (errors) {
                    console.log(errors);
                } else {
                    alert("A Buxton document import was completely empty (??)");
                }
            });
            Utils.AddServerHandler(_socket, MessageStore.BuxtonImportComplete, ({ deviceCount, errorCount }) => {
                _socket.off(MessageStore.BuxtonDocumentResult.Message);
                _socket.off(MessageStore.BuxtonImportComplete.Message);
                alert(`Successfully imported ${deviceCount} device${deviceCount === 1 ? "" : "s"}, with ${errorCount} error${errorCount === 1 ? "" : "s"}, in ${(Date.now() - startTime) / 1000} seconds.`);
            });
            const startTime = Date.now();
            Utils.Emit(_socket, MessageStore.BeginBuxtonImport, "");
            return parent;
        }

        Scripting.addGlobal(Buxton);

        const delegateKeys = ["x", "y", "layoutKey", "_width", "_height", "_panX", "_panY", "_viewType", "_nativeWidth", "_nativeHeight", "dropAction", "childDropAction", "_annotationOn",
            "_chromeStatus", "_forceActive", "_autoHeight", "_fitWidth", "_LODdisable", "_itemIndex", "_showSidebar", "_showTitle", "_showCaption", "_showTitleHover", "_backgroundColor",
            "_xMargin", "_yMargin", "_xPadding", "_yPadding", "_singleLine", "_scrollTop",
            "_color", "isButton", "isBackground", "removeDropProperties", "treeViewOpen"];

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

            const dataDoc = MakeDataDelegate(proto, protoProps, data);
            const viewDoc = Doc.MakeDelegate(dataDoc, delegId);

            AudioBox.ActiveRecordings.map(d => DocUtils.MakeLink({ doc: viewDoc }, { doc: d }, "audio link", "link to audio: " + d.title));

            return Doc.assign(viewDoc, delegateProps, true);
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
            const imgField = new ImageField(new URL(url));
            const inst = InstanceFromProto(Prototypes.get(DocumentType.IMG), imgField, { title: path.basename(url), ...options });
            let target = imgField.url.href;
            if (new RegExp(window.location.origin).test(target)) {
                const extension = path.extname(target);
                target = `${target.substring(0, target.length - extension.length)}_o${extension}`;
            }
            requestImageSize(target)
                .then((size: any) => {
                    const aspect = size.height / size.width;
                    if (!inst._nativeWidth) {
                        inst._nativeWidth = size.width;
                    }
                    inst._nativeHeight = NumCast(inst._nativeWidth) * aspect;
                    inst._height = NumCast(inst._width) * aspect;
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

        export function WebCamDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.WEBCAM), "", options);
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

        export function TextDocument(text: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.TEXT), text, options);
        }

        export function LinkDocument(source: { doc: Doc, ctx?: Doc }, target: { doc: Doc, ctx?: Doc }, options: DocumentOptions = {}, id?: string) {
            const doc = InstanceFromProto(Prototypes.get(DocumentType.LINK), undefined, { isButton: true, treeViewHideTitle: true, treeViewOpen: false, removeDropProperties: new List(["isBackground", "isButton"]), ...options });
            const linkDocProto = Doc.GetProto(doc);
            linkDocProto.anchor1 = source.doc;
            linkDocProto.anchor2 = target.doc;
            linkDocProto.anchor1Context = source.ctx;
            linkDocProto.anchor2Context = target.ctx;
            linkDocProto.anchor1Timecode = source.doc.currentTimecode;
            linkDocProto.anchor2Timecode = target.doc.currentTimecode;

            if (linkDocProto.layout_key1 === undefined) {
                Cast(linkDocProto.proto, Doc, null).layout_key1 = DocuLinkBox.LayoutString("anchor1");
                Cast(linkDocProto.proto, Doc, null).layout_key2 = DocuLinkBox.LayoutString("anchor2");
                Cast(linkDocProto.proto, Doc, null).linkBoxExcludedKeys = new List(["treeViewExpandedView", "treeViewHideTitle", "removeDropProperties", "linkBoxExcludedKeys", "treeViewOpen", "proto", "aliasNumber", "isPrototype", "lastOpened", "creationDate", "author"]);
                Cast(linkDocProto.proto, Doc, null).layoutKey = undefined;
            }

            LinkManager.Instance.addLink(doc);

            Doc.GetProto(source.doc).links = ComputedField.MakeFunction("links(this)");
            Doc.GetProto(target.doc).links = ComputedField.MakeFunction("links(this)");
            return doc;
        }

        export function InkDocument(color: string, tool: number, strokeWidth: number, points: { X: number, Y: number }[], options: DocumentOptions = {}) {
            const doc = InstanceFromProto(Prototypes.get(DocumentType.INK), new InkField(points), options);
            doc.color = color;
            doc.strokeWidth = strokeWidth;
            doc.tool = tool;
            return doc;
        }

        export function PdfDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.PDF), new PdfField(new URL(url)), options);
        }

        export async function DBDocument(url: string, options: DocumentOptions = {}, columnOptions: DocumentOptions = {}) {
            const schemaName = options.title ? options.title : "-no schema-";
            const ctlog = await Gateway.Instance.GetSchema(url, schemaName);
            if (ctlog && ctlog.schemas) {
                const schema = ctlog.schemas[0];
                const schemaDoc = Docs.Create.TreeDocument([], { ...options, _nativeWidth: undefined, _nativeHeight: undefined, _width: 150, _height: 100, title: schema.displayName! });
                const schemaDocuments = Cast(schemaDoc.data, listSpec(Doc), []);
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
                            const atmod = new ColumnAttributeModel(attr);
                            const histoOp = new HistogramOperation(schema.displayName!,
                                new AttributeTransformationModel(atmod, AggregateFunction.None),
                                new AttributeTransformationModel(atmod, AggregateFunction.Count),
                                new AttributeTransformationModel(atmod, AggregateFunction.Count));
                            docs.push(Docs.Create.HistogramDocument(histoOp, { ...columnOptions, _width: 200, _height: 200, title: attr.displayName! }));
                        }
                    }));
                });
                return schemaDoc;
            }
            return Docs.Create.TreeDocument([], { _width: 50, _height: 100, title: schemaName });
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

        export function DocumentDocument(document?: Doc, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.DOCUMENT), document, { title: document ? document.title + "" : "container", ...options });
        }

        export function FreeformDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Freeform }, id);
        }

        export function LinearDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", backgroundColor: "black", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Linear }, id);
        }

        export function CarouselDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Carousel });
        }

        export function SchemaDocument(schemaColumns: SchemaHeaderField[], documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List(schemaColumns), ...options, _viewType: CollectionViewType.Schema });
        }

        export function TreeDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Tree }, id);
        }

        export function StackingDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Stacking }, id);
        }

        export function MulticolumnDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Multicolumn });
        }
        export function MultirowDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Multirow });
        }


        export function MasonryDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Masonry });
        }

        export function ButtonDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.BUTTON), undefined, { ...(options || {}) });
        }

        export function SliderDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.SLIDER), undefined, { ...(options || {}) });
        }


        export function FontIconDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.FONTICON), undefined, { ...(options || {}) });
        }

        export function PresElementBoxDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.PRESELEMENT), undefined, { ...(options || {}) });
        }

        export function DockDocument(documents: Array<Doc>, config: string, options: DocumentOptions, id?: string) {
            const inst = InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Docking, dockingConfig: config }, id);
            Doc.GetProto(inst).data = new List<Doc>(documents);
            return inst;
        }

        export function DirectoryImportDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.IMPORT), new List<Doc>(), options);
        }

        export function RecommendationsDocument(data: Doc[], options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.RECOMMENDATION), new List<Doc>(data), options);
        }

        export type DocConfig = {
            doc: Doc,
            initialWidth?: number,
            path?: Doc[]
        };

        export function StandardCollectionDockingDocument(configs: Array<DocConfig>, options: DocumentOptions, id?: string, type: string = "row") {
            const layoutConfig = {
                content: [
                    {
                        type: type,
                        content: [
                            ...configs.map(config => CollectionDockingView.makeDocumentConfig(config.doc, config.initialWidth, config.path))
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
        export function DocumentHierarchyFromJson(input: any, title?: string, appendToTarget?: Doc): Opt<Doc> {
            if (input === undefined || input === null || ![...primitives, "object"].includes(typeof input)) {
                return undefined;
            }
            input = JSON.parse(typeof input === "string" ? input : JSON.stringify(input));
            let converted: Doc;
            if (typeof input === "object" && !(input instanceof Array)) {
                converted = convertObject(input, title, appendToTarget);
            } else {
                (converted = new Doc).json = toField(input);
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
        const convertObject = (object: any, title?: string, target?: Doc): Doc => {
            const resolved = target ?? new Doc;
            let result: Opt<Field>;
            Object.keys(object).map(key => (result = toField(object[key], key)) && (resolved[key] = result));
            title && !resolved.title && (resolved.title = title);
            return resolved;
        };

        /**
         * For each element in the list, recursively convert it to a document or other field 
         * and push the field to the list if it is not undefined
         * @param list the list to convert
         * @returns the list mapped from JSON to field values, where each mapping 
         * might involve arbitrary recursion (since toField might itself call convertList)
         */
        const convertList = (list: Array<any>): List<Field> => {
            const target = new List();
            let result: Opt<Field>;
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

        export function DocumentFromField(target: Doc, fieldKey: string, proto?: Doc, options?: DocumentOptions): Doc | undefined {
            let created: Doc | undefined;
            let layout: ((fieldKey: string) => string) | undefined;
            const field = target[fieldKey];
            const resolved = options || {};
            if (field instanceof ImageField) {
                created = Docs.Create.ImageDocument((field).url.href, resolved);
                layout = ImageBox.LayoutString;
            } else if (field instanceof Doc) {
                created = field;
            } else if (field instanceof VideoField) {
                created = Docs.Create.VideoDocument((field).url.href, resolved);
                layout = VideoBox.LayoutString;
            } else if (field instanceof PdfField) {
                created = Docs.Create.PdfDocument((field).url.href, resolved);
                layout = PDFBox.LayoutString;
            } else if (field instanceof AudioField) {
                created = Docs.Create.AudioDocument((field).url.href, resolved);
                layout = AudioBox.LayoutString;
            } else if (field instanceof HistogramField) {
                created = Docs.Create.HistogramDocument((field).HistoOp, resolved);
                layout = HistogramBox.LayoutString;
            } else if (field instanceof InkField) {
                const { selectedColor, selectedWidth, selectedTool } = InkingControl.Instance;
                created = Docs.Create.InkDocument(selectedColor, selectedTool, Number(selectedWidth), (field).inkData, resolved);
                layout = InkingStroke.LayoutString;
            } else if (field instanceof List && field[0] instanceof Doc) {
                created = Docs.Create.StackingDocument(DocListCast(field), resolved);
                layout = CollectionView.LayoutString;
            } else {
                created = Docs.Create.TextDocument("", { ...{ _width: 200, _height: 25, _autoHeight: true }, ...resolved });
                layout = FormattedTextBox.LayoutString;
            }
            created.layout = layout?.(fieldKey);
            created.title = fieldKey;
            proto && (created.proto = Doc.GetProto(proto));
            return created;
        }

        export async function DocumentFromType(type: string, path: string, options: DocumentOptions): Promise<Opt<Doc>> {
            let ctor: ((path: string, options: DocumentOptions) => (Doc | Promise<Doc | undefined>)) | undefined = undefined;
            if (type.indexOf("image") !== -1) {
                ctor = Docs.Create.ImageDocument;
                if (!options._width) options._width = 300;
            }
            if (type.indexOf("video") !== -1) {
                ctor = Docs.Create.VideoDocument;
                if (!options._width) options._width = 600;
                if (!options._height) options._height = options._width * 2 / 3;
            }
            if (type.indexOf("audio") !== -1) {
                ctor = Docs.Create.AudioDocument;
            }
            if (type.indexOf("pdf") !== -1) {
                ctor = Docs.Create.PdfDocument;
                if (!options._width) options._width = 400;
                if (!options._height) options._height = options._width * 1200 / 927;
            }
            if (type.indexOf("excel") !== -1) {
                ctor = Docs.Create.DBDocument;
                options.dropAction = "copy";
            }
            if (type.indexOf("html") !== -1) {
                if (path.includes(window.location.hostname)) {
                    const s = path.split('/');
                    const id = s[s.length - 1];
                    return DocServer.GetRefField(id).then(field => {
                        if (field instanceof Doc) {
                            const alias = Doc.MakeAlias(field);
                            alias.x = options.x || 0;
                            alias.y = options.y || 0;
                            alias._width = options._width || 300;
                            alias._height = options._height || options._width || 300;
                            return alias;
                        }
                        return undefined;
                    });
                }
                ctor = Docs.Create.WebDocument;
                options = { _height: options._width, ...options, title: path, _nativeWidth: undefined };
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
                                const a1 = await Cast(link.anchor1, Doc);
                                if (a1 && Doc.AreProtosEqual(a1, promoteDoc)) link.anchor1 = copy;
                                const a2 = await Cast(link.anchor2, Doc);
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

    export function MakeLink(source: { doc: Doc, ctx?: Doc }, target: { doc: Doc, ctx?: Doc }, title: string = "", linkRelationship: string = "", id?: string) {
        const sv = DocumentManager.Instance.getDocumentView(source.doc);
        if (sv && sv.props.ContainingCollectionDoc === target.doc) return;
        if (target.doc === CurrentUserUtils.UserDocument) return undefined;

        const linkDoc = Docs.Create.LinkDocument(source, target, { title, linkRelationship }, id);
        Doc.GetProto(linkDoc).title = ComputedField.MakeFunction('this.anchor1.title +" " + (this.linkRelationship||"to") +" "  + this.anchor2.title');

        Doc.GetProto(source.doc).links = ComputedField.MakeFunction("links(this)");
        Doc.GetProto(target.doc).links = ComputedField.MakeFunction("links(this)");
        return linkDoc;
    }

    export function addDocumentCreatorMenuItems(docTextAdder: (d: Doc) => void, docAdder: (d: Doc) => void, x: number, y: number): void {
        ContextMenu.Instance.addItem({
            description: "Add Note ...",
            subitems: DocListCast((Doc.UserDoc().noteTypes as Doc).data).map((note, i) => ({
                description: ":" + StrCast(note.title),
                event: (args: { x: number, y: number }) => docTextAdder(Docs.Create.TextDocument("", { _width: 200, x, y, _autoHeight: note._autoHeight !== false, layout: note, title: StrCast(note.title) + "#" + (note.aliasCount = NumCast(note.aliasCount) + 1) })),
                icon: "eye"
            })) as ContextMenuProps[],
            icon: "eye"
        });
        ContextMenu.Instance.addItem({
            description: "Add Template Doc ...",
            subitems: DocListCast(Cast(Doc.UserDoc().expandingButtons, Doc, null)?.data).map(btnDoc => Cast(btnDoc?.dragFactory, Doc, null)).filter(doc => doc).map((dragDoc, i) => ({
                description: ":" + StrCast(dragDoc.title),
                event: (args: { x: number, y: number }) => {
                    const newDoc = Doc.ApplyTemplate(dragDoc);
                    if (newDoc) {
                        newDoc.x = x;
                        newDoc.y = y;
                        docAdder(newDoc);
                    }
                },
                icon: "eye"
            })) as ContextMenuProps[],
            icon: "eye"
        });
    }
}

Scripting.addGlobal("Docs", Docs);
