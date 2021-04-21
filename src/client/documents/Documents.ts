import { action, runInAction } from "mobx";
import { basename, extname } from "path";
import { DateField } from "../../fields/DateField";
import { Doc, DocListCast, DocListCastAsync, Field, HeightSym, Opt, WidthSym, Initializing } from "../../fields/Doc";
import { Id } from "../../fields/FieldSymbols";
import { HtmlField } from "../../fields/HtmlField";
import { InkField } from "../../fields/InkField";
import { List } from "../../fields/List";
import { ProxyField } from "../../fields/Proxy";
import { RichTextField } from "../../fields/RichTextField";
import { SchemaHeaderField } from "../../fields/SchemaHeaderField";
import { ComputedField, ScriptField } from "../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../fields/Types";
import { AudioField, ImageField, PdfField, VideoField, WebField, YoutubeField } from "../../fields/URLField";
import { SharingPermissions } from "../../fields/util";
import { MessageStore } from "../../server/Message";
import { Upload } from "../../server/SharedMediaTypes";
import { OmitKeys, Utils } from "../../Utils";
import { YoutubeBox } from "../apis/youtube/YoutubeBox";
import { DocServer } from "../DocServer";
import { Networking } from "../Network";
import { DocumentManager } from "../util/DocumentManager";
import { dropActionType } from "../util/DragManager";
import { DirectoryImportBox } from "../util/Import & Export/DirectoryImportBox";
import { LinkManager } from "../util/LinkManager";
import { Scripting } from "../util/Scripting";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { DimUnit } from "../views/collections/collectionMulticolumn/CollectionMulticolumnView";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../views/collections/CollectionView";
import { ContextMenu } from "../views/ContextMenu";
import { ContextMenuProps } from "../views/ContextMenuItem";
import { DFLT_IMAGE_NATIVE_DIM } from "../views/globalCssVariables.scss";
import { ActiveArrowEnd, ActiveArrowStart, ActiveDash, ActiveFillColor, ActiveInkBezierApprox, ActiveInkColor, ActiveInkWidth, InkingStroke } from "../views/InkingStroke";
import { AudioBox } from "../views/nodes/AudioBox";
import { ColorBox } from "../views/nodes/ColorBox";
import { ComparisonBox } from "../views/nodes/ComparisonBox";
import { DocFocusOptions } from "../views/nodes/DocumentView";
import { FilterBox } from "../views/nodes/FilterBox";
import { FontIconBox } from "../views/nodes/FontIconBox";
import { FormattedTextBox } from "../views/nodes/formattedText/FormattedTextBox";
import { ImageBox } from "../views/nodes/ImageBox";
import { KeyValueBox } from "../views/nodes/KeyValueBox";
import { LabelBox } from "../views/nodes/LabelBox";
import { LinkBox } from "../views/nodes/LinkBox";
import { LinkDescriptionPopup } from "../views/nodes/LinkDescriptionPopup";
import { PDFBox } from "../views/nodes/PDFBox";
import { PresBox } from "../views/nodes/PresBox";
import { ScreenshotBox } from "../views/nodes/ScreenshotBox";
import { ScriptingBox } from "../views/nodes/ScriptingBox";
import { SliderBox } from "../views/nodes/SliderBox";
import { TaskCompletionBox } from "../views/nodes/TaskCompletedBox";
import { VideoBox } from "../views/nodes/VideoBox";
import { WebBox } from "../views/nodes/WebBox";
import { PresElementBox } from "../views/presentationview/PresElementBox";
import { SearchBox } from "../views/search/SearchBox";
import { DashWebRTCVideo } from "../views/webcam/DashWebRTCVideo";
import { DocumentType } from "./DocumentTypes";
import { EquationBox } from "../views/nodes/EquationBox";
import { FunctionPlotBox } from "../views/nodes/FunctionPlotBox";
import { CurrentUserUtils } from "../util/CurrentUserUtils";
import { FieldViewProps } from "../views/nodes/FieldView";
const path = require('path');

const defaultNativeImageDim = Number(DFLT_IMAGE_NATIVE_DIM.replace("px", ""));
class EmptyBox {
    public static LayoutString() {
        return "";
    }
}
abstract class FInfo {
    description: string = "";
    type?: string;
    values?: Field[];
    layoutField?: boolean; // is this field a layout (or datadoc) field
    // format?: string; // format to display values (e.g, decimal places, $, etc)
    // parse?: ScriptField; // parse a value from a string
    constructor(d: string, l: boolean = false) { this.description = d; this.layoutField = l; }
}
class BoolInfo extends FInfo { type?= "boolean"; values?: boolean[] = [true, false]; }
class NumInfo extends FInfo { type?= "number"; values?: number[] = []; }
class StrInfo extends FInfo { type?= "string"; values?: string[] = []; }
class DocInfo extends FInfo { type?= "Doc"; values?: Doc[] = []; }
class DimInfo extends FInfo { type?= "DimUnit"; values?= [DimUnit.Pixel, DimUnit.Ratio]; }
class PEInfo extends FInfo { type?= "pointerEvents"; values?= ["all", "none"]; }
class DAInfo extends FInfo { type?= "dropActionType"; values?= ["alias", "copy", "move", "same", "proto", "none"]; }
type BOOLt = BoolInfo | boolean;
type NUMt = NumInfo | number;
type STRt = StrInfo | string;
type DOCt = DocInfo | Doc;
type DIMt = DimInfo | typeof DimUnit.Pixel | typeof DimUnit.Ratio;
type PEVt = PEInfo | "none" | "all";
type DROPt = DAInfo | dropActionType;
export class DocumentOptions {
    system?: BOOLt = new BoolInfo("is this a system created/owned doc");
    _dropAction?: DROPt = new DAInfo("what should happen to this document when it's dropped somewhere else");
    childDropAction?: DROPt = new DAInfo("what should happen to the source document when it's dropped onto a child of a collection ");
    targetDropAction?: DROPt = new DAInfo("what should happen to the source document when ??? ");
    color?: string; // foreground color data doc
    backgroundColor?: STRt = new StrInfo("background color for data doc");
    _backgroundColor?: STRt = new StrInfo("background color for each template layout doc (overrides backgroundColor)", true);
    _autoHeight?: BOOLt = new BoolInfo("whether document automatically resizes vertically to display contents", true);
    _headerHeight?: NUMt = new NumInfo("height of document header used for displaying title", true);
    _headerFontSize?: NUMt = new NumInfo("font size of header of custom notes", true);
    _headerPointerEvents?: PEVt = new PEInfo("types of events the header of a custom text document can consume", true);
    _panX?: NUMt = new NumInfo("horizontal pan location of a freeform view", true);
    _panY?: NUMt = new NumInfo("vertical pan location of a freeform view", true);
    _width?: NUMt = new NumInfo("displayed width of a document", true);
    _height?: NUMt = new NumInfo("displayed height of document", true);
    _nativeWidth?: NUMt = new NumInfo("native width of document contents (e.g., the pixel width of an image)", true);
    _nativeHeight?: NUMt = new NumInfo("native height of document contents (e.g., the pixel height of an image)", true);
    _dimMagnitude?: NUMt = new NumInfo("magnitude of collectionMulti{row,col} element's width or height", true);
    _dimUnit?: DIMt = new DimInfo("units of collectionMulti{row,col} element's width or height - 'px' or '*' for pixels or relative units", true);
    _fitWidth?: BOOLt = new BoolInfo("whether document should scale its contents to fit its rendered width or not (e.g., for PDFviews)", true);
    _fitToBox?: boolean; // whether a freeformview should zoom/scale to create a shrinkwrapped view of its contents
    _lockedPosition?: boolean; // lock the x,y coordinates of the document so that it can't be dragged
    _lockedTransform?: boolean; // lock the panx,pany and scale parameters of the document so that it be panned/zoomed
    _freeformLOD?: boolean; // whether to use LOD to render a freeform document
    _showTitle?: string; // field name to display in header (:hover is an optional suffix)
    _showCaption?: string; // which field to display in the caption area.  leave empty to have no caption
    _scrollTop?: number; // scroll location for pdfs
    _noAutoscroll?: boolean;// whether collections autoscroll when this item is dragged
    _chromeHidden?: boolean; // whether the editing chrome for a document is hidden
    _layerTags?: List<string>; // layer tags a document has (used for tab filtering "layers" in document tab)
    _searchDoc?: boolean; // is this a search document (used to change UI for search results in schema view)
    _forceActive?: boolean; // flag to handle pointer events when not selected (or otherwise active)
    _stayInCollection?: boolean;// whether the document should remain in its collection when someone tries to drag and drop it elsewhere
    _raiseWhenDragged?: boolean; // whether a document is brought to front when dragged.
    _hideContextMenu?: boolean; // whether the context menu can be shown
    _viewType?: string; // sub type of a collection
    _gridGap?: number; // gap between items in masonry view
    _viewScale?: number; // how much a freeform view has been scaled (zoomed)
    _overflow?: string; // set overflow behavior
    _xMargin?: number; // gap between left edge of document and start of masonry/stacking layouts
    _yMargin?: number; // gap between top edge of dcoument and start of masonry/stacking layouts
    _xPadding?: number;
    _yPadding?: number;
    _itemIndex?: number; // which item index the carousel viewer is showing
    _showSidebar?: boolean;  //whether an annotationsidebar should be displayed for text docuemnts
    _singleLine?: boolean; // whether text document is restricted to a single line (carriage returns make new document)
    _columnWidth?: number;
    _columnsHideIfEmpty?: boolean; // whether stacking view column headings should be hidden
    _fontSize?: string;
    _fontWeight?: number;
    _fontFamily?: string;
    _pivotField?: string; // field key used to determine headings for sections in stacking, masonry, pivot views
    _curPage?: number; // current page of a PDF or other? paginated document
    _currentTimecode?: number; // the current timecode of a time-based document (e.g., current time of a video)  value is in seconds
    _currentFrame?: number; // the current frame of a frame-based collection (e.g., progressive slide)
    _timecodeToShow?: number; // the time that a document should be displayed (e.g., when an annotation shows up as a video plays)
    _timecodeToHide?: number; // the time that a document should be hidden
    _timelineLabel?: boolean; // whether the document exists on a timeline
    "_carousel-caption-xMargin"?: number;
    "_carousel-caption-yMargin"?: number;
    x?: number;
    y?: number;
    z?: number; // whether document is in overlay (1) or not (0 or undefined)
    author?: string;
    _layoutKey?: string;
    type?: string;
    title?: string;
    "acl-Public"?: string; // public permissions
    "_acl-Public"?: string; // public permissions
    version?: string; // version identifier for a document
    label?: string;
    hidden?: boolean;
    mediaState?: string; // status of media document: "pendingRecording", "recording", "paused", "playing"
    autoPlayAnchors?: boolean; // whether to play audio/video when an anchor is clicked in a stackedTimeline.
    dontPlayLinkOnSelect?: boolean;  // whether an audio/video should start playing when a link is followed to it.
    toolTip?: string; // tooltip to display on hover
    dontUndo?: boolean; // whether button clicks should be undoable (this is set to true for Undo/Redo/and sidebar buttons that open the siebar panel)
    description?: string; // added for links
    layout?: string | Doc; // default layout string for a document
    contentPointerEvents?: string;  // pointer events allowed for content of a document view.  eg. set to "none" in menuSidebar for sharedDocs so that you can select a document, but not interact with its contents
    childLimitHeight?: number; // whether to limit the height of collection children.  0 - means  height can be no bigger than width
    childLayoutTemplate?: Doc; // template for collection to use to render its children (see PresBox or Buxton layout in tree view)
    childLayoutString?: string; // template string for collection to use to render its children
    childDontRegisterViews?: boolean;
    childHideLinkButton?: boolean; // hide link buttons on all children
    hideLinkButton?: boolean; // whether the blue link counter button should be hidden
    hideAllLinks?: boolean; // whether all individual blue anchor dots should be hidden
    isTemplateForField?: string; // the field key for which the containing document is a rendering template
    isTemplateDoc?: boolean;
    watchedDocuments?: Doc; // list of documents an icon doc monitors in order to display a badge count
    targetScriptKey?: string; // where to write a template script (used by collections with click templates which need to target onClick, onDoubleClick, etc)
    templates?: List<string>;
    hero?: ImageField; // primary image that best represents a compound document (e.g., for a buxton device document that has multiple images)
    caption?: RichTextField;
    opacity?: number;
    defaultBackgroundColor?: string;
    _isLinkButton?: boolean; // marks a document as a button that will follow its primary link when clicked
    isFolder?: boolean;
    lastFrame?: number; // the last frame of a frame-based collection (e.g., progressive slide)
    activeFrame?: number; // the active frame of a document in a frame base collection
    appearFrame?: number; // the frame in which the document appears
    presTransition?: number; //the time taken for the transition TO a document
    presDuration?: number; //the duration of the slide in presentation view
    presProgressivize?: boolean;
    borderRounding?: string;
    boxShadow?: string;
    data?: any;
    baseProto?: boolean; // is this a base prototoype
    dontRegisterView?: boolean;
    lookupField?: ScriptField; // script that returns the value of a field. This script is passed the rootDoc, layoutDoc, field, and container of the document.  see PresBox.
    "onDoubleClick-rawScript"?: string; // onDoubleClick script in raw text form
    "onChildDoubleClick-rawScript"?: string; // onChildDoubleClick script in raw text form
    "onChildClick-rawScript"?: string; // on ChildClick script in raw text form
    "onClick-rawScript"?: string; // onClick script in raw text form
    "onCheckedClick-rawScript"?: string; // onChecked script in raw text form
    "onCheckedClick-params"?: List<string>; // parameter list for onChecked treeview functions
    columnHeaders?: List<SchemaHeaderField>; // headers for stacking views
    schemaHeaders?: List<SchemaHeaderField>; // headers for schema view
    clipWidth?: number; // percent transition from before to after in comparisonBox
    dockingConfig?: string;
    annotationOn?: Doc;
    isPushpin?: boolean;
    _removeDropProperties?: List<string>; // list of properties that should be removed from a document when it is dropped.  e.g., a creator button may be forceActive to allow it be dragged, but the forceActive property can be removed from the dropped document
    iconShape?: string; // shapes of the fonticon border
    layout_linkView?: Doc; // view template for a link document
    layout_keyValue?: string; // view tempalte for key value docs
    linkRelationship?: string; // type of relatinoship a link represents
    linkDisplay?: boolean; // whether a link line should be dipslayed between the two link anchors
    anchor1?: Doc;
    anchor2?: Doc;
    "anchor1-useLinkSmallAnchor"?: boolean; // whether anchor1 of a link should use a miniature anchor dot (as when the anchor is a text selection)
    "anchor2-useLinkSmallAnchor"?: boolean; // whether anchor1 of a link should use a miniature anchor dot (as when the anchor is a text selection)
    ignoreClick?: boolean;
    onClick?: ScriptField;
    onDoubleClick?: ScriptField;
    onChildClick?: ScriptField; // script given to children of a collection to execute when they are clicked
    onChildDoubleClick?: ScriptField; // script given to children of a collection to execute when they are double clicked
    onPointerDown?: ScriptField;
    onPointerUp?: ScriptField;
    dropConverter?: ScriptField; // script to run when documents are dropped on this Document.
    dragFactory?: Doc; // document to create when dragging with a suitable onDragStart script
    clickFactory?: Doc; // document to create when clicking on a button with a suitable onClick script
    onDragStart?: ScriptField; //script to execute at start of drag operation --  e.g., when a "creator" button is dragged this script generates a different document to drop
    cloneFieldFilter?: List<string>; // fields not to copy when the document is clonedclipboard?: Doc;
    useCors?: boolean;
    icon?: string;
    target?: Doc; // available for use in scripts as the primary target document
    sourcePanel?: Doc; // panel to display in 'targetContainer' as the result of a button onClick script
    targetContainer?: Doc; // document whose proto will be set to 'panel' as the result of a onClick click script
    searchFileTypes?: List<string>; // file types allowed in a search query
    strokeWidth?: number;
    freezeChildren?: string; // whether children are now allowed to be added and or removed from a collection
    treeViewHideTitle?: boolean; // whether to hide the top document title of a tree view
    treeViewHideHeader?: boolean; // whether to hide the header for a document in a tree view
    treeViewHideHeaderFields?: boolean; // whether to hide the drop down options for tree view items.
    treeViewShowClearButton?: boolean; // whether a clear button should be displayed 
    treeViewOpenIsTransient?: boolean; // ignores the treeViewOpen Doc flag, allowing a treeViewItem's expand/collapse state to be independent of other views of the same document in the same or any other tree view
    _treeViewOpen?: boolean; // whether this document is expanded in a tree view  (note: need _ and regular versions since this can be specified for both proto and layout docs)
    treeViewOpen?: boolean; // whether this document is expanded in a tree view
    treeViewExpandedView?: string; // which field/thing is displayed when this item is opened in tree view
    treeViewExpandedViewLock?: boolean; // whether the expanded view can be changed
    treeViewChecked?: ScriptField; // script to call when a tree view checkbox is checked
    treeViewTruncateTitleWidth?: number;
    treeViewType?: string; // whether treeview is a Slide, file system, or (default) collection hierarchy
    sidebarColor?: string;  // background color of text sidebar
    sidebarViewType?: string; // collection type of text sidebar
    docMaxAutoHeight?: number; // maximum height for newly created (eg, from pasting) text documents
    text?: string;
    textTransform?: string; // is linear view expanded
    letterSpacing?: string; // is linear view expanded
    flexDirection?: "unset" | "row" | "column" | "row-reverse" | "column-reverse";
    selectedIndex?: number; // which item in a linear view has been selected using the "thumb doc" ui
    clipboard?: Doc;
    searchQuery?: string; // for quersyBox
    linearViewIsExpanded?: boolean; // is linear view expanded
    useLinkSmallAnchor?: boolean;  // whether links to this document should use a miniature linkAnchorBox
    border?: string; //for searchbox
    hoverBackgroundColor?: string; // background color of a label when hovered
}
export namespace Docs {

    const _docOptions = new DocumentOptions();

    export async function setupFieldInfos() {
        return await DocServer.GetRefField("FieldInfos8") as Doc ??
            runInAction(() => {
                const infos = new Doc("FieldInfos8", true);
                const keys = Object.keys(new DocumentOptions());
                for (const key of keys) {
                    const options = (_docOptions as any)[key] as FInfo;
                    const finfo = new Doc();
                    finfo.name = key;
                    switch (options.type) {
                        case "boolean": finfo.options = new List<boolean>(options.values as any as boolean[]); break;
                        case "number": finfo.options = new List<number>(options.values as any as number[]); break;
                        case "Doc": finfo.options = new List<Doc>(options.values as any as Doc[]); break;
                        default: // string, pointerEvents, dimUnit, dropActionType
                            finfo.options = new List<string>(options.values as any as string[]); break;
                    }
                    finfo.layoutField = options.layoutField;
                    finfo.description = options.description;
                    finfo.type = options.type;
                    infos[key] = finfo;
                }
                return infos;
            });
    }

    export let newAccount: boolean = false;

    export namespace Prototypes {

        type LayoutSource = { LayoutString: (key: string) => string };
        type PrototypeTemplate = {
            layout: {
                view: LayoutSource,
                dataField: string
            },
            data?: any,
            options?: Partial<DocumentOptions>
        };
        type TemplateMap = Map<DocumentType, PrototypeTemplate>;
        type PrototypeMap = Map<DocumentType, Doc>;
        const defaultDataKey = "data";

        const TemplateMap: TemplateMap = new Map([
            [DocumentType.RTF, {
                layout: { view: FormattedTextBox, dataField: "text" },
                options: { _height: 150, _xMargin: 10, _yMargin: 10, links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.SEARCH, {
                layout: { view: SearchBox, dataField: defaultDataKey },
                options: { _width: 400, links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.FILTER, {
                layout: { view: FilterBox, dataField: defaultDataKey },
                options: { _width: 400, links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.COLOR, {
                layout: { view: ColorBox, dataField: defaultDataKey },
                options: { _nativeWidth: 220, _nativeHeight: 300, links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.IMG, {
                layout: { view: ImageBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.WEB, {
                layout: { view: WebBox, dataField: defaultDataKey },
                options: { _height: 300, _fitWidth: true, links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.COL, {
                layout: { view: CollectionView, dataField: defaultDataKey },
                options: { _fitWidth: true, _panX: 0, _panY: 0, _viewScale: 1, links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.KVP, {
                layout: { view: KeyValueBox, dataField: defaultDataKey },
                options: { _fitWidth: true, _height: 150 }
            }],
            [DocumentType.VID, {
                layout: { view: VideoBox, dataField: defaultDataKey },
                options: { _currentTimecode: 0, links: ComputedField.MakeFunction("links(self)") as any },
            }],
            [DocumentType.AUDIO, {
                layout: { view: AudioBox, dataField: defaultDataKey },
                options: { _height: 35, backgroundColor: "lightGray", links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.PDF, {
                layout: { view: PDFBox, dataField: defaultDataKey },
                options: { _curPage: 1, _fitWidth: true, links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.IMPORT, {
                layout: { view: DirectoryImportBox, dataField: defaultDataKey },
                options: { _height: 150 }
            }],
            [DocumentType.LINK, {
                layout: { view: LinkBox, dataField: defaultDataKey },
                options: {
                    childDontRegisterViews: true, _isLinkButton: true, _height: 150, description: "",
                    backgroundColor: "lightblue", // lightblue is default color for linking dot and link documents text comment area
                    links: ComputedField.MakeFunction("links(self)") as any,
                    _removeDropProperties: new List(["_layerTags", "isLinkButton"]),
                }
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
                layout: { view: ScriptingBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.YOUTUBE, {
                layout: { view: YoutubeBox, dataField: defaultDataKey }
            }],
            [DocumentType.LABEL, {
                layout: { view: LabelBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.EQUATION, {
                layout: { view: EquationBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.FUNCPLOT, {
                layout: { view: FunctionPlotBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.BUTTON, {
                layout: { view: LabelBox, dataField: "onClick" },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.SLIDER, {
                layout: { view: SliderBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.PRES, {
                layout: { view: PresBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.FONTICON, {
                layout: { view: FontIconBox, dataField: defaultDataKey },
                options: { hideLinkButton: true, _width: 40, _height: 40, borderRounding: "100%", links: ComputedField.MakeFunction("links(self)") as any },
            }],
            [DocumentType.WEBCAM, {
                layout: { view: DashWebRTCVideo, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.PRESELEMENT, {
                layout: { view: PresElementBox, dataField: defaultDataKey }
            }],
            [DocumentType.HTMLANCHOR, {
                layout: { view: CollectionView, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any, hideLinkButton: true }
            }],
            [DocumentType.INK, {
                layout: { view: InkingStroke, dataField: defaultDataKey },
                options: { _fontFamily: "cursive", backgroundColor: "transparent", links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.SCREENSHOT, {
                layout: { view: ScreenshotBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.COMPARISON, {
                layout: { view: ComparisonBox, dataField: defaultDataKey },
                options: { clipWidth: 50, backgroundColor: "gray", targetDropAction: "alias", links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.GROUPDB, {
                data: new List<Doc>(),
                layout: { view: EmptyBox, dataField: defaultDataKey },
                options: { childDropAction: "alias", title: "Global Group Database" }
            }],
            [DocumentType.GROUP, {
                layout: { view: EmptyBox, dataField: defaultDataKey },
                options: { links: ComputedField.MakeFunction("links(self)") as any }
            }],
            [DocumentType.TEXTANCHOR, {
                layout: { view: EmptyBox, dataField: defaultDataKey },
                options: { targetDropAction: "move", links: ComputedField.MakeFunction("links(self)") as any, hideLinkButton: true }
            }]
        ]);

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
            const actualProtos = Docs.newAccount ? {} : await DocServer.GetRefFields(prototypeIds);

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
        export function get(type: DocumentType): Doc { return PrototypeMap.get(type)!; }

        /**
         * A collection of all links in the database.  Ideally, this would be a search, but for now all links are cached here.
         */
        export function MainLinkDocument() { return Prototypes.get(DocumentType.LINKDB); }

        /**
         * A collection of all scripts in the database
         */
        export function MainScriptDocument() { return Prototypes.get(DocumentType.SCRIPTDB); }

        /**
         * A collection of all user acl groups in the database
         */
        export function MainGroupDocument() { return Prototypes.get(DocumentType.GROUPDB); }

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
            const options: DocumentOptions = {
                system: true, _layoutKey: "layout", title, type, baseProto: true, x: 0, y: 0, _width: 300, ...(template.options || {}),
                layout: layout.view?.LayoutString(layout.dataField), data: template.data, layout_keyValue: KeyValueBox.LayoutString("")
            };
            return Doc.assign(new Doc(prototypeId, true), options as any, undefined, true);
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
                _height: 400
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
                    const doc = StackingDocument(deviceImages, { title, hero: new ImageField(constructed[0].url) });
                    doc.nameAliases = new List<string>([title.toLowerCase()]);
                    // add the parsed attributes to this main document
                    Doc.Get.FromJson({ data: device, appendToExisting: { targetDoc: Doc.GetProto(doc) } });
                    Doc.AddDocToList(parentProto, "data", doc);
                } else if (errors) {
                    console.log("Documents:" + errors);
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
        function InstanceFromProto(proto: Doc, data: Field | undefined, options: DocumentOptions, delegId?: string, fieldKey: string = "data", protoId?: string) {
            const viewKeys = ["x", "y", "system"]; // keys that should be addded to the view document even though they don't begin with an "_"
            const { omit: dataProps, extract: viewProps } = OmitKeys(options, viewKeys, "^_");

            dataProps.system = viewProps.system;
            dataProps.isPrototype = true;
            dataProps.author = Doc.CurrentUserEmail;
            dataProps.creationDate = new DateField;
            dataProps[`${fieldKey}-lastModified`] = new DateField;
            dataProps["acl-Override"] = "None";
            dataProps["acl-Public"] = Doc.UserDoc()?.defaultAclPrivate ? SharingPermissions.None : SharingPermissions.Add;
            dataProps[fieldKey] = data;
            // so that the list of annotations is already initialised, prevents issues in addonly.
            // without this, if a doc has no annotations but the user has AddOnly privileges, they won't be able to add an annotation because they would have needed to create the field's list which they don't have permissions to do.
            dataProps[fieldKey + "-annotations"] = new List<Doc>();
            const dataDoc = Doc.assign(Doc.MakeDelegate(proto, protoId), dataProps, undefined, true);

            viewProps.author = Doc.CurrentUserEmail;
            viewProps["acl-Override"] = "None";
            viewProps["acl-Public"] = Doc.UserDoc()?.defaultAclPrivate ? SharingPermissions.None : SharingPermissions.Add;
            const viewDoc = Doc.assign(Doc.MakeDelegate(dataDoc, delegId), viewProps, true, true);
            ![DocumentType.LINK, DocumentType.TEXTANCHOR, DocumentType.LABEL].includes(viewDoc.type as any) && DocUtils.MakeLinkToActiveAudio(() => viewDoc);

            !Doc.IsSystem(dataDoc) && ![DocumentType.HTMLANCHOR, DocumentType.KVP, DocumentType.LINK, DocumentType.LINKANCHOR, DocumentType.TEXTANCHOR].includes(proto.type as any) &&
                !dataDoc.isFolder && !dataProps.annotationOn && Doc.AddDocToList(Cast(Doc.UserDoc().myFileOrphans, Doc, null), "data", dataDoc);

            return viewDoc;
        }

        export function ImageDocument(url: string, options: DocumentOptions = {}) {
            const imgField = new ImageField(new URL(url));
            return InstanceFromProto(Prototypes.get(DocumentType.IMG), imgField, { title: path.basename(url), ...options });
        }

        export function PresDocument(initial: List<Doc> = new List(), options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.PRES), initial, options);
        }

        export function ScriptingDocument(script: Opt<ScriptField>, options: DocumentOptions = {}, fieldKey?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.SCRIPTING), script,
                { ...options, layout: fieldKey ? ScriptingBox.LayoutString(fieldKey) : undefined });
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

        export function ScreenshotDocument(title: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.SCREENSHOT), "", { ...options, title });
        }

        export function ComparisonDocument(options: DocumentOptions = { title: "Comparison Box" }) {
            return InstanceFromProto(Prototypes.get(DocumentType.COMPARISON), "", options);
        }

        export function AudioDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.AUDIO), new AudioField(new URL(url)),
                { ...options, backgroundColor: ComputedField.MakeFunction("this._mediaState === 'playing' ? 'green':'gray'") as any });
        }

        export function SearchDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.SEARCH), new List<Doc>([]), options);
        }

        export function ColorDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.COLOR), "", options);
        }

        export function RTFDocument(field: RichTextField, options: DocumentOptions = {}, fieldKey: string = "text") {
            return InstanceFromProto(Prototypes.get(DocumentType.RTF), field, options, undefined, fieldKey);
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
            const linkDoc = InstanceFromProto(Prototypes.get(DocumentType.LINK), undefined, {
                anchor1: source.doc, anchor2: target.doc, ...options
            }, id);

            LinkManager.Instance.addLink(linkDoc);

            return linkDoc;
        }

        export function InkDocument(color: string, tool: string, strokeWidth: string, strokeBezier: string, fillColor: string, arrowStart: string, arrowEnd: string, dash: string, points: { X: number, Y: number }[], options: DocumentOptions = {}) {
            const I = new Doc();
            I[Initializing] = true;
            I.type = DocumentType.INK;
            I.layout = InkingStroke.LayoutString("data");
            I.color = color;
            I.fillColor = fillColor;
            I.strokeWidth = Number(strokeWidth);
            I.strokeBezier = strokeBezier;
            I.strokeStartMarker = arrowStart;
            I.strokeEndMarker = arrowEnd;
            I.strokeDash = dash;
            I.tool = tool;
            I.title = "ink";
            I.x = options.x;
            I.y = options.y;
            I._backgroundColor = "transparent";
            I._width = options._width as number;
            I._height = options._height as number;
            I._fontFamily = "cursive";
            I.author = Doc.CurrentUserEmail;
            I.rotation = 0;
            I.data = new InkField(points);
            I["acl-Public"] = Doc.UserDoc()?.defaultAclPrivate ? SharingPermissions.None : SharingPermissions.Add;
            I["acl-Override"] = "None";
            I[Initializing] = false;
            return I;
        }

        export function PdfDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.PDF), new PdfField(new URL(url)), options);
        }

        export function WebDocument(url: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.WEB), url ? new WebField(new URL(url)) : undefined, options);
        }

        export function HtmlDocument(html: string, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.WEB), new HtmlField(html), options);
        }

        export function KVPDocument(document: Doc, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.KVP), document, { title: document.title + ".kvp", ...options });
        }

        export function TextanchorDocument(options: DocumentOptions = {}, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.TEXTANCHOR), undefined, options, id);
        }

        export function FreeformDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            const inst = InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Freeform }, id);
            documents.map(d => d.context = inst);
            return inst;
        }
        export function HTMLAnchorDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.HTMLANCHOR), new List(documents), options, id);
        }

        export function PileDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { _noAutoscroll: true, ...options, _viewType: CollectionViewType.Pile }, id);
        }

        export function LinearDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Linear }, id);
        }

        export function MapDocument(documents: Array<Doc>, options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Map });
        }

        export function CarouselDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Carousel });
        }

        export function Carousel3DDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Carousel3D });
        }

        export function SchemaDocument(schemaHeaders: SchemaHeaderField[], documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { schemaHeaders: new List(schemaHeaders), ...options, _viewType: CollectionViewType.Schema });
        }

        export function TreeDocument(documents: Array<Doc>, options: DocumentOptions, id?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Tree }, id);
        }

        export function StackingDocument(documents: Array<Doc>, options: DocumentOptions, id?: string, protoId?: string) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Stacking }, id, undefined, protoId);
        }

        export function MulticolumnDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Multicolumn });
        }
        export function MultirowDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Multirow });
        }

        export function MasonryDocument(documents: Array<Doc>, options: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List(documents), { ...options, _viewType: CollectionViewType.Masonry });
        }

        export function LabelDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.LABEL), undefined, { ...(options || {}) });
        }

        export function EquationDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.EQUATION), undefined, { ...(options || {}) });
        }

        export function FunctionPlotDocument(documents: Array<Doc>, options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.FUNCPLOT), new List(documents), { ...(options || {}) });
        }

        export function ButtonDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.BUTTON), undefined, { ...(options || {}), "onClick-rawScript": "-script-" });
        }

        export function SliderDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.SLIDER), undefined, { ...(options || {}) });
        }

        export function FontIconDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.FONTICON), undefined, { ...(options || {}) });
        }
        export function FilterDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.FILTER), undefined, { ...(options || {}) });
        }

        export function PresElementBoxDocument(options?: DocumentOptions) {
            return InstanceFromProto(Prototypes.get(DocumentType.PRESELEMENT), undefined, { ...(options || {}) });
        }

        export function DockDocument(documents: Array<Doc>, config: string, options: DocumentOptions, id?: string) {
            const tabs = TreeDocument(documents, { title: "On-Screen Tabs", childDontRegisterViews: true, freezeChildren: "remove|add", treeViewExpandedViewLock: true, treeViewExpandedView: "data", _fitWidth: true, system: true });
            const all = TreeDocument([], { title: "Off-Screen Tabs", childDontRegisterViews: true, freezeChildren: "add", treeViewExpandedViewLock: true, treeViewExpandedView: "data", system: true });
            return InstanceFromProto(Prototypes.get(DocumentType.COL), new List([tabs, all]), { freezeChildren: "remove|add", treeViewExpandedViewLock: true, treeViewExpandedView: "data", ...options, _viewType: CollectionViewType.Docking, dockingConfig: config }, id);
        }

        export function DirectoryImportDocument(options: DocumentOptions = {}) {
            return InstanceFromProto(Prototypes.get(DocumentType.IMPORT), new List<Doc>(), options);
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
                            ...configs.map(config => CollectionDockingView.makeDocumentConfig(config.doc, undefined, config.initialWidth))
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
    export function Excluded(d: Doc, docFilters: string[]) {
        const filterFacets: { [key: string]: { [value: string]: string } } = {};  // maps each filter key to an object with value=>modifier fields
        docFilters.forEach(filter => {
            const fields = filter.split(":");
            const key = fields[0];
            const value = fields[1];
            const modifiers = fields[2];
            if (!filterFacets[key]) {
                filterFacets[key] = {};
            }
            filterFacets[key][value] = modifiers;
        });

        if (d.z) return false;
        for (const facetKey of Object.keys(filterFacets)) {
            const facet = filterFacets[facetKey];
            const xs = Object.keys(facet).filter(value => facet[value] === "x");
            const failsNotEqualFacets = xs?.some(value => Doc.matchFieldValue(d, facetKey, value));
            if (failsNotEqualFacets) {
                return true;
            }
        }
        return false;
    }
    /**
     * @param docs 
     * @param docFilters 
     * @param docRangeFilters 
     * @param viewSpecScript 
     * Given a list of docs and docFilters, @returns the list of Docs that match those filters 
     */
    export function FilterDocs(docs: Doc[], docFilters: string[], docRangeFilters: string[], viewSpecScript?: ScriptField, parentCollection?: Doc) {
        const childDocs = viewSpecScript ? docs.filter(d => viewSpecScript.script.run({ doc: d }, console.log).result) : docs;
        if (!docFilters?.length && !docRangeFilters?.length) {
            return childDocs.filter(d => !d.cookies);  // remove documents that need a cookie if there are no filters to provide one
        }

        const filterFacets: { [key: string]: { [value: string]: string } } = {};  // maps each filter key to an object with value=>modifier fields
        docFilters.forEach(filter => {
            const fields = filter.split(":");
            const key = fields[0];
            const value = fields[1];
            const modifiers = fields[2];
            if (!filterFacets[key]) {
                filterFacets[key] = {};
            }
            filterFacets[key][value] = modifiers;
        });

        const filteredDocs = docFilters.length ? childDocs.filter(d => {
            if (d.z) return true;
            // if the document needs a cookie but no filter provides the cookie, then the document does not pass the filter
            if (d.cookies && (!filterFacets.cookies || !Object.keys(filterFacets.cookies).some(key => d.cookies === key))) {
                return false;
            }

            for (const facetKey of Object.keys(filterFacets).filter(fkey => fkey !== "cookies")) {
                const facet = filterFacets[facetKey];

                // facets that match some value in the field of the document (e.g. some text field)
                const matches = Object.keys(facet).filter(value => value !== "cookies" && facet[value] === "match");

                // facets that have a check next to them
                const checks = Object.keys(facet).filter(value => facet[value] === "check");

                // facets that have an x next to them
                const xs = Object.keys(facet).filter(value => facet[value] === "x");

                if (!xs.length && !checks.length && !matches.length) return true;
                const failsNotEqualFacets = !xs.length ? false : xs.some(value => Doc.matchFieldValue(d, facetKey, value));
                const satisfiesCheckFacets = !checks.length ? true : checks.some(value => Doc.matchFieldValue(d, facetKey, value));
                const satisfiesMatchFacets = !matches.length ? true : matches.some(value => {
                    if (facetKey.startsWith("*")) { //  fields starting with a '*' are used to match families of related fields.  ie, *lastModified will match text-lastModified, data-lastModified, etc
                        const allKeys = Array.from(Object.keys(d));
                        allKeys.push(...Object.keys(Doc.GetProto(d)));
                        const keys = allKeys.filter(key => key.includes(facetKey.substring(1)));
                        return keys.some(key => Field.toString(d[key] as Field).includes(value));
                    }
                    return Field.toString(d[facetKey] as Field).includes(value);
                });
                // if we're ORing them together, the default return is false, and we return true for a doc if it satisfies any one set of criteria
                if ((parentCollection?.currentFilter as Doc)?.filterBoolean === "OR") {
                    if (satisfiesCheckFacets && !failsNotEqualFacets && satisfiesMatchFacets) return true;
                }
                // if we're ANDing them together, the default return is true, and we return false for a doc if it doesn't satisfy any set of criteria
                else {
                    if (!satisfiesCheckFacets || failsNotEqualFacets || (matches.length && !satisfiesMatchFacets)) return false;
                }

            }
            return (parentCollection?.currentFilter as Doc)?.filterBoolean === "OR" ? false : true;
        }) : childDocs;
        const rangeFilteredDocs = filteredDocs.filter(d => {
            for (let i = 0; i < docRangeFilters.length; i += 3) {
                const key = docRangeFilters[i];
                const min = Number(docRangeFilters[i + 1]);
                const max = Number(docRangeFilters[i + 2]);
                const val = Cast(d[key], "number", null);
                if (val < min || val > max) return false;
                if (val === undefined) {
                    //console.log("Should 'undefined' pass range filter or not?")
                }
            }
            return true;
        });
        return rangeFilteredDocs;
    }

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

    export function DefaultFocus(doc: Doc, options?: DocFocusOptions) {
        options?.afterFocus?.(false);
    }

    export let ActiveRecordings: { props: FieldViewProps, getAnchor: () => Doc }[] = [];

    export function MakeLinkToActiveAudio(getSourceDoc: () => Doc, broadcastEvent = true) {
        broadcastEvent && runInAction(() => DocumentManager.Instance.RecordingEvent = DocumentManager.Instance.RecordingEvent + 1);
        return DocUtils.ActiveRecordings.map(audio =>
            DocUtils.MakeLink({ doc: getSourceDoc() }, { doc: audio.getAnchor() || audio.props.Document }, "recording link", "recording timeline"));
    }

    export function MakeLink(source: { doc: Doc }, target: { doc: Doc }, linkRelationship: string = "", description: string = "", id?: string, allowParCollectionLink?: boolean, showPopup?: number[]) {
        const sv = DocumentManager.Instance.getDocumentView(source.doc);
        if (!allowParCollectionLink && sv?.props.ContainingCollectionDoc === target.doc) return;
        if (target.doc === Doc.UserDoc()) return undefined;

        const makeLink = action((linkDoc: Doc, showPopup?: number[]) => {
            if (showPopup) {
                LinkManager.currentLink = linkDoc;

                TaskCompletionBox.textDisplayed = "Link Created";
                TaskCompletionBox.popupX = showPopup[0];
                TaskCompletionBox.popupY = showPopup[1] - 33;
                TaskCompletionBox.taskCompleted = true;

                LinkDescriptionPopup.popupX = showPopup[0];
                LinkDescriptionPopup.popupY = showPopup[1];
                LinkDescriptionPopup.descriptionPopup = true;

                const rect = document.body.getBoundingClientRect();
                if (LinkDescriptionPopup.popupX + 200 > rect.width) {
                    LinkDescriptionPopup.popupX -= 190;
                    TaskCompletionBox.popupX -= 40;
                }
                if (LinkDescriptionPopup.popupY + 100 > rect.height) {
                    LinkDescriptionPopup.popupY -= 40;
                    TaskCompletionBox.popupY -= 40;
                }

                setTimeout(action(() => TaskCompletionBox.taskCompleted = false), 2500);
            }
            return linkDoc;
        });

        return makeLink(Docs.Create.LinkDocument(source, target, {
            title: ComputedField.MakeFunction("generateLinkTitle(self)") as any,
            "anchor1-useLinkSmallAnchor": source.doc.useLinkSmallAnchor ? true : undefined,
            "anchor2-useLinkSmallAnchor": target.doc.useLinkSmallAnchor ? true : undefined,
            "acl-Public": SharingPermissions.Add,
            "_acl-Public": SharingPermissions.Add,
            layout_linkView: Cast(Cast(Doc.UserDoc()["template-button-link"], Doc, null).dragFactory, Doc, null),
            linkDisplay: true, hidden: true,
            linkRelationship,
            _layoutKey: "layout_linkView",
            description
        }, id), showPopup);
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
            created = Docs.Create.InkDocument(ActiveInkColor(), CurrentUserUtils.SelectedTool, ActiveInkWidth(), ActiveInkBezierApprox(), ActiveFillColor(), ActiveArrowStart(), ActiveArrowEnd(), ActiveDash(), (field).inkData, resolved);
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
            if (!options._height) options._height = (options._width as number) * 2 / 3;
        }
        if (type.indexOf("audio") !== -1) {
            ctor = Docs.Create.AudioDocument;
        }
        if (type.indexOf("pdf") !== -1) {
            ctor = Docs.Create.PdfDocument;
            if (!options._width) options._width = 400;
            if (!options._height) options._height = (options._width as number) * 1200 / 927;
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
                        alias._width = (options._width as number) || 300;
                        alias._height = (options._height as number) || (options._width as number) || 300;
                        return alias;
                    }
                    return undefined;
                });
            }
            ctor = Docs.Create.WebDocument;
            options = { ...options, _width: 400, _height: 512, title: path, };
        }
        return ctor ? ctor(path, options) : undefined;
    }

    export function addDocumentCreatorMenuItems(docTextAdder: (d: Doc) => void, docAdder: (d: Doc) => void, x: number, y: number, simpleMenu: boolean = false): void {
        !simpleMenu && ContextMenu.Instance.addItem({
            description: "Add Note ...",
            subitems: DocListCast((Doc.UserDoc()["template-notes"] as Doc).data).map((note, i) => ({
                description: ":" + StrCast(note.title),
                event: undoBatch((args: { x: number, y: number }) => {
                    const textDoc = Docs.Create.TextDocument("", {
                        _width: 200, x, y, _autoHeight: note._autoHeight !== false,
                        title: StrCast(note.title) + "#" + (note.aliasCount = NumCast(note.aliasCount) + 1)
                    });
                    textDoc.layoutKey = "layout_" + note.title;
                    textDoc[textDoc.layoutKey] = note;
                    docTextAdder(textDoc);
                }),
                icon: "eye"
            })) as ContextMenuProps[],
            icon: "eye"
        });
        ContextMenu.Instance.addItem({
            description: ":=math", event: () => {
                const created = Docs.Create.EquationDocument();
                if (created) {
                    created.author = Doc.CurrentUserEmail;
                    created.x = x;
                    created.y = y;
                    created.width = 300;
                    created.height = 35;
                    EquationBox.SelectOnLoad = created[Id];
                    docAdder?.(created);
                }
            }, icon: "compress-arrows-alt"
        });
        ContextMenu.Instance.addItem({
            description: "Add Template Doc ...",
            subitems: DocListCast(Cast(Doc.UserDoc().myItemCreators, Doc, null)?.data).filter(btnDoc => !btnDoc.hidden).map(btnDoc => Cast(btnDoc?.dragFactory, Doc, null)).filter(doc => doc && doc !== Doc.UserDoc().emptyPresentation).map((dragDoc, i) => ({
                description: ":" + StrCast(dragDoc.title),
                event: undoBatch((args: { x: number, y: number }) => {
                    const newDoc = Doc.copyDragFactory(dragDoc);
                    if (newDoc) {
                        newDoc.author = Doc.CurrentUserEmail;
                        newDoc.x = x;
                        newDoc.y = y;
                        if (newDoc.type === DocumentType.RTF) FormattedTextBox.SelectOnLoad = newDoc[Id];
                        docAdder?.(newDoc);
                    }
                }),
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
        return doc;
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
                d._timecodeToShow = undefined;  // bcz: this should be automatic somehow.. along with any other properties that were logically associated with the original collection
            });
        });
        if (x !== undefined && y !== undefined) {
            const newCollection = Docs.Create.PileDocument(docList, { title: "pileup", x: x - 55, y: y - 55, _width: 110, _height: 100, _overflow: "visible" });
            newCollection.x = NumCast(newCollection.x) + NumCast(newCollection._width) / 2 - 55;
            newCollection.y = NumCast(newCollection.y) + NumCast(newCollection._height) / 2 - 55;
            newCollection._width = newCollection._height = 110;
            //newCollection.borderRounding = "40px";
            newCollection._jitterRotation = 10;
            newCollection._backgroundColor = "gray";
            return newCollection;
        }
    }

    export function LeavePushpin(doc: Doc, annotationField: string) {
        if (doc.isPushpin) return undefined;
        const context = Cast(doc.context, Doc, null) ?? Cast(doc.annotationOn, Doc, null);
        const hasContextAnchor = DocListCast(doc.links).
            some(l =>
                (l.anchor2 === doc && Cast(l.anchor1, Doc, null)?.annotationOn === context) ||
                (l.anchor1 === doc && Cast(l.anchor2, Doc, null)?.annotationOn === context));
        if (context && !hasContextAnchor && (context.type === DocumentType.VID || context.type === DocumentType.WEB || context.type === DocumentType.PDF || context.type === DocumentType.IMG)) {
            const pushpin = Docs.Create.FontIconDocument({
                title: "pushpin", label: "", annotationOn: Cast(doc.annotationOn, Doc, null), isPushpin: true,
                icon: "map-pin", x: Cast(doc.x, "number", null), y: Cast(doc.y, "number", null), backgroundColor: "#ACCEF7",
                _width: 15, _height: 15, _xPadding: 0, _isLinkButton: true, _timecodeToShow: Cast(doc._timecodeToShow, "number", null)
            });
            Doc.AddDocToList(context, annotationField, pushpin);
            const pushpinLink = DocUtils.MakeLink({ doc: pushpin }, { doc: doc }, "pushpin", "");
            doc._timecodeToShow = undefined;
            return pushpin;
        }
        return undefined;
    }

    export async function addFieldEnumerations(doc: Opt<Doc>, enumeratedFieldKey: string, enumerations: { title: string, _backgroundColor?: string, color?: string }[]) {
        let optionsCollection = await DocServer.GetRefField(enumeratedFieldKey);
        if (!(optionsCollection instanceof Doc)) {
            optionsCollection = Docs.Create.StackingDocument([], { title: `${enumeratedFieldKey} field set`, system: true }, enumeratedFieldKey);
            Doc.AddDocToList((Doc.UserDoc().fieldTypes as Doc), "data", optionsCollection as Doc);
        }
        const options = optionsCollection as Doc;
        const targetDoc = doc && Doc.GetProto(Cast(doc.rootDocument, Doc, null) || doc);
        const docFind = `options.data?.find(doc => doc.title === (this.rootDocument||this)["${enumeratedFieldKey}"])?`;
        targetDoc && (targetDoc.backgroundColor = ComputedField.MakeFunction(docFind + `._backgroundColor || "white"`, undefined, { options }));
        targetDoc && (targetDoc.color = ComputedField.MakeFunction(docFind + `.color || "black"`, undefined, { options }));
        targetDoc && (targetDoc.borderRounding = ComputedField.MakeFunction(docFind + `.borderRounding`, undefined, { options }));
        enumerations.map(enumeration => {
            const found = DocListCast(options.data).find(d => d.title === enumeration.title);
            if (found) {
                found._backgroundColor = enumeration._backgroundColor || found._backgroundColor;
                found._color = enumeration.color || found._color;
            } else {
                Doc.AddDocToList(options, "data", Docs.Create.TextDocument(enumeration.title, { ...enumeration, system: true }));
            }
        });
        return optionsCollection;
    }

    export async function uploadFilesToDocs(files: File[], options: DocumentOptions) {
        const generatedDocuments: Doc[] = [];
        for (const { source: { name, type }, result } of await Networking.UploadFilesToServer(files)) {
            if (result instanceof Error) {
                alert(`Upload failed: ${result.message}`);
                return [];
            }
            const full = { ...options, _width: 400, title: name };
            const pathname = Utils.prepend(result.accessPaths.agnostic.client);
            const doc = await DocUtils.DocumentFromType(type, pathname, full);
            if (!doc) {
                continue;
            }
            const proto = Doc.GetProto(doc);
            proto.text = result.rawText;
            proto.fileUpload = basename(pathname).replace("upload_", "").replace(/\.[a-z0-9]*$/, "");
            if (Upload.isImageInformation(result)) {
                const maxNativeDim = Math.min(Math.max(result.nativeHeight, result.nativeWidth), defaultNativeImageDim);
                proto["data-nativeOrientation"] = result.exifData?.data?.image?.Orientation;
                proto["data-nativeWidth"] = (result.nativeWidth < result.nativeHeight) ? maxNativeDim * result.nativeWidth / result.nativeHeight : maxNativeDim;
                proto["data-nativeHeight"] = (result.nativeWidth < result.nativeHeight) ? maxNativeDim : maxNativeDim / (result.nativeWidth / result.nativeHeight);
                if (Number(result.exifData?.data?.image?.Orientation) >= 5) {
                    proto["data-nativeHeight"] = (result.nativeWidth < result.nativeHeight) ? maxNativeDim * result.nativeWidth / result.nativeHeight : maxNativeDim;
                    proto["data-nativeWidth"] = (result.nativeWidth < result.nativeHeight) ? maxNativeDim : maxNativeDim / (result.nativeWidth / result.nativeHeight);
                }
                proto.contentSize = result.contentSize;
            }
            generatedDocuments.push(doc);
        }
        return generatedDocuments;
    }
}

Scripting.addGlobal("Docs", Docs);
Scripting.addGlobal(function makeDelegate(proto: any) { const d = Docs.Create.DelegateDocument(proto, { title: "child of " + proto.title }); return d; });
Scripting.addGlobal(function generateLinkTitle(self: Doc) {
    const anchor1title = self.anchor1 && self.anchor1 !== self ? Cast(self.anchor1, Doc, null).title : "<?>";
    const anchor2title = self.anchor2 && self.anchor2 !== self ? Cast(self.anchor2, Doc, null).title : "<?>";
    const relation = self.linkRelationship || "to";
    return `${anchor1title} (${relation}) ${anchor2title}`;
});