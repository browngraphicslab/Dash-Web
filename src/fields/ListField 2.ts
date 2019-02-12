import { Field } from "./Field";
import { BasicField } from "./BasicField";

export class ListField<T extends Field> extends BasicField<T[]> {
    constructor(data: T[] = []) {
        super(data.slice());
    }

    Get(index:number) : T{
        return this.Data[index];
    }

    Set(index:number, value:T):void {
        this.Data[index] = value;
    }

    Copy(): Field {
        return new ListField<T>(this.Data);
    }

}