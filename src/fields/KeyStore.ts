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
    export const Width = new Key("Width");
    export const Height = new Key("Height");
    export const ZIndex = new Key("ZIndex");
    export const Data = new Key("Data");
    export const Layout = new Key("Layout");
    export const LayoutKeys = new Key("LayoutKeys");
    export const LayoutFields = new Key("LayoutFields");
    export const ColumnsKey = new Key("SchemaColumns");

    export function Get(name: string): Key {
        return new Key(name)
    }
}
