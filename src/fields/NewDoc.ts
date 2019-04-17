import { observable, action } from "mobx";
import { Server } from "../client/Server";
import { UndoManager } from "../client/util/UndoManager";
import { serialize, deserialize, serializable, primitive, map, alias } from "serializr";
import { autoObject, SerializationHelper, Deserializable } from "../client/util/SerializationHelper";

export abstract class RefField {
    @serializable(alias("id", primitive()))
    readonly __id: string;

    constructor(id: string) {
        this.__id = id;
    }
}

const Update = Symbol("Update");
const Parent = Symbol("Parent");
export class ObjectField {
    protected [Update]?: (diff?: any) => void;
    private [Parent]?: Doc;
}

function url() {
    return {
        serializer: function (value: URL) {
            return value.href;
        },
        deserializer: function (jsonValue: string, done: (err: any, val: any) => void) {
            done(undefined, new URL(jsonValue));
        }
    };
}

@Deserializable
export class URLField extends ObjectField {
    @serializable(url())
    url: URL;

    constructor(url: URL) {
        super();
        this.url = url;
    }
}

@Deserializable
export class ProxyField<T extends RefField> extends ObjectField {
    constructor();
    constructor(value: T);
    constructor(value?: T) {
        super();
        if (value) {
            this.cache = value;
            this.fieldId = value.__id;
        }
    }

    @serializable(primitive())
    readonly fieldId: string = "";

    // This getter/setter and nested object thing is 
    // because mobx doesn't play well with observable proxies
    @observable.ref
    private _cache: { readonly field: T | undefined } = { field: undefined };
    private get cache(): T | undefined {
        return this._cache.field;
    }
    private set cache(field: T | undefined) {
        this._cache = { field };
    }

    private failed = false;
    private promise?: Promise<any>;

    value(callback?: ((field: T | undefined) => void)): T | undefined | null {
        if (this.cache) {
            callback && callback(this.cache);
            return this.cache;
        }
        if (this.failed) {
            return undefined;
        }
        if (!this.promise) {
            // this.promise = Server.GetField(this.fieldId).then(action((field: any) => {
            //     this.promise = undefined;
            //     this.cache = field;
            //     if (field === undefined) this.failed = true;
            //     return field;
            // }));
            this.promise = new Promise(r => r());
        }
        callback && this.promise.then(callback);
        return null;
    }
}

export type Field = number | string | boolean | ObjectField | RefField;

const Self = Symbol("Self");

@Deserializable
export class Doc extends RefField {

    private static setter(target: any, prop: string | symbol | number, value: any, receiver: any): boolean {
        if (prop === "__id" || prop === "__fields") {
            target[prop] = value;
            return true;
        }
        const curValue = target.__fields[prop];
        if (curValue === value || (curValue instanceof ProxyField && value instanceof RefField && curValue.fieldId === value.__id)) {
            // TODO This kind of checks correctly in the case that curValue is a ProxyField and value is a RefField, but technically
            // curValue should get filled in with value if it isn't already filled in, in case we fetched the referenced field some other way
            return true;
        }
        if (value instanceof RefField) {
            value = new ProxyField(value);
        }
        if (value instanceof ObjectField) {
            if (value[Parent] && value[Parent] !== target) {
                throw new Error("Can't put the same object in multiple documents at the same time");
            }
            value[Parent] = target;
            value[Update] = (diff?: any) => {
                if (!diff) diff = serialize(value);
                target[Update]({ [prop]: diff });
            };
        }
        if (curValue instanceof ObjectField) {
            delete curValue[Parent];
            delete curValue[Update];
        }
        target.__fields[prop] = value;
        target[Update]({ [prop]: typeof value === "object" ? serialize(value) : value });
        UndoManager.AddEvent({
            redo: () => receiver[prop] = value,
            undo: () => receiver[prop] = curValue
        });
        return true;
    }

    private static getter(target: any, prop: string | symbol | number, receiver: any): any {
        if (typeof prop === "symbol") {
            return target[prop];
        }
        if (prop === "__id" || prop === "__fields") {
            return target[prop];
        }
        return Doc.getField(target, prop, receiver);
    }

    private static getField(target: any, prop: string | number, ignoreProto: boolean = false, callback?: (field: Field | undefined) => void): any {
        const field = target.__fields[prop];
        if (field instanceof ProxyField) {
            return field.value(callback);
        }
        if (field === undefined && !ignoreProto) {
            const proto = Doc.getField(target, "prototype", true);
            if (proto instanceof Doc) {
                let field = proto[prop];
                callback && callback(field === null ? undefined : field);
                return field;
            }
        }
        callback && callback(field);
        return field;

    }

    static GetAsync(doc: Doc, key: string, ignoreProto: boolean = false): Promise<Field | undefined> {
        const self = doc[Self];
        return new Promise(res => Doc.getField(self, key, ignoreProto, res));
    }

    static Serialize(doc: Doc) {
        return SerializationHelper.Serialize(doc[Self]);
    }

    constructor(id: string) {
        super(id);
        const doc = new Proxy<this>(this, {
            set: Doc.setter,
            get: Doc.getter,
            deleteProperty: () => { throw new Error("Currently properties can't be deleted from documents, assign to undefined instead"); },
            defineProperty: () => { throw new Error("Currently properties can't be defined on documents using Object.defineProperty"); },
        });
        return doc;
    }

    [key: string]: Field | null | undefined;

    @serializable(alias("fields", map(autoObject())))
    @observable
    private __fields: { [key: string]: Field | null | undefined } = {};

    private [Update] = (diff?: any) => {
        console.log(JSON.stringify(diff || this));
    }

    private [Self] = this;
}

export namespace Doc {
    export const Prototype = Symbol("Prototype");
}

export const GetAsync = Doc.GetAsync;