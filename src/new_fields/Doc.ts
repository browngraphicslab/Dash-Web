import { observable, action } from "mobx";
import { serializable, primitive, map, alias, list } from "serializr";
import { autoObject, SerializationHelper, Deserializable } from "../client/util/SerializationHelper";
import { Utils } from "../Utils";
import { DocServer } from "../client/DocServer";
import { setter, getter, getField } from "./util";
import { Cast, ToConstructor, PromiseValue, FieldValue } from "./Types";
import { UndoManager, undoBatch } from "../client/util/UndoManager";
import { listSpec } from "./Schema";
import { List } from "./List";

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
    readonly [Id] = "";
}

export type Field = number | string | boolean | ObjectField | RefField;
export type Opt<T> = T | undefined;
export type FieldWaiting<T extends RefField = RefField> = T extends undefined ? never : Promise<T | undefined>;
export type FieldResult<T extends Field = Field> = Opt<T> | FieldWaiting<Extract<T, RefField>>;

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

    proto: Opt<Doc>;
    [key: string]: FieldResult;

    @serializable(alias("fields", map(autoObject())))
    @observable
    //{ [key: string]: Field | FieldWaiting | undefined }
    private __fields: any = {};

    private [Update] = (diff: any) => {
        DocServer.UpdateField(this[Id], diff);
    }

    private [Self] = this;
}

export namespace Doc {
    // export function GetAsync(doc: Doc, key: string, ignoreProto: boolean = false): Promise<Field | undefined> {
    //     const self = doc[Self];
    //     return new Promise(res => getField(self, key, ignoreProto, res));
    // }
    // export function GetTAsync<T extends Field>(doc: Doc, key: string, ctor: ToConstructor<T>, ignoreProto: boolean = false): Promise<T | undefined> {
    //     return new Promise(async res => {
    //         const field = await GetAsync(doc, key, ignoreProto);
    //         return Cast(field, ctor);
    //     });
    // }
    export function Get(doc: Doc, key: string, ignoreProto: boolean = false): FieldResult {
        const self = doc[Self];
        return getField(self, key, ignoreProto);
    }
    export function GetT<T extends Field>(doc: Doc, key: string, ctor: ToConstructor<T>, ignoreProto: boolean = false): T | null | undefined {
        return Cast(Get(doc, key, ignoreProto), ctor) as T | null | undefined;
    }
    export async function SetOnPrototype(doc: Doc, key: string, value: Field) {
        const proto = doc.proto;
        if (proto) {
            proto[key] = value;
        }
    }
    export function GetAllPrototypes(doc: Doc): Doc[] {
        const protos: Doc[] = [];
        let d: Opt<Doc> = doc;
        while (d) {
            protos.push(d);
            d = FieldValue(d.proto);
        }
        return protos;
    }
    export function assign<K extends string>(doc: Doc, fields: Partial<Record<K, Opt<Field>>>) {
        for (const key in fields) {
            if (fields.hasOwnProperty(key)) {
                const value = fields[key];
                if (value !== undefined) {
                    doc[key] = value;
                }
            }
        }
        return doc;
    }

    export function MakeAlias(doc: Doc) {
        const alias = new Doc;

        PromiseValue(Cast(doc.proto, Doc)).then(proto => {
            if (proto) {
                alias.proto = proto;
            }
        });

        return alias;
    }

    export function MakeLink(source: Doc, target: Doc): Doc {
        let linkDoc = new Doc;
        UndoManager.RunInBatch(() => {
            linkDoc.title = "New Link";
            linkDoc.linkDescription = "";
            linkDoc.linkTags = "Default";

            linkDoc.linkedTo = target;
            linkDoc.linkedFrom = source;

            let linkedFrom = Cast(target.linkedFromDocs, listSpec(Doc));
            if (!linkedFrom) {
                target.linkedFromDocs = linkedFrom = new List<Doc>();
            }
            linkedFrom.push(linkDoc);

            let linkedTo = Cast(source.linkedToDocs, listSpec(Doc));
            if (!linkedTo) {
                source.linkedToDocs = linkedTo = new List<Doc>();
            }
            linkedTo.push(linkDoc);
        }, "make link");
        return linkDoc;
    }

    export function MakeDelegate(doc: Doc): Doc;
    export function MakeDelegate(doc: Opt<Doc>): Opt<Doc>;
    export function MakeDelegate(doc: Opt<Doc>): Opt<Doc> {
        if (!doc) {
            return undefined;
        }
        const delegate = new Doc();
        //TODO Does this need to be doc[Self]?
        delegate.proto = doc;
        return delegate;
    }
    export const Prototype = Symbol("Prototype");
}

export const GetAsync = Doc.GetAsync;