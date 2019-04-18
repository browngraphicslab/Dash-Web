import { observable, action } from "mobx";
import { UndoManager } from "../client/util/UndoManager";
import { serializable, primitive, map, alias } from "serializr";
import { autoObject, SerializationHelper, Deserializable } from "../client/util/SerializationHelper";
import { Utils } from "../Utils";
import { DocServer } from "../client/DocServer";

export const HandleUpdate = Symbol("HandleUpdate");
const Id = Symbol("Id");
export abstract class RefField {
    @serializable(alias("id", primitive()))
    private __id: string;
    readonly [Id]: string;

    constructor(id?: string) {
        this.__id = id || Utils.GenerateGuid();
        this[Id] = this.__id;
    }

    protected [HandleUpdate]?(diff: any): void;
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

@Deserializable("url")
export class URLField extends ObjectField {
    @serializable(url())
    readonly url: URL;

    constructor(url: URL) {
        super();
        this.url = url;
    }
}

@Deserializable("proxy")
export class ProxyField<T extends RefField> extends ObjectField {
    constructor();
    constructor(value: T);
    constructor(value?: T) {
        super();
        if (value) {
            this.cache = value;
            this.fieldId = value[Id];
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
export type Opt<T> = T | undefined;
export type FieldWaiting = null;
export const FieldWaiting: FieldWaiting = null;

const Self = Symbol("Self");

@Deserializable("doc").withFields(["id"])
export class Doc extends RefField {

    private static setter(target: any, prop: string | symbol | number, value: any, receiver: any): boolean {
        if (SerializationHelper.IsSerializing()) {
            target[prop] = value;
            return true;
        }
        if (typeof prop === "symbol") {
            target[prop] = value;
            return true;
        }
        const curValue = target.__fields[prop];
        if (curValue === value || (curValue instanceof ProxyField && value instanceof RefField && curValue.fieldId === value[Id])) {
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
                if (!diff) diff = SerializationHelper.Serialize(value);
                target[Update]({ [prop]: diff });
            };
        }
        if (curValue instanceof ObjectField) {
            delete curValue[Parent];
            delete curValue[Update];
        }
        target.__fields[prop] = value;
        target[Update]({ ["fields." + prop]: value instanceof ObjectField ? SerializationHelper.Serialize(value) : (value === undefined ? null : value) });
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
        if (SerializationHelper.IsSerializing()) {
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

    constructor(id?: string, forceSave?: boolean) {
        super(id);
        const doc = new Proxy<this>(this, {
            set: Doc.setter,
            get: Doc.getter,
            deleteProperty: () => { throw new Error("Currently properties can't be deleted from documents, assign to undefined instead"); },
            defineProperty: () => { throw new Error("Currently properties can't be defined on documents using Object.defineProperty"); },
        });
        if (!id || forceSave) {
            DocServer.CreateField(SerializationHelper.Serialize(doc));
        }
        return doc;
    }

    [key: string]: Field | null | undefined;

    @serializable(alias("fields", map(autoObject())))
    @observable
    private __fields: { [key: string]: Field | null | undefined } = {};

    private [Update] = (diff: any) => {
        DocServer.UpdateField(this[Id], diff);
    }

    private [Self] = this;
}

export namespace Doc {
    export const Prototype = Symbol("Prototype");
}

export const GetAsync = Doc.GetAsync;

interface IDoc {
    [key: string]: Field | null | undefined;
}

interface ImageDocument extends IDoc {
    data: URLField;
    test: number;
}

export type ToType<T> =
    T extends "string" ? string :
    T extends "number" ? number :
    T extends "boolean" ? boolean :
    T extends { new(...args: any[]): infer R } ? R : undefined;

export type ToInterface<T> = {
    [P in keyof T]: ToType<T[P]>;
};

interface Interface {
    [key: string]: { new(...args: any[]): (ObjectField | RefField) } | "number" | "boolean" | "string";
}

type FieldCtor<T extends Field> = { new(): T } | "number" | "string" | "boolean";

function Cast<T extends Field>(field: Field | undefined, ctor: FieldCtor<T>): T | undefined {
    if (field !== undefined) {
        if (typeof ctor === "string") {
            if (typeof field === ctor) {
                return field as T;
            }
        } else if (field instanceof ctor) {
            return field;
        }
    }
    return undefined;
}

export type makeInterface<T extends Interface> = Partial<ToInterface<T>> & Doc;
export function makeInterface<T extends Interface>(schema: T): (doc: Doc) => makeInterface<T> {
    return function (doc: any) {
        return new Proxy(doc, {
            get(target, prop) {
                const field = target[prop];
                if (prop in schema) {
                    return Cast(field, (schema as any)[prop]);
                }
                return field;
            }
        });
    };
}

export type makeStrictInterface<T extends Interface> = Partial<ToInterface<T>>;
export function makeStrictInterface<T extends Interface>(schema: T): (doc: Doc) => makeStrictInterface<T> {
    const proto = {};
    for (const key in schema) {
        const type = schema[key];
        Object.defineProperty(proto, key, {
            get() {
                return Cast(this.__doc[key], type);
            },
            set(value) {
                value = Cast(value, type);
                if (value !== undefined) {
                    this.__doc[key] = value;
                    return;
                }
                throw new TypeError("Expected type " + type);
            }
        });
    }
    return function (doc: any) {
        const obj = Object.create(proto);
        obj.__doc = doc;
        return obj;
    };
}

export function createSchema<T extends Interface>(schema: T): T {
    return schema;
}