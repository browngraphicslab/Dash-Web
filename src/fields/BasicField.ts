import { Field } from "./Field"
import { observable, computed, action } from "mobx";

export abstract class BasicField<T> extends Field {
    constructor(data: T) {
        super();

        this.data = data;
    }

    @observable
    private data:T;

    @computed
    get Data(): T {
        return this.data;
    }

    set Data(value: T) {
        if(this.data === value) {
            return;
        }
        this.data = value;
    }

    @action
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
