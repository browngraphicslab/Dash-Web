
interface IGlobalScss {
    contextMenuZindex: string;  // context menu shows up over everything
    COLLECTION_BORDER_WIDTH: string;
    MINIMIZED_ICON_SIZE: string;
    MAX_ROW_HEIGHT: string;
    SEARCH_THUMBNAIL_SIZE: string;
    ANTIMODEMENU_HEIGHT: string;
    SEARCH_PANEL_HEIGHT: string;
    DFLT_IMAGE_NATIVE_DIM: string;
}
declare const globalCssVariables: IGlobalScss;

export = globalCssVariables;