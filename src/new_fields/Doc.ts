import { observable, action } from "mobx";
import { serializable, primitive, map, alias, list } from "serializr";
import { autoObject, SerializationHelper, Deserializable } from "../client/util/SerializationHelper";
import { Utils } from "../Utils";
import { DocServer } from "../client/DocServer";
import { setter, getter, getField } from "./util";
import { Cast, FieldCtor } from "./Types";

export type FieldId = string;
export const HandleUpdate = Symbol("HandleUpdate");
export const Id = Symbol("Id");
export abstract class RefField {
    @serializable(alias("id", primitive()))
    private __id: FieldId;
    readonly [Id]: FieldId;

    constructor(id?: FieldId) {
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
export type FieldWaiting<T extends Field = Field> = Promise<T | undefined>;
export type FieldResult<T extends Field = Field> = Opt<T> | FieldWaiting<T>;

export const Self = Symbol("Self");

@Deserializable("doc").withFields(["id"])
export class Doc extends RefField {
    constructor(id?: FieldId, forceSave?: boolean) {
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

    [key: string]: Field | FieldWaiting | undefined;

    @serializable(alias("fields", map(autoObject())))
    @observable
    private __fields: { [key: string]: Field | FieldWaiting | undefined } = {};

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
        return new Promise(async res => {
            const field = await GetAsync(doc, key, ignoreProto);
            return Cast(field, ctor);
        });
    }
    export function Get(doc: Doc, key: string, ignoreProto: boolean = false): FieldResult {
        const self = doc[Self];
        return getField(self, key, ignoreProto);
    }
    export function GetT<T extends Field>(doc: Doc, key: string, ctor: FieldCtor<T>, ignoreProto: boolean = false): T | null | undefined {
        return Cast(Get(doc, key, ignoreProto), ctor) as T | null | undefined;
    }
    export function MakeDelegate(doc: Opt<Doc>): Opt<Doc> {
        if (!doc) {
            return undefined;
        }
        const delegate = new Doc();
        //TODO Does this need to be doc[Self]?
        delegate.prototype = doc;
        return delegate;
    }
    export const Prototype = Symbol("Prototype");
}

export const GetAsync = Doc.GetAsync;