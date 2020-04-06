import { makeInterface, createSchema, listSpec } from "./Schema";
import { ScriptField } from "./ScriptField";
import { Doc } from "./Doc";
import { DateField } from "./DateField";

export const documentSchema = createSchema({
    type: "string",             // enumerated type of document -- should be template-specific (ie, start with an '_')
    layout: "string",           // this is the native layout string for the document.  templates can be added using other fields and setting layoutKey below
    layoutKey: "string",        // holds the field key for the field that actually holds the current lyoat
    title: "string",            // document title (can be on either data document or layout)
    dropAction: "string",       // override specifying what should happen when this document is dropped (can be "alias" or "copy")
    childDropAction: "string",  // specify the override for what should happen when the child of a collection is dragged from it and dropped (can be "alias" or "copy")
    _autoHeight: "boolean",     // whether the height of the document should be computed automatically based on its contents
    _nativeWidth: "number",     // native width of document which determines how much document contents are scaled when the document's width is set
    _nativeHeight: "number",    // "
    _width: "number",           // width of document in its container's coordinate system
    _height: "number",          // "
    _xPadding: "number",        // pixels of padding on left/right of collectionfreeformview contents when fitToBox is set
    _yPadding: "number",        // pixels of padding on top/bottom of collectionfreeformview contents when fitToBox is set
    _xMargin: "number",         // margin added on left/right of most documents to add separation from their container
    _yMargin: "number",         // margin added on top/bottom of most documents to add separation from their container
    _showCaption: "string",     // whether editable caption text is overlayed at the bottom of the document 
    _showTitle: "string",       // the fieldkey whose contents should be displayed at the top of the document
    _showTitleHover: "string",  // the showTitle should be shown only on hover
    _showAudio: "boolean",      // whether to show the audio record icon on documents
    _freeformLayoutEngine: "string",// the string ID for the layout engine to use to layout freeform view documents
    _LODdisable: "boolean",     // whether to disbale LOD switching for CollectionFreeFormViews
    _pivotField: "string",      // specifies which field should be used as the timeline/pivot axis
    _replacedChrome: "string",  // what the default chrome is replaced with. Currently only supports the value of 'replaced' for PresBox's.
    _chromeStatus: "string",    // determines the state of the collection chrome. values allowed are 'replaced', 'enabled', 'disabled', 'collapsed'
    _freezeChildDimensions: "boolean", // freezes child document dimensions (e.g., used by time/pivot view to make sure all children will be scaled to fit their display rectangle)
    color: "string",            // foreground color of document
    backgroundColor: "string",  // background color of document
    opacity: "number",          // opacity of document
    creationDate: DateField,    // when the document was created
    links: listSpec(Doc),       // computed (readonly) list of links associated with this document
    onClick: ScriptField,       // script to run when document is clicked (can be overriden by an onClick prop)
    onPointerDown: ScriptField, // script to run when document is clicked (can be overriden by an onClick prop)
    onPointerUp: ScriptField,   // script to run when document is clicked (can be overriden by an onClick prop)
    onDragStart: ScriptField,   // script to run when document is dragged (without being selected).  the script should return the Doc to be dropped.
    dragFactory: Doc,           // the document that serves as the "template" for the onDragStart script.  ie, to drag out copies of the dragFactory document.
    removeDropProperties: listSpec("string"), // properties that should be removed from the alias/copy/etc of this document when it is dropped
    isTemplateForField: "string",// when specifies a field key, then the containing document is a template that renders the specified field
    isBackground: "boolean",    // whether document is a background element and ignores input events (can only selet with marquee)
    treeViewOpen: "boolean",    //  flag denoting whether the documents sub-tree (contents) is visible or hidden
    treeViewExpandedView: "string", // name of field whose contents are being displayed as the document's subtree
    treeViewPreventOpen: "boolean", // ignores the treeViewOpen flag (for allowing a view to not be slaved to other views of the document)
    currentTimecode: "number",  // current play back time of a temporal document (video / audio)
    followLinkLocation: "string",// flag for where to place content when following a click interaction (e.g., onRight, inPlace, inTab, ) 
    lockedPosition: "boolean",  // whether the document can be moved (dragged)
    lockedTransform: "boolean", // whether the document can be panned/zoomed
    inOverlay: "boolean",       // whether the document is rendered in an OverlayView which handles selection/dragging differently
    borderRounding: "string",   // border radius rounding of document
    heading: "number",          // the logical layout 'heading' of this document (used by rule provider to stylize h1 header elements, from h2, etc)
    isButton: "boolean",        // whether document functions as a button (overiding native interactions of its content)    
    ignoreClick: "boolean",     // whether documents ignores input clicks (but does not ignore manipulation and other events) 
    scrollToLinkID: "string",   // id of link being traversed. allows this doc to scroll/highlight/etc its link anchor. scrollToLinkID should be set to undefined by this doc after it sets up its scroll,etc.
    strokeWidth: "number",
    fontSize: "string",
    fitToBox: "boolean",        // whether freeform view contents should be zoomed/panned to fill the area of the document view
    letterSpacing: "string",
    textTransform: "string",
    childTemplateName: "string" // the name of a template to use to override the layoutKey when rendering a document in DocumentBox 
});

export const positionSchema = createSchema({
    zIndex: "number",
    x: "number",
    y: "number",
    z: "number",
});

export const collectionSchema = createSchema({
    childLayout: Doc, // layout template for children of a collecion
    childDetailed: Doc, // layout template to apply to a child when its clicked on in a collection and opened (requires onChildClick or other script to use this field)
    onChildClick: ScriptField, // script to run for each child when its clicked
    onCheckedClick: ScriptField, // script to run when a checkbox is clicked next to a child in a tree view
});

export type Document = makeInterface<[typeof documentSchema]>;
export const Document = makeInterface(documentSchema);

export type PositionDocument = makeInterface<[typeof documentSchema, typeof positionSchema]>;
export const PositionDocument = makeInterface(documentSchema, positionSchema);
