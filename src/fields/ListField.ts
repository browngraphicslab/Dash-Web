import { action, IArrayChange, IArraySplice, IObservableArray, observe, observable, Lambda } from "mobx";
import { Server } from "../client/Server";
import { UndoManager } from "../client/util/UndoManager";
import { Types } from "../server/Message";
import { BasicField } from "./BasicField";
import { Field, FieldId } from "./Field";
import { FieldMap } from "../client/SocketStub";
import { ScriptField } from "./ScriptField";

export class ListField<T extends Field> extends BasicField<T[]> {
    private _proxies: string[] = [];
    private _scriptIds: string[] = [];
    private scripts: ScriptField[] = [];

    constructor(data: T[] = [], scripts: ScriptField[] = [], id?: FieldId, save: boolean = true) {
        super(data, save, id);
        this.scripts = scripts;
        this.updateProxies();
        this._scriptIds = this.scripts.map(script => script.Id);
        if (save) {
            Server.UpdateField(this);
        }
        this.observeList();
    }

    private _processingServerUpdate: boolean = false;

    private observeDisposer: Lambda | undefined;
    private observeList(): void {
        if (this.observeDisposer) {
            this.observeDisposer();
        }
        this.observeDisposer = observe(this.Data as IObservableArray<T>, (change: IArrayChange<T> | IArraySplice<T>) => {
            const target = change.object;
            this.updateProxies();
            if (change.type === "splice") {
                this.runScripts(change.removed, false);
                UndoManager.AddEvent({
                    undo: () => target.splice(change.index, change.addedCount, ...change.removed),
                    redo: () => target.splice(change.index, change.removedCount, ...change.added)
                });
                this.runScripts(change.added, true);
            } else {
                this.runScripts([change.oldValue], false);
                UndoManager.AddEvent({
                    undo: () => target[change.index] = change.oldValue,
                    redo: () => target[change.index] = change.newValue
                });
                this.runScripts([change.newValue], true);
            }
            if (!this._processingServerUpdate) {
                Server.UpdateField(this);
            }
        });
    }

    private runScripts(fields: T[], added: boolean) {
        for (const script of this.scripts) {
            this.runScript(fields, script, added);
        }
    }

    private runScript(fields: T[], script: ScriptField, added: boolean) {
        if (!this._processingServerUpdate) {
            for (const field of fields) {
                script.script.run({ field, added });
            }
        }
    }

    addScript(script: ScriptField) {
        this.scripts.push(script);
        this._scriptIds.push(script.Id);

        this.runScript(this.Data, script, true);
        UndoManager.AddEvent({
            undo: () => this.removeScript(script),
            redo: () => this.addScript(script),
        });
        Server.UpdateField(this);
    }

    removeScript(script: ScriptField) {
        const index = this.scripts.indexOf(script);
        if (index === -1) {
            return;
        }
        this.scripts.splice(index, 1);
        this._scriptIds.splice(index, 1);
        UndoManager.AddEvent({
            undo: () => this.addScript(script),
            redo: () => this.removeScript(script),
        });
        this.runScript(this.Data, script, false);
        Server.UpdateField(this);
    }

    protected setData(value: T[]) {
        this.runScripts(this.data, false);

        this.data = observable(value);
        this.updateProxies();
        this.observeList();
        this.runScripts(this.data, true);
    }

    private updateProxies() {
        this._proxies = this.Data.map(field => field.Id);
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
        const fieldsPromise = Server.GetFields(this._proxies).then(action((fields: FieldMap) => {
            if (!this.arraysEqual(this._proxies, this.data.map(field => field.Id))) {
                var dataids = this.data.map(d => d.Id);
                var proxies = this._proxies.map(p => p);
                var added = this.data.length < this._proxies.length;
                var deleted = this.data.length > this._proxies.length;
                for (let i = 0; i < dataids.length && added; i++) {
                    added = proxies.indexOf(dataids[i]) !== -1;
                }
                for (let i = 0; i < this._proxies.length && deleted; i++) {
                    deleted = dataids.indexOf(proxies[i]) !== -1;
                }

                this._processingServerUpdate = true;
                for (let i = 0; i < proxies.length && added; i++) {
                    if (dataids.indexOf(proxies[i]) === -1) {
                        this.Data.splice(i, 0, fields[proxies[i]] as T);
                    }
                }
                for (let i = dataids.length - 1; i >= 0 && deleted; i--) {
                    if (proxies.indexOf(dataids[i]) === -1) {
                        this.Data.splice(i, 1);
                    }
                }
                if (!added && !deleted) {// otherwise, just rebuild the whole list
                    this.setData(proxies.map(id => fields[id] as T));
                }
                this._processingServerUpdate = false;
            }
        }));

        const scriptsPromise = Server.GetFields(this._scriptIds).then((fields: FieldMap) => {
            this.scripts = this._scriptIds.map(id => fields[id] as ScriptField);
        });

        Promise.all([fieldsPromise, scriptsPromise]).then(() => callback(this));
    }

    ToScriptString(): string {
        return "new ListField([" + this.Data.map(field => field.ToScriptString()).join(", ") + "])";
    }

    Copy(): Field {
        return new ListField<T>(this.Data);
    }


    UpdateFromServer(data: { fields: string[], scripts: string[] }) {
        this._proxies = data.fields;
        this._scriptIds = data.scripts;
    }
    ToJson() {
        return {
            type: Types.List,
            data: {
                fields: this._proxies,
                scripts: this._scriptIds,
            },
            id: this.Id
        };
    }

    static FromJson(id: string, data: { fields: string[], scripts: string[] }): ListField<Field> {
        let list = new ListField([], [], id, false);
        list._proxies = data.fields;
        list._scriptIds = data.scripts;
        return list;
    }
}