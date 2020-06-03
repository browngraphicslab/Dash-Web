export enum DocumentType {
    NONE = "none",

    // core data types
    RTF = "rtf",      // rich text
    IMG = "image",      // image box
    WEB = "web",        // web page or html clipping
    COL = "collection", // collection
    KVP = "kvp",        // key value pane
    VID = "video",      // video
    AUDIO = "audio",    // audio
    PDF = "pdf",        // pdf
    INK = "ink",        // ink stroke
    SCREENSHOT = "screenshot",  // view of a desktop application
    FONTICON = "fonticonbox",   // font icon
    SEARCH = "search",            // search query
    LABEL = "label",            // simple text label
    BUTTON = "button",          // onClick button
    WEBCAM = "webcam",          // webcam
    PDFANNO = "pdfanno",        // pdf text selection (could be just a collection?)
    DATE = "date",              // calendar view of a date
    SCRIPTING = "script",       // script editor

    // special purpose wrappers that either take no data or are compositions of lower level types
    LINK = "link",              // link  (view of a document that acts as a link)
    LINKANCHOR = "linkanchor",  // blue dot link anchor  (view of a link document's anchor)
    IMPORT = "import",          // directory import box  (file system directory)
    SLIDER = "slider",          // number slider  (view of a number)
    PRES = "presentation",      // presentation   (view of a collection) --- shouldn't this be a view type?  technically requires a special view in which documents must have their aliasOf fields filled in
    PRESELEMENT = "preselement",// presentation item (view of a document in a collection)
    COLOR = "color",            // color picker (view of a color picker for a color string)
    YOUTUBE = "youtube",        // youtube directory (view of you tube search results)
    DOCHOLDER = "docholder",    // nested document (view of a document)
    SEARCHITEM= "searchitem",
    COMPARISON = "comparison",   // before/after view with slider (view of 2 images)

    LINKDB = "linkdb",          // database of links  ??? why do we have this
    RECOMMENDATION = "recommendation", // view of a recommendation
}