import { Field, FieldId, FieldValue, Opt } from "./Field";
import { BasicField } from "./BasicField";
import { Types } from "../server/Message";
import { observe, action, IArrayChange, IArraySplice, IObservableArray } from "mobx";
import { Server } from "../client/Server";
import { ServerUtils } from "../server/ServerUtil";
import { UndoManager } from "../client/util/UndoManager";

export class ListField<T extends Field> extends BasicField<T[]> {
    private _proxies: string[] = []
    constructor(data: T[] = [], id?: FieldId, save: boolean = true) {
        super(data, save, id);
        this.updateProxies();
        if (save) {
            Server.UpdateField(this);
        }
        observe(this.Data as IObservableArray<T>, (change: IArrayChange<T> | IArraySplice<T>) => {
            this.updateProxies()
            if (change.type == "splice") {
                UndoManager.AddEvent({
                    undo: () => this.Data.splice(change.index, change.addedCount, ...change.removed),
                    redo: () => this.Data.splice(change.index, change.removedCount, ...change.added)
                })
            } else {
                UndoManager.AddEvent({
                    undo: () => this.Data[change.index] = change.oldValue,
                    redo: () => this.Data[change.index] = change.newValue
                })
            }
            Server.UpdateField(this);
        })
    }

    private updateProxies() {
        this._proxies = this.Data.map(field => field.Id);
    }

    UpdateFromServer(fields: string[]) {
        this._proxies = fields;
    }
    private arraysEqual(a: any[], b: any[]) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (a.length != b.length) return false;

        // If you don't care about the order of the elements inside
        // the array, you should sort both arrays here.
        // Please note that calling sort on an array will modify that array.
        // you might want to clone your array first.

        for (var i = 0; i < a.length; ++i) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    init(callback: (field: Field) => any) {
        Server.GetFields(this._proxies, action((fields: { [index: string]: Field }) => {
            if (!this.arraysEqual(this._proxies, this.Data.map(field => field.Id))) {
                this.data = this._proxies.map(id => fields[id] as T)
                observe(this.Data, () => {
                    this.updateProxies()
                    Server.UpdateField(this);
                })
            }
            callback(this);
        }))
    }

    ToScriptString(): string {
        return "new ListField([" + this.Data.map(field => field.ToScriptString()).join(", ") + "])";
    }

    Copy(): Field {
        return new ListField<T>(this.Data);
    }

    ToJson(): { type: Types, data: string[], _id: string } {
        return {
            type: Types.List,
            data: this._proxies,
            _id: this.Id
        }
    }

    static FromJson(id: string, ids: string[]): ListField<Field> {
        let list = new ListField([], id, false);
        list._proxies = ids;
        return list
    }
}