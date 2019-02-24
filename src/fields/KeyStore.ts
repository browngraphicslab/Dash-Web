import { Key } from "./Key";

export namespace KeyStore {
    export const Prototype = new Key("Prototype");
    export const X = new Key("X");
    export const Y = new Key("Y");
    export const Title = new Key("Title");
    export const Author = new Key("Author");
    export const PanX = new Key("PanX");
    export const PanY = new Key("PanY");
    export const Scale = new Key("Scale");
    export const NativeWidth = new Key("NativeWidth");
    export const NativeHeight = new Key("NativeHeight");
    export const Width = new Key("Width");
    export const Height = new Key("Height");
    export const ZIndex = new Key("ZIndex");
    export const Data = new Key("Data");
    export const Annotations = new Key("Annotations");
    export const ViewType = new Key("ViewType");
    export const Layout = new Key("Layout");
    export const BackgroundLayout = new Key("BackgroundLayout");
    export const OverlayLayout = new Key("OverlayLayout");
    export const LayoutKeys = new Key("LayoutKeys");
    export const LayoutFields = new Key("LayoutFields");
    export const ColumnsKey = new Key("SchemaColumns");
    export const Caption = new Key("Caption");
    export const ActiveFrame = new Key("ActiveFrame");
    export const DocumentText = new Key("DocumentText");
    //used for setting the text of a text document
    export const Text = new Key("Text");
    //determines whether doc views will be selected when they are first loaded
    //should be NumberField where 0 = false and 1 = true
    //currently only implemented for FormattedTextView
    export const SelectOnLoaded = new Key("SelectOnLoaded");
}
