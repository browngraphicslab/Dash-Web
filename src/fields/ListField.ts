import { action, IArrayChange, IArraySplice, IObservableArray, observe, observable, Lambda } from "mobx";
import { Server } from "../client/Server";
import { UndoManager } from "../client/util/UndoManager";
import { Types } from "../server/Message";
import { BasicField } from "./BasicField";
import { Field, FieldId } from "./Field";
import { FieldMap } from "../client/SocketStub";

export class ListField<T extends Field> extends BasicField<T[]> {
    private _proxies: string[] = []
    constructor(data: T[] = [], id?: FieldId, save: boolean = true) {
        super(data, save, id);
        this.updateProxies();
        if (save) {
            Server.UpdateField(this);
        }
        this.observeList();
    }

    private _processingServerUpdate: boolean = false;

    private observeDisposer: Lambda | undefined;
    private observeList(): void {
        if (this.observeDisposer) {
            this.observeDisposer()
        }
        this.observeDisposer = observe(this.Data as IObservableArray<T>, (change: IArrayChange<T> | IArraySplice<T>) => {
            this.updateProxies()
            if (change.type === "splice") {
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
            if (!this._processingServerUpdate)
                Server.UpdateField(this);
        });
    }

    protected setData(value: T[]) {
        this.data = observable(value);
        this.updateProxies();
        this.observeList();
    }

    private updateProxies() {
        this._proxies = this.Data.map(field => field.Id);
    }

    UpdateFromServer(fields: string[]) {
        this._proxies = fields;
    }
    private arraysEqual(a: any[], b: any[]) {
        if (a === b) return true;
        if (a === null || b === null) return false;
        if (a.length !== b.length) return false;

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
        Server.GetFields(this._proxies, action((fields: FieldMap) => {
            if (!this.arraysEqual(this._proxies, this.data.map(field => field.Id))) {
                var dataids = this.data.map(d => d.Id);
                var proxies = this._proxies.map(p => p);
                var added = this.data.length < this._proxies.length;
                var deleted = this.data.length > this._proxies.length;
                for (let i = 0; i < dataids.length && added; i++)
                    added = proxies.indexOf(dataids[i]) !== -1;
                for (let i = 0; i < this._proxies.length && deleted; i++)
                    deleted = dataids.indexOf(proxies[i]) !== -1;

                this._processingServerUpdate = true;
                for (let i = 0; i < proxies.length && added; i++) {
                    if (dataids.indexOf(proxies[i]) === -1)
                        this.Data.splice(i, 0, fields[proxies[i]] as T);
                }
                for (let i = dataids.length - 1; i >= 0 && deleted; i--) {
                    if (proxies.indexOf(dataids[i]) === -1)
                        this.Data.splice(i, 1);
                }
                if (!added && !deleted) {// otherwise, just rebuild the whole list
                    this.setData(proxies.map(id => fields[id] as T));
                }
                this._processingServerUpdate = false;
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
            data: this._proxies || [],
            _id: this.Id
        }
    }

    static FromJson(id: string, ids: string[]): ListField<Field> {
        let list = new ListField([], id, false);
        list._proxies = ids;
        return list
    }
}