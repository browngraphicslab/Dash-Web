import { Interface, ToInterface, Cast } from "./Types";
import { Doc } from "./Doc";

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

export function createSchema<T extends Interface>(schema: T): T {
    return schema;
}
