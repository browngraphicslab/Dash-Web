//@ts-ignore
declare type PropertyKey = string | number | symbol;
interface Array<T> {
    length: number;
    toString(): string;
    toLocaleString(): string;
    pop(): T | undefined;
    push(...items: T[]): number;
    concat(...items: ConcatArray<T>[]): T[];
    concat(...items: (T | ConcatArray<T>)[]): T[];
    join(separator?: string): string;
    reverse(): T[];
    shift(): T | undefined;
    slice(start?: number, end?: number): T[];
    sort(compareFn?: (a: T, b: T) => number): this;
    splice(start: number, deleteCount?: number): T[];
    splice(start: number, deleteCount: number, ...items: T[]): T[];
    unshift(...items: T[]): number;
    indexOf(searchElement: T, fromIndex?: number): number;
    lastIndexOf(searchElement: T, fromIndex?: number): number;
    every(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): boolean;
    some(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): boolean;
    forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;
    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
    filter<S extends T>(callbackfn: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];
    filter(callbackfn: (value: T, index: number, array: T[]) => any, thisArg?: any): T[];
    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
    reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;

    [n: number]: T;
}

interface Function {
    apply(this: Function, thisArg: any, argArray?: any): any;
    call(this: Function, thisArg: any, ...argArray: any[]): any;
    bind(this: Function, thisArg: any, ...argArray: any[]): any;
    toString(): string;

    prototype: any;
    readonly length: number;

    // Non-standard extensions
    arguments: any;
    caller: Function;
}
interface Boolean {
    valueOf(): boolean;
}
interface Number {
    toString(radix?: number): string;
    toFixed(fractionDigits?: number): string;
    toExponential(fractionDigits?: number): string;
    toPrecision(precision?: number): string;
    valueOf(): number;
}
interface IArguments {
    [index: number]: any;
    length: number;
    callee: Function;
}
interface RegExp {
    readonly flags: string;
    readonly sticky: boolean;
    readonly unicode: boolean;
}
interface String {
    codePointAt(pos: number): number | undefined;
    includes(searchString: string, position?: number): boolean;
    endsWith(searchString: string, endPosition?: number): boolean;
    normalize(form: "NFC" | "NFD" | "NFKC" | "NFKD"): string;
    normalize(form?: string): string;
    repeat(count: number): string;
    startsWith(searchString: string, position?: number): boolean;
    anchor(name: string): string;
    big(): string;
    blink(): string;
    bold(): string;
    fixed(): string;
    fontcolor(color: string): string;
    fontsize(size: number): string;
    fontsize(size: string): string;
    italics(): string;
    link(url: string): string;
    small(): string;
    strike(): string;
    sub(): string;
    sup(): string;
}
interface Object {
    constructor: Function;
    toString(): string;
    toLocaleString(): string;
    valueOf(): Object;
    hasOwnProperty(v: PropertyKey): boolean;
    isPrototypeOf(v: Object): boolean;
    propertyIsEnumerable(v: PropertyKey): boolean;
}
interface ConcatArray<T> {
    readonly length: number;
    readonly [n: number]: T;
    join(separator?: string): string;
    slice(start?: number, end?: number): T[];
}
interface URL {
    hash: string;
    host: string;
    hostname: string;
    href: string;
    readonly origin: string;
    password: string;
    pathname: string;
    port: string;
    protocol: string;
    search: string;
    username: string;
    toJSON(): string;
}

declare type FieldId = string;

declare abstract class Field {
    Id: FieldId;
    abstract ToScriptString(): string;
    abstract TrySetValue(value: any): boolean;
    abstract GetValue(): any;
    abstract Copy(): Field;
}

declare abstract class BasicField<T> extends Field {
    constructor(data: T);
    Data: T;
    TrySetValue(value: any): boolean;
    GetValue(): any;
}

declare class TextField extends BasicField<string>{
    constructor();
    constructor(data: string);
    ToScriptString(): string;
    Copy(): Field;
}
declare class ImageField extends BasicField<URL>{
    constructor();
    constructor(data: URL);
    ToScriptString(): string;
    Copy(): Field;
}
declare class HtmlField extends BasicField<string>{
    constructor();
    constructor(data: string);
    ToScriptString(): string;
    Copy(): Field;
}
declare class NumberField extends BasicField<number>{
    constructor();
    constructor(data: number);
    ToScriptString(): string;
    Copy(): Field;
}
declare class WebField extends BasicField<URL>{
    constructor();
    constructor(data: URL);
    ToScriptString(): string;
    Copy(): Field;
}
declare class ListField<T> extends BasicField<T[]>{
    constructor();
    constructor(data: T[]);
    ToScriptString(): string;
    Copy(): Field;
}
declare class Key extends Field {
    constructor(name:string);
    Name: string;
    TrySetValue(value: any): boolean;
    GetValue(): any;
    Copy(): Field;
    ToScriptString(): string;
}
declare type FIELD_WAITING = "<Waiting>";
declare type Opt<T> = T | undefined;
declare type FieldValue<T> = Opt<T> | FIELD_WAITING;
// @ts-ignore
declare class Document extends Field {
    TrySetValue(value: any): boolean;
    GetValue(): any;
    Copy(): Field;
    ToScriptString(): string;

    Width(): number;
    Height(): number;
    Scale(): number;
    Title: string;

    Get(key: Key): FieldValue<Field>;
    GetAsync(key: Key, callback: (field: Field) => void): boolean;
    GetOrCreateAsync<T extends Field>(key: Key, ctor: { new(): T }, callback: (field: T) => void): void;
    GetT<T extends Field>(key: Key, ctor: { new(): T }): FieldValue<T>;
    GetOrCreate<T extends Field>(key: Key, ctor: { new(): T }): T;
    GetData<T, U extends Field & { Data: T }>(key: Key, ctor: { new(): U }, defaultVal: T): T;
    GetHtml(key: Key, defaultVal: string): string;
    GetNumber(key: Key, defaultVal: number): number;
    GetText(key: Key, defaultVal: string): string;
    GetList<T extends Field>(key: Key, defaultVal: T[]): T[];
    Set(key: Key, field: Field | undefined): void;
    SetData<T, U extends Field & { Data: T }>(key: Key, value: T, ctor: { new(): U }): void;
    SetText(key: Key, value: string): void;
    SetNumber(key: Key, value: number): void;
    GetPrototype(): FieldValue<Document>;
    GetAllPrototypes(): Document[];
    MakeDelegate(): Document;
}

declare const KeyStore: {
    [name: string]: Key;
}

// @ts-ignore
declare const console: any;

declare const Documents: any;
