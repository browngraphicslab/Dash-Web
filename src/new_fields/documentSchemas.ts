import { makeInterface, createSchema, listSpec } from "./Schema";
import { ScriptField } from "./ScriptField";
import { Doc } from "./Doc";
import { DateField } from "./DateField";

export const documentSchema = createSchema({
    layout: "string",           // this is the native layout string for the document.  templates can be added using other fields and setting layoutKey below (see layoutCustom as an example)
    layoutKey: "string",        // holds the field key for the field that actually holds the current lyoat
    layoutCustom: Doc,          // used to hold a custom layout (there's nothing special about this field .. any field could hold a custom layout that can be selected by setting 'layoutKey')
    title: "string",            // document title (can be on either data document or layout)
    nativeWidth: "number",      // native width of document which determines how much document contents are scaled when the document's width is set
    nativeHeight: "number",     // "
    width: "number",            // width of document in its container's coordinate system
    height: "number",           // "
    color: "string",            // foreground color of document
    backgroundColor: "string",  // background color of document
    opacity: "number",          // opacity of document
    creationDate: DateField,     // when the document was created
    links: listSpec(Doc),       // computed (readonly) list of links associated with this document
    dropAction: "string",       // override specifying what should happen when this document is dropped (can be "alias" or "copy")
    removeDropProperties: listSpec("string"), // properties that should be removed from the alias/copy/etc of this document when it is dropped
    onClick: ScriptField,       // script to run when document is clicked (can be overriden by an onClick prop)
    onPointerDown: ScriptField,       // script to run when document is clicked (can be overriden by an onClick prop)
    onPointerUp: ScriptField,       // script to run when document is clicked (can be overriden by an onClick prop)
    onDragStart: ScriptField,   // script to run when document is dragged (without being selected).  the script should return the Doc to be dropped.
    dragFactory: Doc,           // the document that serves as the "template" for the onDragStart script.  ie, to drag out copies of the dragFactory document.
    ignoreAspect: "boolean",    // whether aspect ratio should be ignored when laying out or manipulating the document
    autoHeight: "boolean",      // whether the height of the document should be computed automatically based on its contents
    isTemplateField: "boolean", // whether this document acts as a template layout for describing how other documents should be displayed
    isBackground: "boolean",    // whether document is a background element and ignores input events (can only selet with marquee)
    type: "string",             // enumerated type of document
    treeViewOpen: "boolean",    //  flag denoting whether the documents sub-tree (contents) is visible or hidden
    treeViewExpandedView: "string", // name of field whose contents are being displayed as the document's subtree
    preventTreeViewOpen: "boolean", // ignores the treeViewOpen flag (for allowing a view to not be slaved to other views of the document)
    currentTimecode: "number",   // current play back time of a temporal document (video / audio)
    summarizedDocs: listSpec(Doc), // documents that are summarized by this document (and which will typically be opened by clicking this document)
    maximizedDocs: listSpec(Doc), // documents to maximize when clicking this document (generally this document will be an icon)
    maximizeLocation: "string", // flag for where to place content when following a click interaction (e.g., onRight, inPlace, inTab) 
    lockedPosition: "boolean",  // whether the document can be moved (dragged)
    lockedTransform: "boolean", // whether the document can be panned/zoomed
    inOverlay: "boolean",       // whether the document is rendered in an OverlayView which handles selection/dragging differently
    borderRounding: "string",   // border radius rounding of document
    searchFields: "string",     // the search fields to display when this document matches a search in its metadata
    heading: "number",          // the logical layout 'heading' of this document (used by rule provider to stylize h1 header elements, from h2, etc)
    showCaption: "string",      // whether editable caption text is overlayed at the bottom of the document 
    showTitle: "string",        // whether an editable title banner is displayed at tht top of the document
    isButton: "boolean",        // whether document functions as a button (overiding native interactions of its content)    
    ignoreClick: "boolean",     // whether documents ignores input clicks (but does not ignore manipulation and other events) 
    isAnimating: "string",      // whether the document is in the midst of animating between two layouts (used by icons to de/iconify documents).  value is undefined|"min"|"max"
    animateToDimensions: listSpec("number"), // layout information about the target rectangle a document is animating towards 
    scrollToLinkID: "string",   // id of link being traversed. allows this doc to scroll/highlight/etc its link anchor. scrollToLinkID should be set to undefined by this doc after it sets up its scroll,etc.
    strokeWidth: "number",
    fontSize: "string",
    LODarea: "number",          // area (width*height) where CollectionFreeFormViews switch from a label to rendering contents
    LODdisable: "boolean",      // whether to disbale LOD switching for CollectionFreeFormViews
});

export const positionSchema = createSchema({
    zIndex: "number",
    x: "number",
    y: "number",
    z: "number",
});

export type Document = makeInterface<[typeof documentSchema]>;
export const Document = makeInterface(documentSchema);

export type PositionDocument = makeInterface<[typeof documentSchema, typeof positionSchema]>;
export const PositionDocument = makeInterface(documentSchema, positionSchema);
