import { Field, Opt } from "./Doc";
import { List } from "./List";

export type ToType<T> =
    T extends "string" ? string :
    T extends "number" ? number :
    T extends "boolean" ? boolean :
    T extends ListSpec<infer U> ? List<U> :
    T extends { new(...args: any[]): infer R } ? R : never;

export type ToConstructor<T> =
    T extends string ? "string" :
    T extends number ? "number" :
    T extends boolean ? "boolean" : { new(...args: any[]): T };

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

export interface Interface {
    [key: string]: ToConstructor<Field> | ListSpec<Field>;
    // [key: string]: ToConstructor<Field> | ListSpec<Field[]>;
}

export type FieldCtor<T extends Field> = ToConstructor<T> | ListSpec<T>;

export function Cast<T extends FieldCtor<Field>>(field: Field | null | undefined, ctor: T): ToType<T> | null | undefined {
    if (field !== undefined && field !== null) {
        if (typeof ctor === "string") {
            if (typeof field === ctor) {
                return field as ToType<T>;
            }
        } else if (typeof ctor === "object") {
            if (field instanceof List) {
                return field as ToType<T>;
            }
        } else if (field instanceof (ctor as any)) {
            return field as ToType<T>;
        }
    } else {
        return field;
    }
    return undefined;
}

export function FieldValue<T extends Field>(field: Opt<T> | Promise<Opt<T>>): Opt<T> {
    return field instanceof Promise ? undefined : field;
}
