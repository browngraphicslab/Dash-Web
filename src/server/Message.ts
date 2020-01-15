import { Utils } from "../Utils";
import { Point } from "../pen-gestures/ndollar";

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
    Number, List, Key, Image, Web, Document, Text, Icon, RichText, DocumentReference,
    Html, Video, Audio, Ink, PDF, Tuple, HistogramOp, Boolean, Script, Templates
}

export interface Transferable {
    readonly id: string;
    readonly type: Types;
    readonly data?: any;
}

export enum YoutubeQueryTypes {
    Channels, SearchVideo, VideoDetails
}

export interface YoutubeQueryInput {
    readonly type: YoutubeQueryTypes;
    readonly userInput?: string;
    readonly videoIds?: string;
}

export interface Reference {
    readonly id: string;
}

export interface Diff extends Reference {
    readonly diff: any;
}

export interface GestureContent {
    readonly points: Array<Point>;
    readonly width?: string;
    readonly color?: string;
}

export interface MobileInkBoxTriggerContent {
    readonly enableBox: boolean;
}

export namespace MessageStore {
    export const Foo = new Message<string>("Foo");
    export const Bar = new Message<string>("Bar");
    export const SetField = new Message<Transferable>("Set Field"); // send Transferable (no reply)
    export const GetField = new Message<string>("Get Field"); // send string 'id' get Transferable back
    export const GetFields = new Message<string[]>("Get Fields"); // send string[] of 'id' get Transferable[] back
    export const GetDocument = new Message<string>("Get Document");
    export const DeleteAll = new Message<any>("Delete All");
    export const ConnectionTerminated = new Message<string>("Connection Terminated");
    export const GesturePoints = new Message<GestureContent>("Gesture Points");
    export const MobileInkBoxTrigger = new Message<boolean>("Trigger Mobile Ink Box");

    export const GetRefField = new Message<string>("Get Ref Field");
    export const GetRefFields = new Message<string[]>("Get Ref Fields");
    export const UpdateField = new Message<Diff>("Update Ref Field");
    export const CreateField = new Message<Reference>("Create Ref Field");
    export const YoutubeApiQuery = new Message<YoutubeQueryInput>("Youtube Api Query");
    export const DeleteField = new Message<string>("Delete field");
    export const DeleteFields = new Message<string[]>("Delete fields");
}
