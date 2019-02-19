import { Field, FieldId } from "./Field"
import { observable, computed, action } from "mobx";
import { Server } from "../client/Server";

export abstract class BasicField<T> extends Field {
    constructor(data: T, save: boolean, id?: FieldId) {
        super(id);

        this.data = data;
        if (save) {
            Server.UpdateField(this)
        }
    }

    UpdateFromServer(data: any) {
        if (this.data !== data) {
            this.data = data;
        }
    }

    @observable
    protected data: T;

    @computed
    get Data(): T {
        return this.data;
    }

    set Data(value: T) {
        if (this.data != value) {
            this.data = value;
        }
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
