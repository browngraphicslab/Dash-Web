import { PIXIPoint } from "./MathUtil";

export class StyleConstants {

    static DEFAULT_FONT: string = "Roboto Condensed";

    static MENU_SUBMENU_WIDTH: number = 85;
    static MENU_SUBMENU_HEIGHT: number = 400;
    static MENU_BOX_SIZE: PIXIPoint = new PIXIPoint(80, 35);
    static MENU_BOX_PADDING: number = 10;

    static OPERATOR_MENU_LARGE: number = 35;
    static OPERATOR_MENU_SMALL: number = 25;
    static BRUSH_PALETTE: number[] = [0x42b43c, 0xfa217f, 0x6a9c75, 0xfb5de7, 0x25b8ea, 0x9b5bc4, 0xda9f63, 0xe23209, 0xfb899b, 0x94a6fd]
    static GAP: number = 3;

    static BACKGROUND_COLOR: number = 0xF3F3F3;
    static TOOL_TIP_BACKGROUND_COLOR: number = 0xffffff;
    static LIGHT_TEXT_COLOR: number = 0xffffff;
    static LIGHT_TEXT_COLOR_STR: string = StyleConstants.HexToHexString(StyleConstants.LIGHT_TEXT_COLOR);
    static DARK_TEXT_COLOR: number = 0x282828;
    static HIGHLIGHT_TEXT_COLOR: number = 0xffcc00;
    static FPS_TEXT_COLOR: number = StyleConstants.DARK_TEXT_COLOR;
    static CORRELATION_LABEL_TEXT_COLOR_STR: string = StyleConstants.HexToHexString(StyleConstants.DARK_TEXT_COLOR);
    static LOADING_SCREEN_TEXT_COLOR_STR: string = StyleConstants.HexToHexString(StyleConstants.DARK_TEXT_COLOR);
    static ERROR_COLOR: number = 0x540E25;
    static WARNING_COLOR: number = 0xE58F24;
    static LOWER_THAN_NAIVE_COLOR: number = 0xee0000;
    static HIGHLIGHT_COLOR: number = 0x82A8D9;
    static HIGHLIGHT_COLOR_STR: string = StyleConstants.HexToHexString(StyleConstants.HIGHLIGHT_COLOR);
    static OPERATOR_BACKGROUND_COLOR: number = 0x282828;
    static LOADING_ANIMATION_COLOR: number = StyleConstants.OPERATOR_BACKGROUND_COLOR;
    static MENU_COLOR: number = 0x282828;
    static MENU_FONT_COLOR: number = StyleConstants.LIGHT_TEXT_COLOR;
    static MENU_SELECTED_COLOR: number = StyleConstants.HIGHLIGHT_COLOR;
    static MENU_SELECTED_FONT_COLOR: number = StyleConstants.LIGHT_TEXT_COLOR;
    static BRUSH_COLOR: number = 0xff0000;
    static DROP_ACCEPT_COLOR: number = StyleConstants.HIGHLIGHT_COLOR;
    static SELECTED_COLOR: number = 0xffffff;
    static SELECTED_COLOR_STR: string = StyleConstants.HexToHexString(StyleConstants.SELECTED_COLOR);
    static PROGRESS_BACKGROUND_COLOR: number = 0x595959;
    static GRID_LINES_COLOR: number = 0x3D3D3D;
    static GRID_LINES_COLOR_STR: string = StyleConstants.HexToHexString(StyleConstants.GRID_LINES_COLOR);

    static MAX_CHAR_FOR_HISTOGRAM_LABELS: number = 20;

    static OVERLAP_COLOR: number = 0x0000ff;//0x540E25;
    static BRUSH_COLORS: Array<number> = new Array<number>(
        0xFFDA7E, 0xFE8F65, 0xDA5655, 0x8F2240
    );

    static MIN_VALUE_COLOR: number = 0x373d43; //32343d, 373d43,  3b4648
    static MARGIN_BARS_COLOR: number = 0xffffff;
    static MARGIN_BARS_COLOR_STR: string = StyleConstants.HexToHexString(StyleConstants.MARGIN_BARS_COLOR);

    static HISTOGRAM_WIDTH: number = 200;
    static HISTOGRAM_HEIGHT: number = 150;
    static PREDICTOR_WIDTH: number = 150;
    static PREDICTOR_HEIGHT: number = 100;
    static RAWDATA_WIDTH: number = 150;
    static RAWDATA_HEIGHT: number = 100;
    static FREQUENT_ITEM_WIDTH: number = 180;
    static FREQUENT_ITEM_HEIGHT: number = 100;
    static CORRELATION_WIDTH: number = 555;
    static CORRELATION_HEIGHT: number = 390;
    static PROBLEM_FINDER_WIDTH: number = 450;
    static PROBLEM_FINDER_HEIGHT: number = 150;
    static PIPELINE_OPERATOR_WIDTH: number = 300;
    static PIPELINE_OPERATOR_HEIGHT: number = 120;
    static SLICE_WIDTH: number = 150;
    static SLICE_HEIGHT: number = 45;
    static BORDER_MENU_ITEM_WIDTH: number = 50;
    static BORDER_MENU_ITEM_HEIGHT: number = 30;


    static SLICE_BG_COLOR: string = StyleConstants.HexToHexString(StyleConstants.OPERATOR_BACKGROUND_COLOR);
    static SLICE_EMPTY_COLOR: number = StyleConstants.OPERATOR_BACKGROUND_COLOR;
    static SLICE_OCCUPIED_COLOR: number = 0xffffff;
    static SLICE_OCCUPIED_BG_COLOR: string = StyleConstants.HexToHexString(StyleConstants.OPERATOR_BACKGROUND_COLOR);
    static SLICE_HOVER_BG_COLOR: string = StyleConstants.HexToHexString(StyleConstants.HIGHLIGHT_COLOR);
    static SLICE_HOVER_COLOR: number = 0xffffff;

    static HexToHexString(hex: number): string {
        if (hex === undefined) {
            return "#000000";
        }
        var s = hex.toString(16);
        while (s.length < 6) {
            s = "0" + s;
        }
        return "#" + s;
    }


} 
