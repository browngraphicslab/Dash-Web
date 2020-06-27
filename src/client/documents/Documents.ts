import { runInAction } from "mobx";
import { extname } from "path";
import { DateField } from "../../fields/DateField";
import { Doc, DocListCast, DocListCastAsync, Field, HeightSym, Opt, WidthSym } from "../../fields/Doc";
import { HtmlField } from "../../fields/HtmlField";
import { InkField } from "../../fields/InkField";
import { List } from "../../fields/List";
import { ProxyField } from "../../fields/Proxy";
import { RichTextField } from "../../fields/RichTextField";
import { SchemaHeaderField } from "../../fields/SchemaHeaderField";
import { ComputedField, ScriptField } from "../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../fields/Types";
import { AudioField, ImageField, PdfField, VideoField, WebField, YoutubeField } from "../../fields/URLField";
import { MessageStore } from "../../server/Message";
import { OmitKeys, Utils } from "../../Utils";
import { YoutubeBox } from "../apis/youtube/YoutubeBox";
import { DocServer } from "../DocServer";
import { DocumentManager } from "../util/DocumentManager";
import { dropActionType } from "../util/DragManager";
import { DirectoryImportBox } from "../util/Import & Export/DirectoryImportBox";
import { LinkManager } from "../util/LinkManager";
import { Scripting } from "../util/Scripting";
import { UndoManager } from "../util/UndoManager";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../views/collections/CollectionView";
import { ContextMenu } from "../views/ContextMenu";
import { ContextMenuProps } from "../views/ContextMenuItem";
import { ActiveArrowEnd, ActiveArrowStart, ActiveDash, ActiveFillColor, ActiveInkBezierApprox, ActiveInkColor, ActiveInkWidth, InkingStroke } from "../views/InkingStroke";
import { AudioBox } from "../views/nodes/AudioBox";
import { ColorBox } from "../views/nodes/ColorBox";
import { ComparisonBox } from "../views/nodes/ComparisonBox";
import { DocHolderBox } from "../views/nodes/DocHolderBox";
import { FontIconBox } from "../views/nodes/FontIconBox";
import { FormattedTextBox } from "../views/nodes/formattedText/FormattedTextBox";
import { ImageBox } from "../views/nodes/ImageBox";
import { KeyValueBox } from "../views/nodes/KeyValueBox";
import { LabelBox } from "../views/nodes/LabelBox";
import { LinkBox } from "../views/nodes/LinkBox";
import { PDFBox } from "../views/nodes/PDFBox";
import { PresBox } from "../views/nodes/PresBox";
import { QueryBox } from "../views/nodes/QueryBox";
import { ScreenshotBox } from "../views/nodes/ScreenshotBox";
import { ScriptingBox } from "../views/nodes/ScriptingBox";
import { SliderBox } from "../views/nodes/SliderBox";
import { VideoBox } from "../views/nodes/VideoBox";
import { WebBox } from "../views/nodes/WebBox";
import { PresElementBox } from "../views/presentationview/PresElementBox";
import { RecommendationsBox } from "../views/RecommendationsBox";
import { DashWebRTCVideo } from "../views/webcam/DashWebRTCVideo";
import { DocumentType } from "./DocumentTypes";
const path = require('path');

export interface DocumentOptions {
    _autoHeight?: boolean;
    _panX?: number;
    _panY?: number;
    _width?: number;
    _height?: number;
    _nativeWidth?: number;
    _nativeHeight?: number;
    _dimMagnitude?: number; // magnitude of collectionMulti{row,col} view element
    _dimUnit?: string; // "px" or "*" (default = "*")
    _fitWidth?: boolean;
    _fitToBox?: boolean; // whether a freeformview should zoom/scale to create a shrinkwrapped view of its contents
    _LODdisable?: boolean;
    _showTitleHover?: string; // 
    _showTitle?: string; // which field to display in the title area.  leave empty to have no title
    _showCaption?: string; // which field to display in the caption area.  leave empty to have no caption
    _scrollTop?: number; // scroll location for pdfs
    _chromeStatus?: string;
    _viewType?: string; // sub type of a collection
    _gridGap?: number; // gap between items in masonry view
    _xMargin?: number; // gap between left edge of document and start of masonry/stacking layouts
    _yMargin?: number; // gap between top edge of dcoument and start of masonry/stacking layouts
    _xPadding?: number;
    _yPadding?: number;
    _itemIndex?: number; // which item index the carousel viewer is showing
    _showSidebar?: boolean;  //whether an annotationsidebar should be displayed for text docuemnts
    _singleLine?: boolean; // whether text document is restricted to a single line (carriage returns make new document)
    "_carousel-caption-xMargin"?: number;
    "_carousel-caption-yMargin"?: number;
    x?: number;
    y?: number;
    z?: number;
    author?: string;
    dropAction?: dropActionType;
    childDropAction?: dropActionType;
    targetDropAction?: dropActionType;
    layoutKey?: string;
    type?: string;
    title?: string;
    label?: string; // short form of title for use as an icon label
    style?: string;
    page?: number;
    scale?: number;
    isDisplayPanel?: boolean; // whether the panel functions as GoldenLayout "stack" used to display documents
    forceActive?: boolean;
    layout?: string | Doc; // default layout string for a document
    childLayoutTemplate?: Doc; // template for collection to use to render its children (see PresBox or Buxton layout in tree view)
    childLayoutString?: string; // template string for collection to use to render its children
    hideFilterView?: boolean; // whether to hide the filter popout on collections
    hideHeadings?: boolean; // whether stacking view column headings should be hidden
    isTemplateForField?: string; // the field key for which the containing document is a rendering template
    isTemplateDoc?: boolean;
    targetScriptKey?: string; // where to write a template script (used by collections with click templates which need to target onClick, onDoubleClick, etc)
    templates?: List<string>;
    hero?: ImageField; // primary image that best represents a compound document (e.g., for a buxton device document that has multiple images)
    backgroundColor?: string | ScriptField;  // background color for data doc 
    _backgroundColor?: string | ScriptField; // background color for each template layout doc ( overrides backgroundColor )
    color?: string; // foreground color data doc
    _color?: string;  // foreground color for each template layout doc (overrides color)
    _clipWidth?: number; // percent transition from before to after in comparisonBox
    caption?: RichTextField;
    ignoreClick?: boolean;
    lockedPosition?: boolean; // lock the x,y coordinates of the document so that it can't be dragged
    _lockedTransform?: boolean; // lock the panx,pany and scale parameters of the document so that it be panned/zoomed
    isAnnotating?: boolean; // whether we web document is annotation mode where links can't be clicked to allow annotations to be created
    opacity?: number;
    defaultBackgroundColor?: string;
    isBackground?: boolean;
    isLinkButton?: boolean;
    columnWidth?: number;
    _fontSize?: number;
    _fontFamily?: string;
    curPage?: number;
    currentTimecode?: number; // the current timecode of a time-based document (e.g., current time of a video)  value is in seconds
    displayTimecode?: number; // the time that a document should be displayed (e.g., time an annotation should be displayed on a video)
    currentFrame?: number; // the current frame of a frame-based collection (e.g., progressive slide)
    lastFrame?: number; // the last frame of a frame-based collection (e.g., progressive slide)
    activeFrame?: number; // the active frame of a document in a frame base collection
    borderRounding?: string;
    boxShadow?: string;
    dontRegisterChildViews?: boolean;
    lookupField?: ScriptField; // script that returns the value of a field. This script is passed the rootDoc, layoutDoc, field, and container of the document.  see PresBox.
    "onDoubleClick-rawScript"?: string; // onDoubleClick script in raw text form
    "onClick-rawScript"?: string; // onClick script in raw text form
    "onCheckedClick-rawScript"?: string; // onChecked script in raw text form
    "onCheckedClick-params"?: List<string>; // parameter list for onChecked treeview functions
    _pivotField?: string; // field key used to determine headings for sections in stacking, masonry, pivot views
    schemaColumns?: List<SchemaHeaderField>;
    dockingConfig?: string;
    annotationOn?: Doc;
    removeDropProperties?: List<string>; // list of properties that should be removed from a document when it is dropped.  e.g., a creator button may be forceActive to allow it be dragged, but the forceActive property can be removed from the dropped document
    dbDoc?: Doc;
    linkRelationship?: string; // type of relatinoship a link represents
    ischecked?: ScriptField; // returns whether a font icon box is checked
    activeInkPen?: Doc; // which pen document is currently active (used as the radio button state for the 'unhecked' pen tool scripts)
    onClick?: ScriptField;
    onDoubleClick?: ScriptField;
    onChildClick?: ScriptField; // script given to children of a collection to execute when they are clicked
    onChildDoubleClick?: ScriptField; // script given to children of a collection to execute when they are double clicked
    onPointerDown?: ScriptField;
    onPointerUp?: ScriptField;
    dropConverter?: ScriptField; // script to run when documents are dropped on this Document.
    dragFactory?: Doc; // document to create when dragging with a suitable onDragStart script
    onDragStart?: ScriptField; //script to execute at start of drag operation --  e.g., when a "creator" button is dragged this script generates a different document to drop
    clipboard?: Doc;
    UseCors?: boolean;
    icon?: string;
    sourcePanel?: Doc; // panel to display in 'targetContainer' as the result of a button onClick script
    targetContainer?: Doc; // document whose proto will be set to 'panel' as the result of a onClick click script
    searchFileTypes?: List<string>; // file types allowed in a search query
    strokeWidth?: number;
    stayInCollection?: boolean;// whether the document should remain in its collection when someone tries to drag and drop it elsewhere
    treeViewPreventOpen?: boolean; // ignores the treeViewOpen Doc flag which allows a treeViewItem's expand/collapse state to be independent of other views of the same document in the tree view
    treeViewHideTitle?: boolean; // whether to hide the title of a tree view
    treeViewHideHeaderFields?: boolean; // whether to hide the drop down options for tree view items.
    treeViewOpen?: boolean; // whether this document is expanded in a tree view
    treeViewExpandedView?: string; // which field/thing is displayed when this item is opened in tree view
    treeViewChecked?: ScriptField; // script to call when a tree view checkbox is checked
    limitHeight?: number; // maximum height for newly created (eg, from pasting) text documents
    // [key: string]: Opt<Field>;
    pointerHack?: boolean; // for buttons, allows onClick handler to fire onPointerDown
    textTransform?: string; // is linear view expanded
    letterSpacing?: string; // is linear view expanded
    flexDirection?: "unset" | "row" | "column" | "row-reverse" | "column-reverse";
    selectedIndex?: number;
    syntaxColor?: string; // can be applied to text for syntax highlighting all matches in the text
    searchText?: string; //for searchbox
    searchQuery?: string; // for queryBox
    filterQuery?: string;
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
        const defaultDataKey = "data";

        const TemplateMap: TemplateMap = new Map([
            [DocumentType.RTF, {
                layout: { view: FormattedTextBox, dataField: "text" },
                options: { _height: 150, _xMargin: 10, _yMargin: 10 }
            }],
            [DocumentType.QUERY, {
                layout: { view: QueryBox, dataField: defaultDataKey },
                options: { _width: 400 }
            }],
            [DocumentType.COLOR, {
                layout: { view: ColorBox, dataField: defaultDataKey },
                options: { _nativeWidth: 220, _nativeHeight: 300 }
            }],
            [DocumentType.IMG, {
                layout: { view: ImageBox, dataField: defaultDataKey },
                options: {}
            }],
            [DocumentType.WEB, {
                layout: { view: WebBox, dataField: defaultDataKey },
                options: { _height: 300 }
            }],
            [DocumentType.COL, {
                layout: { view: CollectionView, dataField: defaultDataKey },
                options: { _panX: 0, _panY: 0, scale: 1 } // , _width: 500, _height: 500 }
            }],
            [DocumentType.KVP, {
                layout: { view: KeyValueBox, dataField: defaultDataKey },
                options: { _height: 150 }
            }],
            [DocumentType.DOCHOLDER, {
                layout: { view: DocHolderBox, dataField: defaultDataKey },
                options: { _height: 250 }
            }],
            [DocumentType.VID, {
                layout: { view: VideoBox, dataField: defaultDataKey },
                options: { currentTimecode: 0 },
            }],
            [DocumentType.AUDIO, {
                layout: { view: AudioBox, dataField: defaultDataKey },
                options: { _height: 35, backgroundColor: "lightGray" }
            }],
            [DocumentType.PDF, {
                layout: { view: PDFBox, dataField: defaultDataKey },
                options: { curPage: 1 }
            }],
            [DocumentType.IMPORT, {
                layout: { view: DirectoryImportBox, dataField: defaultDataKey },
                options: { _height: 150 }
            }],
            [DocumentType.LINK, {
                layout: { view: LinkBox, dataField: defaultDataKey },
                options: { _height: 150 }
            }],
            [DocumentType.LINKDB, {
                data: new List<Doc>(),
                layout: { view: EmptyBox, dataField: defaultDataKey },
                options: { childDropAction: "alias", title: "Global Link Database" }
            }],
            [DocumentType.SCRIPTDB, {
                data: new List<Doc>(),
                layout: { view: EmptyBox, dataField: defaultDataKey },
                options: { childDropAction: "alias", title: "Global Script Database" }
            }],
            [DocumentType.SCRIPTING, {
                layout: { view: ScriptingBox, dataField: defaultDataKey }
            }],
            [DocumentType.YOUTUBE, {
                layout: { view: YoutubeBox, dataField: defaultDataKey }
            }],
            [DocumentType.LABEL, {
                layout: { view: LabelBox, dataField: defaultDataKey },
            }],
            [DocumentType.BUTTON, {
                layout: { view: LabelBox, dataField: "onClick" },
            }],
            [DocumentType.SLIDER, {
                layout: { view: SliderBox, dataField: defaultDataKey },
            }],
            [DocumentType.PRES, {
                layout: { view: PresBox, dataField: defaultDataKey },
                options: {}
            }],
            [DocumentType.FONTICON, {
                layout: { view: FontIconBox, dataField: defaultDataKey },
                options: { _width: 40, _height: 40, borderRounding: "100%" },
            }],
            [DocumentType.RECOMMENDATION, {
                layout: { view: RecommendationsBox, dataField: defaultDataKey },
                options: { _width: 200, _height: 200 },
            }],
            [DocumentType.WEBCAM, {
                layout: { view: DashWebRTCVideo, dataField: defaultDataKey }
            }],
            [DocumentType.PRESELEMENT, {
                layout: { view: PresElementBox, dataField: defaultDataKey }
            }],
            [DocumentType.INK, {
                layout: { view: InkingStroke, dataField: defaultDataKey },
                options: { backgroundColor: "transparent" }
            }],
            [DocumentType.SCREENSHOT, {
                layout: { view: ScreenshotBox, dataField: defaultDataKey },
            }],
            [DocumentType.COMPARISON, {
                layout: { view: ComparisonBox, dataField: defaultDataKey },
            }],
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
            return Prototypes.get(DocumentType.LINKDB);
        }

        /**
         * A collection of all scripts in the database
         */
        export function MainScriptDocument() {
            return Prototypes.get(DocumentType.SCRIPTDB);
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
            options.layout = layout.view?.LayoutString(layout.dataField);
            const doc = Doc.assign(new Doc(prototypeId, true), { layoutKey: "layout", ...options });
            doc.layout_keyValue = KeyValueBox.LayoutString("");
            return doc;
        }

    }

    /**
     * Encapsulates the factory used to create new document instances
     * delegated from top-level prototypes
     */
    export namespace Create {

        /**
         * Synchronously returns a collection into which
         * the device documents will be put. This is initially empty,
         * but gets populated by updates from the web socket. When everything is over,
         * this function cleans up after itself.
         * s
         * Look at Websocket.ts for the server-side counterpart to this
         * function.
         */
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

            // just in case, clean up
            _socket.off(MessageStore.BuxtonDocumentResult.Message);
            _socket.off(MessageStore.BuxtonImportComplete.Message);

            // this is where the client handles the receipt of a new valid parsed document
            Utils.AddServerHandler(_socket, MessageStore.BuxtonDocumentResult, ({ device, invalid: errors }) => {
                if (!responded) {
                    responded = true;
                    parentProto.data = new List<Doc>();
                }
                if (device) {
                    const { title, __images, additionalMedia } = device;
                    delete device.__images;
                    delete device.additionalMedia;
                    const { ImageDocument, StackingDocument } = Docs.Create;
                    const constructed = __images.map(({ url, nativeWidth, nativeHeight }) => ({ url: Utils.prepend(url), nativeWidth, nativeHeight }));
                    const deviceImages = constructed.map(({ url, nativeWidth, nativeHeight }, i) => {
                        const imageDoc = ImageDocument(url, {
                            title: `image${i}.${extname(url)}`,
                            _nativeWidth: nativeWidth,
                            _nativeHeight: nativeHeight
                        });
                        const media = additionalMedia[i];
                        if (media) {
                            for (const key of Object.keys(media)) {
                                imageDoc[`additionalMedia_${key}`] = Utils.prepend(`/files/${key}/buxton/${media[key]}`);
                            }
                        }
                        return imageDoc;
                    });
                    // the main document we create
                    const doc = StackingDocument(deviceImages, { title, _LODdisable: true, hero: new ImageField(constructed[0].url) });
                    doc.nameAliases = new List<string>([title.toLowerCase()]);
                    // add the parsed attributes to this main document
                    Doc.Get.FromJson({ data: device, appendToExisting: { targetDoc: Doc.GetProto(doc) } });
                    Doc.AddDocToList(parentProto, "data", doc);
                } else if (errors) {
                    console.log(errors);
                } else {
                    alert("A Buxton document import was completely empty (??)");
                }
            });

            // when the import is complete, we stop listening for these creation
            // and termination events and alert the user
            Utils.AddServerHandler(_socket, MessageStore.BuxtonImportComplete, ({ deviceCount, errorCount }) => {
                _socket.off(MessageStore.BuxtonDocumentResult.Message);
                _socket.off(MessageStore.BuxtonImportComplete.Message);
                alert(`Successfully imported ${deviceCount} device${deviceCount === 1 ? "" : "s"}, with ${errorCount} error${errorCount === 1 ? "" : "s"}, in ${(Date.now() - startTime) / 1000} seconds.`);
            });
            const startTime = Date.now();
            Utils.Emit(_socket, MessageStore.BeginBuxtonImport, ""); // signal the server to start importing
            return parent; // synchronously return the collection, to be populateds
        }

        Scripting.addGlobal(Buxton);

        const delegateKeys = ["x", "y", "layoutKey", "dropAction", "lockedPosiiton", "childDropAction", "isLinkButton", "isBackground", "removeDropProperties", "treeViewOpen"];

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
        export function InstanceFromProto(proto: Doc, data: Field | undefined, options: DocumentOptions, delegId?: string, fieldKey: string = "data") {
            const { omit: protoProps, extract: delegateProps } = OmitKeys(options, delegateKeys, "^_");

            if (!("author" in protoProps)) {
                protoProps.author = Doc.CurrentUserEmail;
            }

            if (!("creationDate" in protoProps)) {
                protoProps.creationDate = new DateField;
            }

            protoProps.isPrototype = true;

            const dataDoc = MakeDataDelegate(proto, protoProps, data, fieldKey);
            const viewDoc = Doc.MakeDelegate(dataDoc, delegId);

            proto.links = ComputedField.MakeFunction("links(self)");

            viewDoc.author = Doc.CurrentUserEmail;
            viewDoc.type !== DocumentType.LINK && DocUtils.MakeLinkToActiveAudio(viewDoc);

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
        function MakeDataDelegate<D extends Field>(proto: Doc, options: DocumentOptions, value?: D, fieldKey: string = "data") {
            const deleg = Doc.MakeDelegate(proto);
            if (value !== undefined) {
                deleg[fieldKey] = value;
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
            return inst;
        }
        export function PresDocument(initial: List<Doc> = new List(), options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.PRES), initial, options);
        }

        export function ScriptingDocument(script: Opt<ScriptField>, options: DocumentOptions = {}, fieldKey?: string) {
            const res = InstanceFromProto(Prototypes.get(DocumentType.SCRIPTING), script, options);
            fieldKey && res.proto instanceof Doc && (res.proto.layout = ScriptingBox.LayoutString(fieldKey));
            return res;
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

        export function ScreenshotDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.SCREENSHOT), "", options);
        }

        export function ComparisonDocument(options: DocumentOptions = { title: "Comparison Box" }) {
            return InstanceFromProto(Prototypes.get(DocumentType.COMPARISON), "", { _clipWidth: 50, _backgroundColor: "gray", targetDropAction: "alias", ...options });
        }

        export function AudioDocument(url: string, options: DocumentOptions = {}) {
            const instance = InstanceFromProto(Prototypes.get(DocumentType.AUDIO), new AudioField(new URL(url)), options);
            Doc.GetProto(instance).backgroundColor = ComputedField.MakeFunction("this._audioState === 'playing' ? 'green':'gray'");
            return instance;
        }

        export function QueryDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.QUERY), "", options);
        }

        export function ColorDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.COLOR), "", options);
        }

        export function TextDocument(text: string, options: DocumentOptions = {}, fieldKey: string = "text") {
            const rtf = {
                doc: {
                    type: "doc", content: [{
                        type: "paragraph",
                        content: [{
                            type: "text",
                            text
                        }]
                    }]
                },
                selection: { type: "text", anchor: 1, head: 1 },
                storedMarks: []
            };
            const field = text ? new RichTextField(JSON.stringify(rtf), text) : undefined;
            return InstanceFromProto(Prototypes.get(DocumentType.RTF), field, options, undefined, fieldKey);
        }

        export function LinkDocument(source: { doc: Doc, ctx?: Doc }, target: { doc: Doc, ctx?: Doc }, options: DocumentOptions = {}, id?: string) {
            const doc = InstanceFromProto(Prototypes.get(DocumentType.LINK), undefined, {
                isLinkButton: true, treeViewHideTitle: true, treeViewOpen: false, backgroundColor: "lightBlue", // lightBlue is default color for linking dot and link documents text comment area
                removeDropProperties: new List(["isBackground", "isLinkButton"]), ...options
            }, id);
            const linkDocProto = Doc.GetProto(doc);
            linkDocProto.anchor1 = source.doc;
            linkDocProto.anchor2 = target.doc;
            linkDocProto.anchor1_timecode = source.doc.currentTimecode || source.doc.displayTimecode;
            linkDocProto.anchor2_timecode = target.doc.currentTimecode || target.doc.displayTimecode;

            if (linkDocProto.linkBoxExcludedKeys === undefined) {
                Cast(linkDocProto.proto, Doc, null).linkBoxExcludedKeys = new List(["treeViewExpandedView", "treeViewHideTitle", "removeDropProperties", "linkBoxExcludedKeys", "treeViewOpen", "aliasNumber", "isPrototype", "lastOpened", "creationDate", "author"]);
                Cast(linkDocProto.proto, Doc, null).layoutKey = undefined;
            }

            LinkManager.Instance.addLink(doc);

            Doc.GetProto(source.doc).links = ComputedField.MakeFunction("links(self)");
            Doc.GetProto(target.doc).links = ComputedField.MakeFunction("links(self)");
            return doc;
        }

        export function InkDocument(color: string, tool: string, strokeWidth: string, strokeBezier: string, fillColor: string, arrowStart: string, arrowEnd: string, dash: string, points: { X: number, Y: number }[], options: DocumentOptions = {}) {
            const I = new Doc();
            I.type = DocumentType.INK;
            I.layout = InkingStroke.LayoutString("data");
            I.color = color;
            I.strokeWidth = strokeWidth;
            I.strokeBezier = strokeBezier;
            I.fillColor = fillColor;
            I.arrowStart = arrowStart;
            I.arrowEnd = arrowEnd;
            I.dash = dash;
            I.tool = tool;
            I.title = "ink";
            I.x = options.x;
            I.y = options.y;
            I._backgroundColor = "transparent";
            I._width = options._width;
            I._height = options._height;
            I.author = Doc.CurrentUserEmail;
            I.data = new InkField(points);
            return I;
            // return I;
            // const doc = InstanceFromProto(Prototypes.get(DocumentType.INK), new InkField(points), options);
            // doc.color = color;
            // doc.strokeWidth = strokeWidth;
            // doc.tool = tool;
            // return doc;
        }

        export function PdfDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.PDF), new PdfField(new URL(url)), options);
        }

        export function WebDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.WEB), url ? new WebField(new URL(url)) : undefined, { _fitWidth: true, _chromeStatus: url ? "disabled" : "enabled", isAnnotating: true, _lockedTransform: true, ...options });
        }

        export function HtmlDocument(html: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.WEB), new HtmlField(html), options);
        }

        export function KVPDocument(document: Doc, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.KVP), document, { title: document.title + ".kvp", ...options });
        }

        export function DocumentDocument(document?: Doc, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.DOCHOLDER), document, { title: document ? document.title + "" : "container", targetDropAction: "move", ...options });
        }

        export function FreeformDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Freeform }, id);
        }

        export function PileDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", backgroundColor: "black", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Pile }, id);
        }

        export function LinearDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", backgroundColor: "black", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Linear }, id);
        }

        export function MapDocument(documents: Array<Doc>, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), options);
        }

        export function CarouselDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List([new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Carousel });
        }

        export function SchemaDocument(schemaColumns: SchemaHeaderField[], documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _chromeStatus: "collapsed", schemaColumns: new List(schemaColumns.length ? schemaColumns : [new SchemaHeaderField("title", "#f1efeb")]), ...options, _viewType: CollectionViewType.Schema });
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

        export function LabelDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.LABEL), undefined, { ...(options || {}) });
        }

        export function ButtonDocument(options?: DocumentOptions) {
            // const btn = InstanceFromProto(Prototypes.get(DocumentType.BUTTON), undefined, { ...(options || {}), "onClick-rawScript": "-script-" });
            // btn.layoutKey = "layout_onClick";
            // btn.height = 250;
            // btn.width = 200;
            // btn.layout_onClick = ScriptingBox.LayoutString("onClick");
            return InstanceFromProto(Prototypes.get(DocumentType.BUTTON), undefined, { ...(options || {}), "onClick-rawScript": "-script-" });
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

        export function DelegateDocument(proto: Doc, options: DocumentOptions = {}) {
            return InstanceFromProto(proto, undefined, options);
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

    export let ActiveRecordings: Doc[] = [];

    export function MakeLinkToActiveAudio(doc: Doc) {
        DocUtils.ActiveRecordings.map(d => DocUtils.MakeLink({ doc: doc }, { doc: d }, "audio link", "audio timeline"));
    }
    export function MakeLink(source: { doc: Doc }, target: { doc: Doc }, linkRelationship: string = "", id?: string) {
        const sv = DocumentManager.Instance.getDocumentView(source.doc);
        if (sv && sv.props.ContainingCollectionDoc === target.doc) return;
        if (target.doc === Doc.UserDoc()) return undefined;

        const linkDoc = Docs.Create.LinkDocument(source, target, { linkRelationship, layoutKey: "layout_linkView" }, id);
        linkDoc.layout_linkView = Cast(Cast(Doc.UserDoc()["template-button-link"], Doc, null).dragFactory, Doc, null);
        Doc.GetProto(linkDoc).title = ComputedField.MakeFunction('self.anchor1?.title +" (" + (self.linkRelationship||"to") +") "  + self.anchor2?.title');

        Doc.GetProto(source.doc).links = ComputedField.MakeFunction("links(self)");
        Doc.GetProto(target.doc).links = ComputedField.MakeFunction("links(self)");
        return linkDoc;
    }


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
        } else if (field instanceof InkField) {
            created = Docs.Create.InkDocument(ActiveInkColor(), Doc.GetSelectedTool(), ActiveInkWidth(), ActiveInkBezierApprox(), ActiveFillColor(), ActiveArrowStart(), ActiveArrowEnd(), ActiveDash(), (field).inkData, resolved);
            layout = InkingStroke.LayoutString;
        } else if (field instanceof List && field[0] instanceof Doc) {
            created = Docs.Create.StackingDocument(DocListCast(field), resolved);
            layout = CollectionView.LayoutString;
        } else {
            created = Docs.Create.TextDocument("", { ...{ _width: 200, _height: 25, _autoHeight: true }, ...resolved });
            layout = FormattedTextBox.LayoutString;
        }
        if (created) {
            created.layout = layout?.(fieldKey);
            created.title = fieldKey;
            proto && created.proto && (created.proto = Doc.GetProto(proto));
        }
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
            options = { ...options, _nativeWidth: 850, _nativeHeight: 962, _width: 500, _height: 566, title: path, };
        }
        return ctor ? ctor(path, options) : undefined;
    }

    export function addDocumentCreatorMenuItems(docTextAdder: (d: Doc) => void, docAdder: (d: Doc) => void, x: number, y: number): void {
        ContextMenu.Instance.addItem({
            description: "Add Note ...",
            subitems: DocListCast((Doc.UserDoc()["template-notes"] as Doc).data).map((note, i) => ({
                description: ":" + StrCast(note.title),
                event: (args: { x: number, y: number }) => {
                    const textDoc = Docs.Create.TextDocument("", {
                        _width: 200, x, y, _autoHeight: note._autoHeight !== false,
                        title: StrCast(note.title) + "#" + (note.aliasCount = NumCast(note.aliasCount) + 1)
                    });
                    textDoc.layoutKey = "layout_" + note.title;
                    textDoc[textDoc.layoutKey] = note;
                    docTextAdder(textDoc);
                },
                icon: "eye"
            })) as ContextMenuProps[],
            icon: "eye"
        });
        ContextMenu.Instance.addItem({
            description: "Add Template Doc ...",
            subitems: DocListCast(Cast(Doc.UserDoc().dockedBtns, Doc, null)?.data).map(btnDoc => Cast(btnDoc?.dragFactory, Doc, null)).filter(doc => doc).map((dragDoc, i) => ({
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
    }// applies a custom template to a document.  the template is identified by it's short name (e.g, slideView not layout_slideView)
    export function makeCustomViewClicked(doc: Doc, creator: Opt<(documents: Array<Doc>, options: DocumentOptions, id?: string) => Doc>, templateSignature: string = "custom", docLayoutTemplate?: Doc) {
        const batch = UndoManager.StartBatch("makeCustomViewClicked");
        runInAction(() => {
            doc.layoutKey = "layout_" + templateSignature;
            if (doc[doc.layoutKey] === undefined) {
                createCustomView(doc, creator, templateSignature, docLayoutTemplate);
            }
        });
        batch.end();
    }
    export function findTemplate(templateName: string, type: string, signature: string) {
        let docLayoutTemplate: Opt<Doc>;
        const iconViews = DocListCast(Cast(Doc.UserDoc()["template-icons"], Doc, null)?.data);
        const templBtns = DocListCast(Cast(Doc.UserDoc()["template-buttons"], Doc, null)?.data);
        const noteTypes = DocListCast(Cast(Doc.UserDoc()["template-notes"], Doc, null)?.data);
        const clickFuncs = DocListCast(Cast(Doc.UserDoc().clickFuncs, Doc, null)?.data);
        const allTemplates = iconViews.concat(templBtns).concat(noteTypes).concat(clickFuncs).map(btnDoc => (btnDoc.dragFactory as Doc) || btnDoc).filter(doc => doc.isTemplateDoc);
        // bcz: this is hacky -- want to have different templates be applied depending on the "type" of a document.  but type is not reliable and there could be other types of template searches so this should be generalized
        // first try to find a template that matches the specific document type (<typeName>_<templateName>).  otherwise, fallback to a general match on <templateName>
        !docLayoutTemplate && allTemplates.forEach(tempDoc => StrCast(tempDoc.title) === templateName + "_" + type && (docLayoutTemplate = tempDoc));
        !docLayoutTemplate && allTemplates.forEach(tempDoc => StrCast(tempDoc.title) === templateName && (docLayoutTemplate = tempDoc));
        return docLayoutTemplate;
    }
    export function createCustomView(doc: Doc, creator: Opt<(documents: Array<Doc>, options: DocumentOptions, id?: string) => Doc>, templateSignature: string = "custom", docLayoutTemplate?: Doc) {
        const templateName = templateSignature.replace(/\(.*\)/, "");
        docLayoutTemplate = docLayoutTemplate || findTemplate(templateName, StrCast(doc.type), templateSignature);

        const customName = "layout_" + templateSignature;
        const _width = NumCast(doc._width);
        const _height = NumCast(doc._height);
        const options = { title: "data", backgroundColor: StrCast(doc.backgroundColor), _autoHeight: true, _width, x: -_width / 2, y: - _height / 2, _showSidebar: false };

        let fieldTemplate: Opt<Doc>;
        if (doc.data instanceof RichTextField || typeof (doc.data) === "string") {
            fieldTemplate = Docs.Create.TextDocument("", options);
        } else if (doc.data instanceof PdfField) {
            fieldTemplate = Docs.Create.PdfDocument("http://www.msn.com", options);
        } else if (doc.data instanceof VideoField) {
            fieldTemplate = Docs.Create.VideoDocument("http://www.cs.brown.edu", options);
        } else if (doc.data instanceof AudioField) {
            fieldTemplate = Docs.Create.AudioDocument("http://www.cs.brown.edu", options);
        } else if (doc.data instanceof ImageField) {
            fieldTemplate = Docs.Create.ImageDocument("http://www.cs.brown.edu", options);
        }
        const docTemplate = docLayoutTemplate || creator?.(fieldTemplate ? [fieldTemplate] : [], { title: customName + "(" + doc.title + ")", isTemplateDoc: true, _width: _width + 20, _height: Math.max(100, _height + 45) });

        fieldTemplate && Doc.MakeMetadataFieldTemplate(fieldTemplate, docTemplate ? Doc.GetProto(docTemplate) : docTemplate);
        docTemplate && Doc.ApplyTemplateTo(docTemplate, doc, customName, undefined);
    }
    export function makeCustomView(doc: Doc, custom: boolean, layout: string) {
        Doc.setNativeView(doc);
        if (custom) {
            makeCustomViewClicked(doc, Docs.Create.StackingDocument, layout, undefined);
        }
    }
    export function iconify(doc: Doc) {
        const layoutKey = Cast(doc.layoutKey, "string", null);
        DocUtils.makeCustomViewClicked(doc, Docs.Create.StackingDocument, "icon", undefined);
        if (layoutKey && layoutKey !== "layout" && layoutKey !== "layout_icon") doc.deiconifyLayout = layoutKey.replace("layout_", "");
    }

    export function pileup(docList: Doc[], x?: number, y?: number) {
        let w = 0, h = 0;
        runInAction(() => {
            docList.forEach(d => {
                DocUtils.iconify(d);
                w = Math.max(d[WidthSym](), w);
                h = Math.max(d[HeightSym](), h);
            });
            h = Math.max(h, w * 4 / 3); // converting to an icon does not update the height right away.  so this is a fallback hack to try to do something reasonable
            docList.forEach((d, i) => {
                d.x = Math.cos(Math.PI * 2 * i / docList.length) * 10 - w / 2;
                d.y = Math.sin(Math.PI * 2 * i / docList.length) * 10 - h / 2;
                d.displayTimecode = undefined;  // bcz: this should be automatic somehow.. along with any other properties that were logically associated with the original collection
            });
        });
        if (x !== undefined && y !== undefined) {
            const newCollection = Docs.Create.PileDocument(docList, { title: "pileup", x: x - 55, y: y - 55, _width: 110, _height: 100, _LODdisable: true });
            newCollection.x = NumCast(newCollection.x) + NumCast(newCollection._width) / 2 - 55;
            newCollection.y = NumCast(newCollection.y) + NumCast(newCollection._height) / 2 - 55;
            newCollection._width = newCollection._height = 110;
            //newCollection.borderRounding = "40px";
            newCollection._jitterRotation = 10;
            newCollection._backgroundColor = "gray";
            newCollection._overflow = "visible";
            return newCollection;
        }
    }

    export async function addFieldEnumerations(doc: Opt<Doc>, enumeratedFieldKey: string, enumerations: { title: string, _backgroundColor?: string, color?: string }[]) {
        let optionsCollection = await DocServer.GetRefField(enumeratedFieldKey);
        if (!(optionsCollection instanceof Doc)) {
            optionsCollection = Docs.Create.StackingDocument([], { title: `${enumeratedFieldKey} field set` }, enumeratedFieldKey);
            Doc.AddDocToList((Doc.UserDoc().fieldTypes as Doc), "data", optionsCollection as Doc);
        }
        const options = optionsCollection as Doc;
        const targetDoc = doc && Doc.GetProto(Cast(doc.rootDocument, Doc, null) || doc);
        const docFind = `options.data.find(doc => doc.title === (this.rootDocument||this)["${enumeratedFieldKey}"])?`;
        targetDoc && (targetDoc.backgroundColor = ComputedField.MakeFunction(docFind + `._backgroundColor || "white"`, undefined, { options }));
        targetDoc && (targetDoc.color = ComputedField.MakeFunction(docFind + `.color || "black"`, undefined, { options }));
        targetDoc && (targetDoc.borderRounding = ComputedField.MakeFunction(docFind + `.borderRounding`, undefined, { options }));
        enumerations.map(enumeration => {
            const found = DocListCast(options.data).find(d => d.title === enumeration.title);
            if (found) {
                found._backgroundColor = enumeration._backgroundColor || found._backgroundColor;
                found._color = enumeration.color || found._color;
            } else {
                Doc.AddDocToList(options, "data", Docs.Create.TextDocument(enumeration.title, enumeration));
            }
        });
        return optionsCollection;
    }
}

Scripting.addGlobal("Docs", Docs);
Scripting.addGlobal(function makeDelegate(proto: any) { const d = Docs.Create.DelegateDocument(proto, { title: "child of " + proto.title }); return d; });

