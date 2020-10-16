import { action, observable, runInAction } from "mobx";
import { alias, list, serializable } from "serializr";
import { DocServer } from "../client/DocServer";
import { Scripting } from "../client/util/Scripting";
import { afterDocDeserialize, autoObject, Deserializable } from "../client/util/SerializationHelper";
import { Field } from "./Doc";
import { Copy, OnUpdate, Parent, Self, SelfProxy, ToScriptString, ToString, Update } from "./FieldSymbols";
import { ObjectField } from "./ObjectField";
import { ProxyField } from "./Proxy";
import { RefField } from "./RefField";
import { listSpec } from "./Schema";
import { Cast } from "./Types";
import { deleteProperty, getter, setter, updateFunction } from "./util";

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
    push: action(function (this: any, ...items: any[]) {
        items = items.map(toObjectField);
        const list = this[Self];
        const length = list.__fields.length;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            //TODO Error checking to make sure parent doesn't already exist
            if (item instanceof ObjectField) {
                item[Parent] = list;
                item[OnUpdate] = updateFunction(list, i + length, item, this);
            }
        }
        const res = list.__fields.push(...items);
        this[Update]({ op: "$addToSet", items, length: length + items.length });
        return res;
    }),
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
        this[Self].__realFields(); // coerce retrieving entire array
        const res = this[Self].__fields.sort(cmpFunc ? (first: any, second: any) => cmpFunc(toRealField(first), toRealField(second)) : undefined);
        this[Update]();
        return res;
    },
    splice: action(function (this: any, start: number, deleteCount: number, ...items: any[]) {
        this[Self].__realFields(); // coerce retrieving entire array
        items = items.map(toObjectField);
        const list = this[Self];
        const removed = list.__fields.filter((item: any, i: number) => i >= start && i < start + deleteCount);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            //TODO Error checking to make sure parent doesn't already exist
            //TODO Need to change indices of other fields in array
            if (item instanceof ObjectField) {
                item[Parent] = list;
                item[OnUpdate] = updateFunction(list, i + start, item, this);
            }
        }
        const res = list.__fields.splice(start, deleteCount, ...items);
        this[Update](items.length === 0 && deleteCount ? { op: "$remFromSet", items: removed, length: list.__fields.length } :
            items.length && !deleteCount && start === list.__fields.length ? { op: "$addToSet", items, length: list.__fields.length } : undefined);
        return res.map(toRealField);
    }),
    unshift(...items: any[]) {
        items = items.map(toObjectField);
        const list = this[Self];
        const length = list.__fields.length;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            //TODO Error checking to make sure parent doesn't already exist
            //TODO Need to change indices of other fields in array
            if (item instanceof ObjectField) {
                item[Parent] = list;
                item[OnUpdate] = updateFunction(list, i, item, this);
            }
        }
        const res = this[Self].__fields.unshift(...items);
        this[Update]();
        return res;

    },
    /// Accessor methods
    concat: action(function (this: any, ...items: any[]) {
        this[Self].__realFields();
        return this[Self].__fields.map(toRealField).concat(...items);
    }),
    includes(valueToFind: any, fromIndex: number) {
        if (valueToFind instanceof RefField) {
            return this[Self].__realFields().includes(valueToFind, fromIndex);
        } else {
            return this[Self].__fields.includes(valueToFind, fromIndex);
        }
    },
    indexOf(valueToFind: any, fromIndex: number) {
        if (valueToFind instanceof RefField) {
            return this[Self].__realFields().indexOf(valueToFind, fromIndex);
        } else {
            return this[Self].__fields.indexOf(valueToFind, fromIndex);
        }
    },
    join(separator: any) {
        this[Self].__realFields();
        return this[Self].__fields.map(toRealField).join(separator);
    },
    lastIndexOf(valueToFind: any, fromIndex: number) {
        if (valueToFind instanceof RefField) {
            return this[Self].__realFields().lastIndexOf(valueToFind, fromIndex);
        } else {
            return this[Self].__fields.lastIndexOf(valueToFind, fromIndex);
        }
    },
    slice(begin: number, end: number) {
        this[Self].__realFields();
        return this[Self].__fields.slice(begin, end).map(toRealField);
    },

    /// Iteration methods
    entries() {
        return this[Self].__realFields().entries();
    },
    every(callback: any, thisArg: any) {
        return this[Self].__realFields().every(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.every((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    filter(callback: any, thisArg: any) {
        return this[Self].__realFields().filter(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.filter((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    find(callback: any, thisArg: any) {
        return this[Self].__realFields().find(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.find((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    findIndex(callback: any, thisArg: any) {
        return this[Self].__realFields().findIndex(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.findIndex((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    forEach(callback: any, thisArg: any) {
        return this[Self].__realFields().forEach(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.forEach((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    map(callback: any, thisArg: any) {
        return this[Self].__realFields().map(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.map((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    reduce(callback: any, initialValue: any) {
        return this[Self].__realFields().reduce(callback, initialValue);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.reduce((acc:any, element:any, index:number, array:any) => callback(acc, toRealField(element), index, array), initialValue);
    },
    reduceRight(callback: any, initialValue: any) {
        return this[Self].__realFields().reduceRight(callback, initialValue);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.reduceRight((acc:any, element:any, index:number, array:any) => callback(acc, toRealField(element), index, array), initialValue);
    },
    some(callback: any, thisArg: any) {
        return this[Self].__realFields().some(callback, thisArg);
        // TODO This is probably more efficient, but technically the callback can take the array, which would mean we would have to map the actual array anyway.
        // If we don't want to support the array parameter, we should use this version instead
        // return this[Self].__fields.some((element:any, index:number, array:any) => callback(toRealField(element), index, array), thisArg);
    },
    values() {
        return this[Self].__realFields().values();
    },
    [Symbol.iterator]() {
        return this[Self].__realFields().values();
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
    constructor(fields?: T[]) {
        super();
        const list = new Proxy<this>(this, {
            set: setter,
            get: listGetter,
            ownKeys: target => Object.keys(target.__fields),
            getOwnPropertyDescriptor: (target, prop) => {
                if (prop in target.__fields) {
                    return {
                        configurable: true,//TODO Should configurable be true?
                        enumerable: true,
                    };
                }
                return Reflect.getOwnPropertyDescriptor(target, prop);
            },
            deleteProperty: deleteProperty,
            defineProperty: () => { throw new Error("Currently properties can't be defined on documents using Object.defineProperty"); },
        });
        this[SelfProxy] = list;
        if (fields) {
            (list as any).push(...fields);
        }
        return list;
    }

    [key: number]: T | (T extends RefField ? Promise<T> : never);

    // this requests all ProxyFields at the same time to avoid the overhead
    // of separate network requests and separate updates to the React dom.
    private __realFields() {
        const waiting = this.__fields.filter(f => f instanceof ProxyField && f.promisedValue());
        const promised = waiting.map(f => f instanceof ProxyField ? f.promisedValue() : "");
        // if we find any ProxyFields that don't have a current value, then
        // start the server request for all of them
        if (promised.length) {
            const promise = DocServer.GetRefFields(promised);
            // as soon as we get the fields from the server, set all the list values in one
            // action to generate one React dom update.
            promise.then(fields => runInAction(() => {
                waiting.map((w, i) => w instanceof ProxyField && w.setValue(fields[promised[i]]));
            }));
            // we also have to mark all lists items with this promise so that any calls to them
            // will await the batch request.
            // This counts on the handler for 'promise' in the call above being invoked before the
            // handler for 'promise' in the lines below.
            waiting.map((w, i) => {
                w instanceof ProxyField && w.setPromise(promise.then(fields => fields[promised[i]]));
            });
        }
        return this.__fields.map(toRealField);
    }

    @serializable(alias("fields", list(autoObject(), { afterDeserialize: afterDocDeserialize })))
    private get __fields() {
        return this.___fields;
    }

    private set __fields(value) {
        this.___fields = value;
        for (const key in value) {
            const field = value[key];
            if (field instanceof ObjectField) {
                field[Parent] = this[Self];
                field[OnUpdate] = updateFunction(this[Self], key, field, this[SelfProxy]);
            }
        }
    }

    [Copy]() {
        const copiedData = this[Self].__fields.map(f => f instanceof ObjectField ? f[Copy]() : f);
        const deepCopy = new ListImpl<T>(copiedData as any);
        return deepCopy;
    }

    // @serializable(alias("fields", list(autoObject())))
    @observable
    private ___fields: StoredType<T>[] = [];

    private [Update] = (diff: any) => {
        // console.log(diff);
        const update = this[OnUpdate];
        // update && update(diff);
        update?.(diff);
    }

    private [Self] = this;
    private [SelfProxy]: any;

    [ToScriptString]() {
        return `new List([${(this as any).map((field: any) => Field.toScriptString(field))}])`;
    }
    [ToString]() {
        return `List(${(this as any).length})`;
    }
}
export type List<T extends Field> = ListImpl<T> & (T | (T extends RefField ? Promise<T> : never))[];
export const List: { new <T extends Field>(fields?: T[]): List<T> } = ListImpl as any;

Scripting.addGlobal("List", List);
Scripting.addGlobal(function compareLists(l1: any, l2: any) {
    const L1 = Cast(l1, listSpec("string"), []);
    const L2 = Cast(l2, listSpec("string"), []);
    return !L1 && !L2 ? true : L1 && L2 && L1.length === L2.length && L2.reduce((p, v) => p && L1.includes(v), true);
}, "compare two lists");