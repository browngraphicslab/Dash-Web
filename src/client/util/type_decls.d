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
    replace(a:any, b:any):string; // bcz: fix this
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
interface PromiseLike<T> {
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2>;
}
interface Promise<T> {
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
}

declare const Update: unique symbol;
declare const Self: unique symbol;
declare const SelfProxy: unique symbol;
declare const HandleUpdate: unique symbol;
declare const Id: unique symbol;
declare const OnUpdate: unique symbol;
declare const Parent: unique symbol;
declare const Copy: unique symbol;
declare const ToScriptString: unique symbol;

declare abstract class RefField {
    readonly [Id]: FieldId;

    constructor();
}

declare type FieldId = string;

declare abstract class ObjectField {
    abstract [Copy](): ObjectField;
}

declare abstract class URLField extends ObjectField {
    readonly url: URL;

    constructor(url: string);
    constructor(url: URL);
}

declare class AudioField extends URLField { [Copy](): ObjectField; }
declare class VideoField extends URLField { [Copy](): ObjectField; }
declare class ImageField extends URLField { [Copy](): ObjectField; }
declare class WebField extends URLField { [Copy](): ObjectField; }
declare class PdfField extends URLField { [Copy](): ObjectField; }

declare const ComputedField: any;
declare const CompileScript: any;

// @ts-ignore
declare type Extract<T, U> = T extends U ? T : never;
declare type Field = number | string | boolean | ObjectField | RefField;
declare type FieldWaiting<T extends RefField = RefField> = T extends undefined ? never : Promise<T | undefined>;
declare type FieldResult<T extends Field = Field> = Opt<T> | FieldWaiting<Extract<T, RefField>>;

declare type Opt<T> = T | undefined;
declare class Doc extends RefField {
    constructor();

    [key: string]: FieldResult;
    // [ToScriptString](): string;
}

declare class List<T extends Field> extends ObjectField {
    constructor(fields?: T[]);
    [index: number]: T | (T extends RefField ? Promise<T> : never);
    [Copy](): ObjectField;
}

// @ts-ignore
declare const console: any;

interface DocumentOptions { }

declare const Docs: {
    ImageDocument(url: string, options?: DocumentOptions): Doc;
    VideoDocument(url: string, options?: DocumentOptions): Doc;
    // HistogramDocument(url:string, options?:DocumentOptions);
    TextDocument(options?: DocumentOptions): Doc;
    PdfDocument(url: string, options?: DocumentOptions): Doc;
    WebDocument(url: string, options?: DocumentOptions): Doc;
    HtmlDocument(html: string, options?: DocumentOptions): Doc;
    KVPDocument(document: Doc, options?: DocumentOptions): Doc;
    FreeformDocument(documents: Doc[], options?: DocumentOptions): Doc;
    SchemaDocument(columns: string[], documents: Doc[], options?: DocumentOptions): Doc;
    TreeDocument(documents: Doc[], options?: DocumentOptions): Doc;
    StackingDocument(documents: Doc[], options?: DocumentOptions): Doc;
};

declare function d(...args:any[]):any;
