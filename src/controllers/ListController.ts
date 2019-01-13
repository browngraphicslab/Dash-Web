import { FieldController } from "./FieldController";
import { BasicFieldController } from "./BasicFieldController";
import { NumberController } from "./NumberController";
import { TextController } from "./TextController";

export class ListController<T extends FieldController> extends BasicFieldController<T[]> {
    constructor(data: T[] = []) {
        super(data.slice());

        let arr:TextController[] = [];
        this.Test(arr);
    }

    Test(test: FieldController[]){
        test.push(new NumberController());
    }

    Get(index:number) : T{
        return this.Data[index];
    }

    Set(index:number, value:T):void {
        this.Data[index] = value;
    }

    Copy(): FieldController {
        return new ListController<T>(this.Data);
    }

}