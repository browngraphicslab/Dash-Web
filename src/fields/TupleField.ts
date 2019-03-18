import { action, IArrayChange, IArraySplice, IObservableArray, observe, observable, Lambda } from "mobx";
import { Server } from "../client/Server";
import { UndoManager } from "../client/util/UndoManager";
import { Types } from "../server/Message";
import { BasicField } from "./BasicField";
import { Field, FieldId } from "./Field";

export class TupleField<T, U> extends BasicField<[T, U]> {
    constructor(data: [T, U], id?: FieldId, save: boolean = true) {
        super(data, save, id);
        if (save) {
            Server.UpdateField(this);
        }
        this.observeTuple();
    }

    private observeDisposer: Lambda | undefined;
    private observeTuple(): void {
        this.observeDisposer = observe(this.Data as (T | U)[] as IObservableArray<T | U>, (change: IArrayChange<T | U> | IArraySplice<T | U>) => {
            if (change.type === "update") {
                UndoManager.AddEvent({
                    undo: () => this.Data[change.index] = change.oldValue,
                    redo: () => this.Data[change.index] = change.newValue
                })
                Server.UpdateField(this);
            } else {
                throw new Error("Why are you messing with the length of a tuple, huh?");
            }
        });
    }

    protected setData(value: [T, U]) {
        if (this.observeDisposer) {
            this.observeDisposer()
        }
        this.data = observable(value) as (T | U)[] as [T, U];
        this.observeTuple();
    }

    UpdateFromServer(values: [T, U]) {
        this.setData(values);
    }

    ToScriptString(): string {
        return `new TupleField([${this.Data[0], this.Data[1]}])`;
    }

    Copy(): Field {
        return new TupleField<T, U>(this.Data);
    }

    ToJson(): { type: Types, data: [T, U], _id: string } {
        return {
            type: Types.Tuple,
            data: this.Data,
            _id: this.Id
        }
    }
}