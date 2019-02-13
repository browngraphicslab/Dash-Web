import { Field, FIELD_ID } from "./Field"
import { observable, computed, action } from "mobx";
import { Server } from "../client/Server";

export abstract class BasicField<T> extends Field {
    constructor(data: T, id: FIELD_ID = undefined) {
        super(id);

        this.data = data;
    }

    @observable
    private data: T;

    @computed
    get Data(): T {
        return this.data;
    }

    set Data(value: T) {
        if (this.data === value) {
            return;
        }
        this.data = value;
        Server.UpdateField(this);
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
