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


}

export namespace KeyStore {
    export let Prototype = new Key("Prototype");
    export let X = new Key("X");
    export let Y = new Key("Y");
    export let Title = new Key("Title");
    export let PanX = new Key("PanX");
    export let PanY = new Key("PanY");
    export let Scale = new Key("Scale");
    export let Width = new Key("Width");
    export let Height = new Key("Height");
    export let Data = new Key("Data");
    export let Layout = new Key("Layout");
    export let LayoutKeys = new Key("LayoutKeys");
    export let LayoutFields = new Key("LayoutFields");
}