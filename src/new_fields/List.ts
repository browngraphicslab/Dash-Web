import { Deserializable, autoObject } from "../client/util/SerializationHelper";
import { Field, Update, Self } from "./Doc";
import { setter, getter } from "./util";
import { serializable, alias, list } from "serializr";
import { observable, observe, IArrayChange, IArraySplice, IObservableArray, Lambda, reaction } from "mobx";
import { ObjectField, OnUpdate } from "./ObjectField";

const listHandlers: any = {
    push(...items: any[]) {
        // console.log("push");
        // console.log(...items);
        return this[Self].__fields.push(...items);
    },
    pop(): any {
        return this[Self].__fields.pop();
    }
};

function listGetter(target: any, prop: string | number | symbol, receiver: any): any {
    if (listHandlers.hasOwnProperty(prop)) {
        return listHandlers[prop];
    }
    return getter(target, prop, receiver);
}

interface ListSpliceUpdate<T> {
    type: "splice";
    index: number;
    added: T[];
    removedCount: number;
}

interface ListIndexUpdate<T> {
    type: "update";
    index: number;
    newValue: T;
}

type ListUpdate<T> = ListSpliceUpdate<T> | ListIndexUpdate<T>;

const ObserveDisposer = Symbol("Observe Disposer");

function listObserver<T extends Field>(this: ListImpl<T>, change: IArrayChange<T> | IArraySplice<T>) {
    if (change.type === "splice") {
        this[Update]({
            index: change.index,
            removedCount: change.removedCount,
            added: change.added,
            type: change.type
        });
    } else {
        //This should already be handled by the getter for the Proxy
        // this[Update]({
        //     index: change.index,
        //     newValue: change.newValue,
        //     type: change.type
        // });
    }
}

@Deserializable("list")
class ListImpl<T extends Field> extends ObjectField {
    constructor(fields: T[] = []) {
        super();
        this.___fields = fields;
        this[ObserveDisposer] = observe(this.__fields as IObservableArray<T>, listObserver.bind(this));
        const list = new Proxy<this>(this, {
            set: setter,
            get: getter,
            deleteProperty: () => { throw new Error("Currently properties can't be deleted from documents, assign to undefined instead"); },
            defineProperty: () => { throw new Error("Currently properties can't be defined on documents using Object.defineProperty"); },
        });
        return list;
    }

    [key: number]: T | null | undefined;

    @serializable(alias("fields", list(autoObject())))
    private get __fields() {
        return this.___fields;
    }

    private set __fields(value) {
        this.___fields = value;
        this[ObserveDisposer]();
        this[ObserveDisposer] = observe(this.__fields as IObservableArray<T>, listObserver.bind(this));
    }

    // @serializable(alias("fields", list(autoObject())))
    @observable
    private ___fields: (T | null | undefined)[];

    private [Update] = (diff: any) => {
        // console.log(diff);
        const update = this[OnUpdate];
        // update && update(diff);
        update && update();
    }

    private [ObserveDisposer]: Lambda;
    private [Self] = this;
}
export type List<T extends Field> = ListImpl<T> & T[];
export const List: { new <T extends Field>(fields?: T[]): List<T> } = ListImpl as any;