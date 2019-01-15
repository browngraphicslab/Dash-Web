import { FieldController } from "./FieldController"
import { Utils } from "../Utils";

export class KeyController extends FieldController {
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

    Copy(): FieldController {
        return this;
    }


}

export namespace KeyStore {
    export let Prototype = new KeyController("Prototype");
    export let X = new KeyController("Y");
    export let Y = new KeyController("Y");
    export let Width = new KeyController("Width");
    export let Height = new KeyController("Height");
    export let Data = new KeyController("Data");
    export let View = new KeyController("View");
}