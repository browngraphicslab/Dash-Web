import { Field, Opt, FieldResult, Doc } from "./Doc";
import { List } from "./List";
import { RefField } from "./RefField";
import { DateField } from "./DateField";
import { ScriptField } from "./ScriptField";

export type ToType<T extends InterfaceValue> =
    T extends "string" ? string :
    T extends "number" ? number :
    T extends "boolean" ? boolean :
    T extends ListSpec<infer U> ? List<U> :
    // T extends { new(...args: any[]): infer R } ? (R | Promise<R>) : never;
    T extends DefaultFieldConstructor<infer _U> ? never :
    T extends { new(...args: any[]): List<Field> } ? never :
    T extends { new(...args: any[]): infer R } ? R :
    T extends (doc?: Doc) => infer R ? R : never;

export type ToConstructor<T extends Field> =
    T extends string ? "string" :
    T extends number ? "number" :
    T extends boolean ? "boolean" :
    T extends List<infer U> ? ListSpec<U> :
    new (...args: any[]) => T;

export type ToInterface<T extends Interface> = {
    [P in Exclude<keyof T, "proto">]: T[P] extends DefaultFieldConstructor<infer F> ? Exclude<FieldResult<F>, undefined> : FieldResult<ToType<T[P]>>;
};

// type ListSpec<T extends Field[]> = { List: ToContructor<Head<T>> | ListSpec<Tail<T>> };
export type ListSpec<T extends Field> = { List: ToConstructor<T> };

export type DefaultFieldConstructor<T extends Field> = {
    type: ToConstructor<T>,
    defaultVal: T
};

// type ListType<U extends Field[]> = { 0: List<ListType<Tail<U>>>, 1: ToType<Head<U>> }[HasTail<U> extends true ? 0 : 1];

export type Head<T extends any[]> = T extends [any, ...any[]] ? T[0] : never;
export type Tail<T extends any[]> =
    ((...t: T) => any) extends ((_: any, ...tail: infer TT) => any) ? TT : [];
export type HasTail<T extends any[]> = T extends ([] | [any]) ? false : true;

export type InterfaceValue = ToConstructor<Field> | ListSpec<Field> | DefaultFieldConstructor<Field> | ((doc?: Doc) => any);
//TODO Allow you to optionally specify default values for schemas, which should then make that field not be partial
export interface Interface {
    [key: string]: InterfaceValue;
    // [key: string]: ToConstructor<Field> | ListSpec<Field[]>;
}
export type WithoutRefField<T extends Field> = T extends RefField ? never : T;

export type CastCtor = ToConstructor<Field> | ListSpec<Field>;

export function Cast<T extends CastCtor>(field: FieldResult, ctor: T): FieldResult<ToType<T>>;
export function Cast<T extends CastCtor>(field: FieldResult, ctor: T, defaultVal: WithoutList<WithoutRefField<ToType<T>>> | null): WithoutList<ToType<T>>;
export function Cast<T extends CastCtor>(field: FieldResult, ctor: T, defaultVal?: ToType<T> | null): FieldResult<ToType<T>> | undefined {
    if (field instanceof Promise) {
        return defaultVal === undefined ? field.then(f => Cast(f, ctor) as any) as any : defaultVal === null ? undefined : defaultVal;
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
    return defaultVal === null ? undefined : defaultVal;
}

export function NumCast(field: FieldResult, defaultVal: number | null = 0) {
    return Cast(field, "number", defaultVal);
}

export function StrCast(field: FieldResult, defaultVal: string | null = "") {
    return Cast(field, "string", defaultVal);
}

export function BoolCast(field: FieldResult, defaultVal: boolean | null = false) {
    return Cast(field, "boolean", defaultVal);
}
export function DateCast(field: FieldResult) {
    return Cast(field, DateField, null);
}

export function ScriptCast(field: FieldResult, defaultVal: ScriptField | null = null) {
    return Cast(field, ScriptField, defaultVal);
}

type WithoutList<T extends Field> = T extends List<infer R> ? (R extends RefField ? (R | Promise<R>)[] : R[]) : T;

export function FieldValue<T extends Field, U extends WithoutList<T>>(field: FieldResult<T>, defaultValue: U): WithoutList<T>;
export function FieldValue<T extends Field>(field: FieldResult<T>): Opt<T>;
export function FieldValue<T extends Field>(field: FieldResult<T>, defaultValue?: T): Opt<T> {
    return (field instanceof Promise || field === undefined) ? defaultValue : field;
}

export interface PromiseLike<T> {
    then(callback: (field: Opt<T>) => void): void;
}
export function PromiseValue<T extends Field>(field: FieldResult<T>): PromiseLike<Opt<T>> {
    return field instanceof Promise ? field : { then(cb: ((field: Opt<T>) => void)) { return cb(field); } };
}