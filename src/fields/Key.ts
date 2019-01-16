import { Field } from "./Field"
import { Utils } from "../Utils";

export class Key extends Field {
    get Name():string {
        return this.name;
    }

    constructor(private name:string){
        super(Utils.GenerateDeterministicGuid(name));
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
    export let Width = new Key("Width");
    export let Height = new Key("Height");
    export let Data = new Key("Data");
    export let View = new Key("View");
    export let ViewProps = new Key("ViewProps");
}