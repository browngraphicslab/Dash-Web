import { Utils } from "../Utils";
import { FIELD_ID, Field } from "../fields/Field";

export class Message<T> {
    private name: string;
    private guid: string;
    readonly ArgsCtor: new (...args: any) => T;

    get Name(): string {
        return this.name;
    }

    get Message(): string {
        return this.guid
    }

    constructor(name: string, ctor: new (...args: any) => T) {
        this.name = name;
        this.guid = Utils.GenerateDeterministicGuid(name)
        this.ArgsCtor = ctor;
    }

    GetValue() {
        return this.Name;
    }
}

class TestMessageArgs {
    hello: string = "";
}

export class SetFieldArgs {
    field: string;
    value: any;

    constructor(f: string, v: any) {
        this.field = f
        this.value = v
    }
}

export class GetFieldArgs {
    field: string;

    constructor(f: string) {
        this.field = f
    }
}

export enum Types {
    Number, List, Key, Image, Document, Text, RichText, DocumentReference
}

export class DocumentTransfer implements Transferable {
    readonly type = Types.Document

    constructor(readonly id: string) { }
}

export class ImageTransfer implements Transferable {
    readonly type = Types.Image

    constructor(readonly id: string) { }
}

export class KeyTransfer implements Transferable {
    name: string
    readonly id: string
    readonly type = Types.Key

    constructor(i: string, n: string) {
        this.name = n
        this.id = i
    }
}

export class ListTransfer implements Transferable {
    type = Types.List;

    constructor(readonly id: string) { }
}

export class NumberTransfer implements Transferable {
    readonly type = Types.Number

    constructor(readonly value: number, readonly id: string) { }
}

export class TextTransfer implements Transferable {
    value: string
    readonly id: string
    readonly type = Types.Text

    constructor(t: string, i: string) {
        this.value = t
        this.id = i
    }
}

export class RichTextTransfer implements Transferable {
    value: string
    readonly id: string
    readonly type = Types.Text

    constructor(t: string, i: string) {
        this.value = t
        this.id = i
    }
}

interface Transferable {
    readonly id: string
    readonly type: Types
}

export namespace MessageStore {
    export const Foo = new Message("Foo", String);
    export const Bar = new Message("Bar", String);
    export const AddDocument = new Message("Add Document", TestMessageArgs);
    export const SetField = new Message("Set Field", SetFieldArgs)
    export const GetField = new Message("Get Field", GetFieldArgs)
}