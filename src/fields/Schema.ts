import { Interface, ToInterface, Cast, ToConstructor, HasTail, Head, Tail, ListSpec, ToType, DefaultFieldConstructor } from "./Types";
import { Doc, Field } from "./Doc";
import { ObjectField } from "./ObjectField";
import { RefField } from "./RefField";
import { SelfProxy } from "./FieldSymbols";

type AllToInterface<T extends Interface[]> = {
    1: ToInterface<Head<T>> & AllToInterface<Tail<T>>,
    0: ToInterface<Head<T>>
}[HasTail<T> extends true ? 1 : 0];

export const emptySchema = createSchema({});
export const Document = makeInterface(emptySchema);
export type Document = makeInterface<[typeof emptySchema]>;

export interface InterfaceFunc<T extends Interface[]> {
    (docs: Doc[]): makeInterface<T>[];
    (): makeInterface<T>;
    (doc: Doc): makeInterface<T>;
}

export type makeInterface<T extends Interface[]> = AllToInterface<T> & Doc & { proto: Doc | undefined };
// export function makeInterface<T extends Interface[], U extends Doc>(schemas: T): (doc: U) => All<T, U>;
// export function makeInterface<T extends Interface, U extends Doc>(schema: T): (doc: U) => makeInterface<T, U>; 
export function makeInterface<T extends Interface[]>(...schemas: T): InterfaceFunc<T> {
    const schema: Interface = {};
    for (const s of schemas) {
        for (const key in s) {
            schema[key] = s[key];
        }
    }
    const proto = new Proxy({}, {
        get(target: any, prop, receiver) {
            const field = receiver.doc?.[prop];
            if (prop in schema) {
                const desc = prop === "proto" ? Doc : (schema as any)[prop]; // bcz: proto doesn't appear in schemas ... maybe it should?
                if (typeof desc === "object" && "defaultVal" in desc && "type" in desc) {//defaultSpec
                    return Cast(field, desc.type, desc.defaultVal);
                } else if (typeof desc === "function" && !ObjectField.isPrototypeOf(desc) && !RefField.isPrototypeOf(desc)) {
                    const doc = Cast(field, Doc);
                    if (doc === undefined) {
                        return undefined;
                    } else if (doc instanceof Doc) {
                        return desc(doc);
                    } else {
                        return doc.then(doc => doc && desc(doc));
                    }
                } else {
                    return Cast(field, desc);
                }
            }
            return field;
        },
        set(target: any, prop, value, receiver) {
            receiver.doc && (receiver.doc[prop] = value);  // receiver.doc may be undefined as the result of a change in acls
            return true;
        }
    });
    const fn = (doc: Doc) => {
        doc = doc[SelfProxy];
        // if (!(doc instanceof Doc)) {
        //     throw new Error("Currently wrapping a schema in another schema isn't supported");
        // }
        const obj = Object.create(proto, { doc: { value: doc, writable: false } });
        return obj;
    };
    return function (doc?: Doc | Doc[]) {
        if (doc instanceof Doc || doc === undefined) {
            return fn(doc || new Doc);
        } else {
            if (!doc instanceof Promise) return doc.map(fn);
        }
    };
}

export type makeStrictInterface<T extends Interface> = Partial<ToInterface<T>>;
export function makeStrictInterface<T extends Interface>(schema: T): (doc: Doc) => makeStrictInterface<T> {
    const proto = {};
    for (const key in schema) {
        const type = schema[key];
        Object.defineProperty(proto, key, {
            get() {
                return Cast(this.__doc[key], type as any);
            },
            set(value) {
                value = Cast(value, type as any);
                if (value !== undefined) {
                    this.__doc[key] = value;
                    return;
                }
                throw new TypeError("Expected type " + type);
            }
        });
    }
    return function (doc: any) {
        if (!(doc instanceof Doc)) {
            throw new Error("Currently wrapping a schema in another schema isn't supported");
        }
        const obj = Object.create(proto);
        obj.__doc = doc;
        return obj;
    };
}

export function createSchema<T extends Interface>(schema: T): T & { proto: ToConstructor<Doc> } {
    (schema as any).proto = Doc;
    return schema as any;
}

export function listSpec<U extends ToConstructor<Field>>(type: U): ListSpec<ToType<U>> {
    return { List: type as any };//TODO Types
}

export function defaultSpec<T extends ToConstructor<Field>>(type: T, defaultVal: ToType<T>): DefaultFieldConstructor<ToType<T>> {
    return {
        type: type as any,
        defaultVal
    };
}