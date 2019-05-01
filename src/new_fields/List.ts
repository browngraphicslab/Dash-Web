import { Deserializable, autoObject } from "../client/util/SerializationHelper";
import { Field, Update, Self, FieldResult } from "./Doc";
import { setter, getter, deleteProperty } from "./util";
import { serializable, alias, list } from "serializr";
import { observable, observe, IArrayChange, IArraySplice, IObservableArray, Lambda, reaction } from "mobx";
import { ObjectField, OnUpdate, Copy } from "./ObjectField";
import { RefField } from "./RefField";
import { ProxyField } from "./Proxy";

const listHandlers: any = {
    /// Mutator methods
    copyWithin() {
        throw new Error("copyWithin not supported yet");
    },
    fill(value: any, start?: number, end?: number) {
        if (value instanceof RefField) {
            throw new Error("fill with RefFields not supported yet");
        }
        const res = this[Self].__fields.fill(value, start, end);
        this[Update]();
        return res;
    },
    pop(): any {
        const field = toRealField(this[Self].__fields.pop());
        this[Update]();
        return field;
    },
    push(...items: any[]) {
        items = items.map(toObjectField);
        const res = this[Self].__fields.push(...items);
        this[Update]();
        return res;
    },
    reverse() {
        const res = this[Self].__fields.reverse();
        this[Update]();
        return res;
    },
    shift() {
        const res = toRealField(this[Self].__fields.shift());
        this[Update]();
        return res;
    },
    sort(cmpFunc: any) {
        const res = this[Self].__fields.sort(cmpFunc ? (first: any, second: any) => cmpFunc(toRealField(first), toRealField(second)) : undefined);
        this[Update]();
        return res;
    },
    splice(start: number, deleteCount: number, ...items: any[]) {
        items = items.map(toObjectField);
        const res = this[Self].__fields.splice(start, deleteCount, ...items);
        this[Update]();
        return res.map(toRealField);
    },
    unshift(...items: any[]) {
        items = items.map(toObjectField);
        const res = this[Self].__fields.unshift(...items);
        this[Update]();
        return res;

    },
    /// Accessor methods
    concat(...items: any[]) {
        return this[Self].__fields.map(toRealField).concat(...items);
    },
    includes(valueToFind: any, fromIndex: number) {
        const fields = this[Self].__fields;
        if (valueToFind instanceof RefField) {
            return fields.map(toRealField).includes(valueToFind, fromIndex);
        } else {
            return fields.includes(valueToFind, fromIndex);
        }
    },
    indexOf(valueToFind: any, fromIndex: number) {
        const fields = this[Self].__fields;
        if (valueToFind instanceof RefField) {
            return fields.map(toRealField).indexOf(valueToFind, fromIndex);
        } else {
            return fields.indexOf(valueToFind, fromIndex);
        }
    },
    join(separator: any) {
        return this[Self].__fields.map(toRealField).join(separator);
    },
    lastIndexOf(valueToFind: any, fromIndex: number) {
        const fields = this[Self].__fields;
        if (valueToFind instanceof RefField) {
            return fields.map(toRealField).lastIndexOf(valueToFind, fromIndex);
        } else {
            return fields.lastIndexOf(valueToFind, fromIndex);
        }
    },
    slice(begin: number, end: number) {
        return this[Self].__fields.slice(begin, end).map(toRealField);
    },

    /// Iteration methods
    entries() {
        return this[Self].__fields.map(toRealField).entries();
    },
    every(callback: any, thisArg: any) {
        return this[Self].__fields.map(toRealField).every(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.every((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    filter(callback: any, thisArg: any) {
        return this[Self].__fields.map(toRealField).filter(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.filter((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    find(callback: any, thisArg: any) {
        return this[Self].__fields.map(toRealField).find(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.find((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    findIndex(callback: any, thisArg: any) {
        return this[Self].__fields.map(toRealField).findIndex(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.findIndex((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    forEach(callback: any, thisArg: any) {
        return this[Self].__fields.map(toRealField).forEach(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.forEach((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    map(callback: any, thisArg: any) {
        return this[Self].__fields.map(toRealField).map(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.map((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    reduce(callback: any, initialValue: any) {
        return this[Self].__fields.map(toRealField).reduce(callback, initialValue);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.reduce((acc:any, element:any, index:number, array:any) => callback(acc, toRealField(element), index, array), initialValue);
    },
    reduceRight(callback: any, initialValue: any) {
        return this[Self].__fields.map(toRealField).reduceRight(callback, initialValue);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.reduceRight((acc:any, element:any, index:number, array:any) => callback(acc, toRealField(element), index, array), initialValue);
    },
    some(callback: any, thisArg: any) {
        return this[Self].__fields.map(toRealField).some(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.some((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    values() {
        return this[Self].__fields.map(toRealField).values();
    },
    [Symbol.iterator]() {
        return this[Self].__fields.map(toRealField).values();
    }
};

function toObjectField(field: Field) {
    return field instanceof RefField ? new ProxyField(field) : field;
}

function toRealField(field: Field) {
    return field instanceof ProxyField ? field.value() : field;
}

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

type StoredType<T extends Field> = T extends RefField ? ProxyField<T> : T;

@Deserializable("list")
class ListImpl<T extends Field> extends ObjectField {
    constructor(fields: T[] = []) {
        super();
        const list = new Proxy<this>(this, {
            set: setter,
            get: listGetter,
            deleteProperty: deleteProperty,
            defineProperty: () => { throw new Error("Currently properties can't be defined on documents using Object.defineProperty"); },
        });
        (list as any).push(...fields);
        return list;
    }

    [key: number]: FieldResult<T>;

    @serializable(alias("fields", list(autoObject())))
    private get __fields() {
        return this.___fields;
    }

    private set __fields(value) {
        this.___fields = value;
    }

    [Copy]() {
        let copiedData = this.__fields.map(f => f instanceof ObjectField ? f[Copy]() : f);
        let deepCopy = new ListImpl<T>(copiedData as any);
        return deepCopy;
    }

    // @serializable(alias("fields", list(autoObject())))
    @observable
    private ___fields: StoredType<T>[] = [];

    private [Update] = (diff: any) => {
        // console.log(diff);
        const update = this[OnUpdate];
        // update && update(diff);
        update && update();
    }

    private [Self] = this;
}
export type List<T extends Field> = ListImpl<T> & T[];
export const List: { new <T extends Field>(fields?: T[]): List<T> } = ListImpl as any;