import { Field, Opt, FieldWaiting, FieldValue } from "./Doc";
import { List } from "./List";

export type ToType<T> =
    T extends "string" ? string :
    T extends "number" ? number :
    T extends "boolean" ? boolean :
    T extends ListSpec<infer U> ? List<U> :
    T extends { new(...args: any[]): infer R } ? (R | Promise<R>) : never;

export type ToConstructor<T> =
    T extends string ? "string" :
    T extends number ? "number" :
    T extends boolean ? "boolean" : new (...args: any[]) => T;

export type ToInterface<T> = {
    [P in keyof T]: ToType<T[P]>;
};

// type ListSpec<T extends Field[]> = { List: FieldCtor<Head<T>> | ListSpec<Tail<T>> };
export type ListSpec<T> = { List: FieldCtor<T> };

// type ListType<U extends Field[]> = { 0: List<ListType<Tail<U>>>, 1: ToType<Head<U>> }[HasTail<U> extends true ? 0 : 1];

export type Head<T extends any[]> = T extends [any, ...any[]] ? T[0] : never;
export type Tail<T extends any[]> =
    ((...t: T) => any) extends ((_: any, ...tail: infer TT) => any) ? TT : [];
export type HasTail<T extends any[]> = T extends ([] | [any]) ? false : true;

//TODO Allow you to optionally specify default values for schemas, which should then make that field not be partial
export interface Interface {
    [key: string]: ToConstructor<Field> | ListSpec<Field>;
    // [key: string]: ToConstructor<Field> | ListSpec<Field[]>;
}

export type FieldCtor<T extends Field> = T extends List<infer R> ? ListSpec<R> : ToConstructor<T>;

export function Cast<T extends FieldCtor<Field>>(field: Field | FieldWaiting | undefined, ctor: T): FieldValue<ToType<T>>;
export function Cast<T extends FieldCtor<Field>>(field: Field | FieldWaiting | undefined, ctor: T, defaultVal: ToType<T>): ToType<T>;
export function Cast<T extends FieldCtor<Field>>(field: Field | FieldWaiting | undefined, ctor: T, defaultVal?: ToType<T>): FieldValue<ToType<T>> | undefined {
    if (field instanceof Promise) {
        return defaultVal === undefined ? field.then(f => Cast(f, ctor) as any) : defaultVal;
    }
    if (field !== undefined && !(field instanceof Promise)) {
        if (typeof ctor === "string") {
            if (typeof field === ctor) {
                return field as ToType<T>;
            }
        } else if (typeof ctor === "object") {
            if (field instanceof List) {
                return field as any;
            }
        } else if (field instanceof (ctor as any)) {
            return field as ToType<T>;
        }
    }
    return defaultVal;
}

export function FieldValue<T extends Field, U extends T>(field: Opt<T> | Promise<Opt<T>>, defaultValue: U): T;
export function FieldValue<T extends Field>(field: Opt<T> | Promise<Opt<T>>): Opt<T>;
export function FieldValue<T extends Field>(field: Opt<T> | Promise<Opt<T>>, defaultValue?: T): Opt<T> {
    return field instanceof Promise ? defaultValue : field;
}

export interface PromiseLike<T> {
    then(callback: (field: Opt<T> | PromiseLike<T>) => void): void;
}
export function PromiseValue<T extends Field>(field: FieldValue<T>): PromiseLike<Opt<T>> {
    return field instanceof Promise ? field : { then(cb: ((field: Opt<T>) => void)) { return cb(field); } };
}