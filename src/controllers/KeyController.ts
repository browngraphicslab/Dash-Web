import { FieldController } from "./FieldController"

export class KeyController extends FieldController {
    get Name():string {
        return this.name;
    }

    constructor(private name:string){
        super();
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
