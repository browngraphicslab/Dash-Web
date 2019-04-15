import { Utils } from "../Utils";

export class Message<T> {
    private _name: string;
    private _guid: string;

    constructor(name: string) {
        this._name = name;
        this._guid = Utils.GenerateDeterministicGuid(name);
    }

    get Name(): string { return this._name; }
    get Message(): string { return this._guid; }
}

export enum Types {
    Number, List, Key, Image, Web, Document, Text, RichText, DocumentReference,
    Html, Video, Audio, Ink, PDF, Tuple, HistogramOp, Boolean, Script,
}

export interface Transferable {
    readonly id: string;
    readonly type: Types;
    readonly data?: any;
}

export namespace MessageStore {
    export const Foo = new Message<string>("Foo");
    export const Bar = new Message<string>("Bar");
    export const SetField = new Message<Transferable>("Set Field"); // send Transferable (no reply)
    export const GetField = new Message<string>("Get Field"); // send string 'id' get Transferable back
    export const GetFields = new Message<string[]>("Get Fields"); // send string[] of 'id' get Transferable[] back
    export const GetDocument = new Message<string>("Get Document");
    export const DeleteAll = new Message<any>("Delete All");
}
