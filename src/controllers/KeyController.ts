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
}