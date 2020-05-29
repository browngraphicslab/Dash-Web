import { makeInterface, createSchema, listSpec } from "./Schema";
import { ScriptField } from "./ScriptField";
import { Doc } from "./Doc";
import { DateField } from "./DateField";

export const documentSchema = createSchema({
    // content properties
    type: "string",             // enumerated type of document -- should be template-specific (ie, start with an '_')
    title: "string",            // document title (can be on either data document or layout)
    isTemplateForField: "string",// if specified, it indicates the document is a template that renders the specified field
    creationDate: DateField,    // when the document was created
    links: listSpec(Doc),       // computed (readonly) list of links associated with this document

    // "Location" properties in a very general sense
    currentTimecode: "number",  // current play back time of a temporal document (video / audio)
    displayTimecode: "number",  // the time that a document should be displayed (e.g., time an annotation should be displayed on a video)
    inOverlay: "boolean",       // whether the document is rendered in an OverlayView which handles selection/dragging differently
    x: "number",                // x coordinate when in a freeform view 
    y: "number",                // y coordinate when in a freeform view 
    z: "number",                // z "coordinate" - non-zero specifies the overlay layer of a freeformview
    zIndex: "number",           // zIndex of a document in a freeform view
    scrollY: "number",          // "command" to scroll a document to a position on load (the value will be reset to 0 after that )
    scrollX: "number",          // "command" to scroll a document to a position on load (the value will be reset to 0 after that )
    scrollTop: "number",        // scroll position of a scrollable document (pdf, text, web)
    scrollLeft: "number",        // scroll position of a scrollable document (pdf, text, web)

    // appearance properties on the layout
    _autoHeight: "boolean",     // whether the height of the document should be computed automatically based on its contents
    _nativeWidth: "number",     // native width of document which determines how much document contents are scaled when the document's width is set
    _nativeHeight: "number",    // "
    _width: "number",           // width of document in its container's coordinate system
    _height: "number",          // "
    _xPadding: "number",        // pixels of padding on left/right of collectionfreeformview contents when fitToBox is set
    _yPadding: "number",        // pixels of padding on top/bottom of collectionfreeformview contents when fitToBox is set
    _xMargin: "number",         // margin added on left/right of most documents to add separation from their container
    _yMargin: "number",         // margin added on top/bottom of most documents to add separation from their container
    _overflow: "string",        // sets overflow behvavior for CollectionFreeForm views
    _showCaption: "string",     // whether editable caption text is overlayed at the bottom of the document 
    _showTitle: "string",       // the fieldkey whose contents should be displayed at the top of the document
    _showTitleHover: "string",  // the showTitle should be shown only on hover
    _showAudio: "boolean",      // whether to show the audio record icon on documents
    _freeformLayoutEngine: "string",// the string ID for the layout engine to use to layout freeform view documents
    _LODdisable: "boolean",     // whether to disbale LOD switching for CollectionFreeFormViews
    _pivotField: "string",      // specifies which field key should be used as the timeline/pivot axis
    _replacedChrome: "string",  // what the default chrome is replaced with. Currently only supports the value of 'replaced' for PresBox's.
    _chromeStatus: "string",    // determines the state of the collection chrome. values allowed are 'replaced', 'enabled', 'disabled', 'collapsed'
    _fontSize: "number",
    _fontFamily: "string",
    _sidebarWidthPercent: "string", // percent of text window width taken up by sidebar

    // appearance properties on the data document
    backgroundColor: "string",  // background color of document
    borderRounding: "string",   // border radius rounding of document
    boxShadow: "string",        // the amount of shadow around the perimeter of a document
    color: "string",            // foreground color of document
    fitToBox: "boolean",        // whether freeform view contents should be zoomed/panned to fill the area of the document view
    fontSize: "string",
    layout: "string",           // this is the native layout string for the document.  templates can be added using other fields and setting layoutKey below
    layoutKey: "string",        // holds the field key for the field that actually holds the current lyoat
    letterSpacing: "string",
    opacity: "number",          // opacity of document
    strokeWidth: "number",
    strokeBezier: "number",

    textTransform: "string",
    treeViewOpen: "boolean",    //  flag denoting whether the documents sub-tree (contents) is visible or hidden
    treeViewExpandedView: "string", // name of field whose contents are being displayed as the document's subtree
    treeViewPreventOpen: "boolean", // ignores the treeViewOpen flag (for allowing a view to not be slaved to other views of the document)

    // interaction and linking properties
    ignoreClick: "boolean",     // whether documents ignores input clicks (but does not ignore manipulation and other events) 
    onClick: ScriptField,       // script to run when document is clicked (can be overriden by an onClick prop)
    onPointerDown: ScriptField, // script to run when document is clicked (can be overriden by an onClick prop)
    onPointerUp: ScriptField,   // script to run when document is clicked (can be overriden by an onClick prop)
    onDragStart: ScriptField,   // script to run when document is dragged (without being selected).  the script should return the Doc to be dropped.
    followLinkLocation: "string",// flag for where to place content when following a click interaction (e.g., onRight, inPlace, inTab, ) 
    isInPlaceContainer: "boolean",// whether the marked object will display addDocTab() calls that target "inPlace" destinations
    isLinkButton: "boolean",    // whether document functions as a link follow button to follow the first link on the document when clicked   
    isBackground: "boolean",    // whether document is a background element and ignores input events (can only select with marquee)
    lockedPosition: "boolean",  // whether the document can be moved (dragged)
    _lockedTransform: "boolean",// whether a freeformview can pan/zoom

    // drag drop properties
    dragFactory: Doc,           // the document that serves as the "template" for the onDragStart script.  ie, to drag out copies of the dragFactory document.
    dropAction: "string",       // override specifying what should happen when this document is dropped (can be "alias", "copy", "move")
    targetDropAction: "string", // allows the target of a drop event to specify the dropAction ("alias", "copy", "move") NOTE: if the document is dropped within the same collection, the dropAction is coerced to 'move'
    childDropAction: "string",  // specify the override for what should happen when the child of a collection is dragged from it and dropped (can be "alias" or "copy")
    removeDropProperties: listSpec("string"), // properties that should be removed from the alias/copy/etc of this document when it is dropped
});


export const collectionSchema = createSchema({
    childLayoutTemplateName: "string", // the name of a template to use to override the layoutKey when rendering a document -- ONLY used in DocHolderBox 
    childLayoutTemplate: Doc, // layout template to use to render children of a collecion
    childLayoutString: "string", //layout string to use to render children of a collection
    childClickedOpenTemplateView: Doc, // layout template to apply to a child when its clicked on in a collection and opened (requires onChildClick or other script to read this value and apply template)
    dontRegisterChildViews: "boolean", // whether views made of this document are registered so that they can be found when drawing links scrollToLinkID: "string",   // id of link being traversed. allows this doc to scroll/highlight/etc its link anchor. scrollToLinkID should be set to undefined by this doc after it sets up its scroll,etc.
    onChildClick: ScriptField, // script to run for each child when its clicked
    onChildDoubleClick: ScriptField, // script to run for each child when its clicked
    onCheckedClick: ScriptField, // script to run when a checkbox is clicked next to a child in a tree view
});

export type Document = makeInterface<[typeof documentSchema]>;
export const Document = makeInterface(documentSchema);
