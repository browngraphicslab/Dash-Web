import { observable, action } from "mobx";
import { serializable, primitive, map, alias, list } from "serializr";
import { autoObject, SerializationHelper, Deserializable } from "../client/util/SerializationHelper";
import { Utils } from "../Utils";
import { DocServer } from "../client/DocServer";
import { setter, getter, getField } from "./util";
import { Cast, FieldCtor } from "./Types";

export const HandleUpdate = Symbol("HandleUpdate");
export const Id = Symbol("Id");
export abstract class RefField {
    @serializable(alias("id", primitive()))
    private __id: string;
    readonly [Id]: string;

    constructor(id?: string) {
        this.__id = id || Utils.GenerateGuid();
        this[Id] = this.__id;
    }

    protected [HandleUpdate]?(diff: any): void;
}

export const Update = Symbol("Update");
export const OnUpdate = Symbol("OnUpdate");
export const Parent = Symbol("Parent");
export class ObjectField {
    protected [OnUpdate]?: (diff?: any) => void;
    private [Parent]?: Doc;
}

export type Field = number | string | boolean | ObjectField | RefField;
export type Opt<T> = T | undefined;
export type FieldWaiting = null;
export const FieldWaiting: FieldWaiting = null;

export const Self = Symbol("Self");

@Deserializable("doc").withFields(["id"])
export class Doc extends RefField {
    constructor(id?: string, forceSave?: boolean) {
        super(id);
        const doc = new Proxy<this>(this, {
            set: setter,
            get: getter,
            deleteProperty: () => { throw new Error("Currently properties can't be deleted from documents, assign to undefined instead"); },
            defineProperty: () => { throw new Error("Currently properties can't be defined on documents using Object.defineProperty"); },
        });
        if (!id || forceSave) {
            DocServer.CreateField(SerializationHelper.Serialize(doc));
        }
        return doc;
    }

    [key: string]: Field | null | undefined;

    @serializable(alias("fields", map(autoObject())))
    @observable
    private __fields: { [key: string]: Field | null | undefined } = {};

    private [Update] = (diff: any) => {
        DocServer.UpdateField(this[Id], diff);
    }

    private [Self] = this;
}

export namespace Doc {
    export function GetAsync(doc: Doc, key: string, ignoreProto: boolean = false): Promise<Field | undefined> {
        const self = doc[Self];
        return new Promise(res => getField(self, key, ignoreProto, res));
    }
    export function GetTAsync<T extends Field>(doc: Doc, key: string, ctor: FieldCtor<T>, ignoreProto: boolean = false): Promise<T | undefined> {
        const self = doc[Self];
        return new Promise(async res => {
            const field = await GetAsync(doc, key, ignoreProto);
            return Cast(field, ctor);
        });
    }
    export function Get(doc: Doc, key: string, ignoreProto: boolean = false): Field | null | undefined {
        const self = doc[Self];
        return getField(self, key, ignoreProto);
    }
    export function GetT<T extends Field>(doc: Doc, key: string, ctor: FieldCtor<T>, ignoreProto: boolean = false): Field | null | undefined {
        return Cast(Get(doc, key, ignoreProto), ctor);
    }
    export function MakeDelegate(doc: Opt<Doc>): Opt<Doc> {
        if (!doc) {
            return undefined;
        }
        const delegate = new Doc();
        delegate.prototype = doc;
        return delegate;
    }
    export const Prototype = Symbol("Prototype");
}

export const GetAsync = Doc.GetAsync;