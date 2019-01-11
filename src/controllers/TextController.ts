import { BasicFieldController } from "./BasicFieldController"
import { FieldUpdatedAction } from "./FieldUpdatedArgs";

export class TextController extends BasicFieldController<string> {
    constructor(data: string = "") {
        super(data);
    }

    Copy() {
        return new TextController(this.Data);
    }


}
