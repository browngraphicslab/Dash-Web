import { ObjectField, Copy } from "./ObjectField";
import { IObservableArray, IArrayChange, IArraySplice, observe, Lambda, observable } from "mobx";
import { UndoManager } from "../client/util/UndoManager";
import { Field } from "./Doc";
import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, createSimpleSchema, list, object } from "serializr";
import { array } from "prop-types";

const tupleSchema = createSimpleSchema({

});

@Deserializable("tuple")
export class TupleField<T, U> extends ObjectField {


    @serializable(list(object(tupleSchema)))
    private Data: [T, U];

    public get data() {
        return this.Data;
    }

    constructor(data: [T, U]) {
        super();
        this.Data = data;
        this.observeTuple();
    }

    private observeDisposer: Lambda | undefined;
    private observeTuple(): void {
        this.observeDisposer = observe(this.Data as (T | U)[] as IObservableArray<T | U>, (change: IArrayChange<T | U> | IArraySplice<T | U>) => {
            if (change.type === "update") {
                UndoManager.AddEvent({
                    undo: () => this.Data[change.index] = change.oldValue,
                    redo: () => this.Data[change.index] = change.newValue
                });
            } else {
                throw new Error("Why are you messing with the length of a tuple, huh?");
            }
        });
    }

    protected setData(value: [T, U]) {
        if (this.observeDisposer) {
            this.observeDisposer();
        }
        this.Data = observable(value) as (T | U)[] as [T, U];
        this.observeTuple();
    }

    UpdateFromServer(values: [T, U]) {
        this.setData(values);
    }

    ToScriptString(): string {
        return `new TupleField([${this.Data[0], this.Data[1]}])`;
    }

    [Copy]() {
        return new TupleField<T, U>(this.Data);
    }
}