import { Key } from "./Key";

export namespace KeyStore {
    export const Prototype = new Key("Prototype");
    export const X = new Key("X");
    export const Y = new Key("Y");
    export const Page = new Key("Page");
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
    export const ZoomBasis = new Key("ZoomBasis");
    export const Data = new Key("Data");
    export const Annotations = new Key("Annotations");
    export const ViewType = new Key("ViewType");
    export const BaseLayout = new Key("BaseLayout");
    export const Layout = new Key("Layout");
    export const Templates = new Key("Templates");
    export const BackgroundColor = new Key("BackgroundColor");
    export const BackgroundLayout = new Key("BackgroundLayout");
    export const OverlayLayout = new Key("OverlayLayout");
    export const LayoutKeys = new Key("LayoutKeys");
    export const LayoutFields = new Key("LayoutFields");
    export const ColumnsKey = new Key("SchemaColumns");
    export const SchemaSplitPercentage = new Key("SchemaSplitPercentage");
    export const Caption = new Key("Caption");
    export const ActiveWorkspace = new Key("ActiveWorkspace");
    export const DocumentText = new Key("DocumentText");
    export const BrushingDocs = new Key("BrushingDocs");
    export const LinkedToDocs = new Key("LinkedToDocs");
    export const LinkedFromDocs = new Key("LinkedFromDocs");
    export const LinkDescription = new Key("LinkDescription");
    export const LinkTags = new Key("LinkTag");
    export const Thumbnail = new Key("Thumbnail");
    export const ThumbnailPage = new Key("ThumbnailPage");
    export const CurPage = new Key("CurPage");
    export const AnnotationOn = new Key("AnnotationOn");
    export const NumPages = new Key("NumPages");
    export const Ink = new Key("Ink");
    export const Cursors = new Key("Cursors");
    export const OptionalRightCollection = new Key("OptionalRightCollection");
    export const Archives = new Key("Archives");
    export const Workspaces = new Key("Workspaces");
    export const IsMinimized = new Key("IsMinimized");
    export const MinimizedDoc = new Key("MinimizedDoc");
    export const MaximizedDoc = new Key("MaximizedDoc");
    export const CopyDraggedItems = new Key("CopyDraggedItems");

    export const KeyList: Key[] = [Prototype, X, Y, Page, Title, Author, PanX, PanY, Scale, NativeWidth, NativeHeight,
        Width, Height, ZIndex, ZoomBasis, Data, Annotations, ViewType, Layout, BackgroundColor, BackgroundLayout, OverlayLayout, LayoutKeys,
        LayoutFields, ColumnsKey, SchemaSplitPercentage, Caption, ActiveWorkspace, DocumentText, BrushingDocs, LinkedToDocs, LinkedFromDocs,
        LinkDescription, LinkTags, Thumbnail, ThumbnailPage, CurPage, AnnotationOn, NumPages, Ink, Cursors, OptionalRightCollection,
        Archives, Workspaces, IsMinimized, MinimizedDoc, MaximizedDoc, CopyDraggedItems
    ];
    export function KeyLookup(keyid: string) {
        for (const key of KeyList) {
            if (key.Id === keyid) {
                return key;
            }
        }
        return undefined;
    }
}
