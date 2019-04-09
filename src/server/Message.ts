import { Utils } from "../Utils";

export class Message<T> {
    private name: string;
    private guid: string;

    get Name(): string {
        return this.name;
    }

    get Message(): string {
        return this.guid;
    }

    constructor(name: string) {
        this.name = name;
        this.guid = Utils.GenerateDeterministicGuid(name);
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
        this.field = f;
        this.value = v;
    }
}

export class GetFieldArgs {
    field: string;

    constructor(f: string) {
        this.field = f;
    }
}

export enum Types {
    Number,
    List,
    Key,
    Image,
    Web,
    Document,
    Text,
    RichText,
    DocumentReference,
    Html,
    Video,
    Audio,
    Ink,
    PDF,
    Tuple,
    HistogramOp,
    Boolean,
    Script,
}

export class DocumentTransfer implements Transferable {
    readonly type = Types.Document;
    _id: string;

    constructor(
        readonly obj: { type: Types; data: [string, string][]; _id: string }
    ) {
        this._id = obj._id;
    }
}

export class ImageTransfer implements Transferable {
    readonly type = Types.Image;

    constructor(readonly _id: string) { }
}

export class KeyTransfer implements Transferable {
    name: string;
    readonly _id: string;
    readonly type = Types.Key;

    constructor(i: string, n: string) {
        this.name = n;
        this._id = i;
    }
}

export class ListTransfer implements Transferable {
    type = Types.List;

    constructor(readonly _id: string) { }
}

export class NumberTransfer implements Transferable {
    readonly type = Types.Number;

    constructor(readonly value: number, readonly _id: string) { }
}

export class TextTransfer implements Transferable {
    value: string;
    readonly _id: string;
    readonly type = Types.Text;

    constructor(t: string, i: string) {
        this.value = t;
        this._id = i;
    }
}

export class RichTextTransfer implements Transferable {
    value: string;
    readonly _id: string;
    readonly type = Types.Text;

    constructor(t: string, i: string) {
        this.value = t;
        this._id = i;
    }
}

export interface Transferable {
    readonly _id: string;
    readonly type: Types;
}

export namespace MessageStore {
    export const Foo = new Message<string>("Foo");
    export const Bar = new Message<string>("Bar");
    export const AddDocument = new Message<DocumentTransfer>("Add Document");
    export const SetField = new Message<{ _id: string; data: any; type: Types }>(
        "Set Field"
    );
    export const GetField = new Message<string>("Get Field");
    export const GetFields = new Message<string[]>("Get Fields");
    export const GetDocument = new Message<string>("Get Document");
    export const DeleteAll = new Message<any>("Delete All");
}
