import { Interface, ToInterface, Cast, FieldCtor, ToConstructor, HasTail, Head, Tail } from "./Types";
import { Doc, Field, ObjectField } from "./Doc";

type AllToInterface<T extends Interface[]> = {
    1: ToInterface<Head<T>> & AllToInterface<Tail<T>>,
    0: ToInterface<Head<T>>
}[HasTail<T> extends true ? 1 : 0];

export const emptySchema = createSchema({});
export const Document = makeInterface(emptySchema);
export type Document = makeInterface<[typeof emptySchema]>;

export type makeInterface<T extends Interface[], U extends Doc = Doc> = Partial<AllToInterface<T>> & U;
// export function makeInterface<T extends Interface[], U extends Doc>(schemas: T): (doc: U) => All<T, U>;
// export function makeInterface<T extends Interface, U extends Doc>(schema: T): (doc: U) => makeInterface<T, U>; 
export function makeInterface<T extends Interface[], U extends Doc>(...schemas: T): (doc: U) => makeInterface<T, U> {
    let schema: Interface = {};
    for (const s of schemas) {
        for (const key in s) {
            schema[key] = s[key];
        }
    }
    const proto = new Proxy({}, {
        get(target: any, prop) {
            const field = target.doc[prop];
            if (prop in schema) {
                return Cast(field, (schema as any)[prop]);
            }
            return field;
        },
        set(target: any, prop, value) {
            target.doc[prop] = value;
            return true;
        }
    });
    return function (doc: any) {
        const obj = Object.create(proto, { doc: { value: doc, writable: false } });
        return obj;
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
        const obj = Object.create(proto);
        obj.__doc = doc;
        return obj;
    };
}

export function createSchema<T extends Interface>(schema: T): T & { prototype: ToConstructor<Doc> } {
    schema.prototype = Doc;
    return schema as any;
}
