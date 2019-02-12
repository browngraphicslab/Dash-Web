import { Field } from "./Field"
import { Utils } from "../Utils";
import { observable } from "mobx";

export class Key extends Field {
    private name: string;

    get Name(): string {
        return this.name;
    }

    constructor(name: string) {
        super(Utils.GenerateDeterministicGuid(name));

        this.name = name;
    }

    TrySetValue(value: any): boolean {
        throw new Error("Method not implemented.");
    }

    GetValue() {
        return this.Name;
    }

    Copy(): Field {
        return this;
    }

    ToScriptString(): string {
        return name;
    }

}

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
    export const Layout = new Key("Layout");
    export const AnnotatedLayout = new Key("AnnotatedLayout");
    export const LayoutKeys = new Key("LayoutKeys");
    export const LayoutFields = new Key("LayoutFields");
    export const ColumnsKey = new Key("SchemaColumns");
}