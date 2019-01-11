import { BasicFieldController } from "./BasicFieldController"
import { FieldUpdatedAction } from "./FieldUpdatedArgs";

export class NumberController extends BasicFieldController<number> {
    constructor(data: number = 0) {
        super(data);
    }

    Copy() {
        return new NumberController(this.Data);
    }


}