import { FieldController } from "./FieldController"
import { FieldUpdatedAction } from "./FieldUpdatedArgs";

export abstract class BasicFieldController<T> extends FieldController {
    get Data(): T {
        return this.data;
    }

    set Data(value: T) {
        if(this.data === value) {
            return;
        }
        this.data = value;

        this.FieldUpdated.emit({
            field: this,
            action: FieldUpdatedAction.Update
        });
    }

    constructor(private data: T) {
        super();
    }

    TrySetValue(value: any): boolean {
        if (typeof value == typeof this.data) {
            this.Data = value;
            return true;
        }
        return false;
    }

    GetValue(): any {
        return this.Data;
    }
}
