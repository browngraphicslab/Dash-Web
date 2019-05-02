import { observable, action } from "mobx";
import { serializable, primitive, map, alias, list } from "serializr";
import { autoObject, SerializationHelper, Deserializable } from "../client/util/SerializationHelper";
import { DocServer } from "../client/DocServer";
import { setter, getter, getField, updateFunction, deleteProperty } from "./util";
import { Cast, ToConstructor, PromiseValue, FieldValue, NumCast } from "./Types";
import { UndoManager, undoBatch } from "../client/util/UndoManager";
import { listSpec } from "./Schema";
import { List } from "./List";
import { ObjectField, Parent, OnUpdate } from "./ObjectField";
import { RefField, FieldId, Id, HandleUpdate } from "./RefField";
import { Docs } from "../client/documents/Documents";
// import { Docs } from "../client/documents/Documents";

export function IsField(field: any): field is Field {
    return (typeof field === "string")
        || (typeof field === "number")
        || (typeof field === "boolean")
        || (field instanceof ObjectField)
        || (field instanceof RefField);
}
export type Field = number | string | boolean | ObjectField | RefField;
export type Opt<T> = T | undefined;
export type FieldWaiting<T extends RefField = RefField> = T extends undefined ? never : Promise<T | undefined>;
export type FieldResult<T extends Field = Field> = Opt<T> | FieldWaiting<Extract<T, RefField>>;

export const Update = Symbol("Update");
export const Self = Symbol("Self");
const SelfProxy = Symbol("SelfProxy");
export const WidthSym = Symbol("Width");
export const HeightSym = Symbol("Height");

@Deserializable("doc").withFields(["id"])
export class Doc extends RefField {
    constructor(id?: FieldId, forceSave?: boolean) {
        super(id);
        const doc = new Proxy<this>(this, {
            set: setter,
            get: getter,
            ownKeys: target => Object.keys(target.__fields),
            getOwnPropertyDescriptor: (target, prop) => {
                if (prop in target.__fields) {
                    return {
                        configurable: true,//TODO Should configurable be true?
                        enumerable: true,
                    };
                }
                return Reflect.getOwnPropertyDescriptor(target, prop);
            },
            deleteProperty: deleteProperty,
            defineProperty: () => { throw new Error("Currently properties can't be defined on documents using Object.defineProperty"); },
        });
        this[SelfProxy] = doc;
        if (!id || forceSave) {
            DocServer.CreateField(doc);
        }
        return doc;
    }

    proto: Opt<Doc>;
    [key: string]: FieldResult;

    @serializable(alias("fields", map(autoObject())))
    private get __fields() {
        return this.___fields;
    }

    private set __fields(value) {
        this.___fields = value;
        for (const key in value) {
            const field = value[key];
            if (!(field instanceof ObjectField)) continue;
            field[Parent] = this[Self];
            field[OnUpdate] = updateFunction(this[Self], key, field, this[SelfProxy]);
        }
    }

    @observable
    //{ [key: string]: Field | FieldWaiting | undefined }
    private ___fields: any = {};

    private [Update] = (diff: any) => {
        DocServer.UpdateField(this[Id], diff);
    }

    private [Self] = this;
    private [SelfProxy]: any;
    public [WidthSym] = () => NumCast(this.__fields.width);  // bcz: is this the right way to access width/height?   it didn't work with : this.width
    public [HeightSym] = () => NumCast(this.__fields.height);

    public [HandleUpdate](diff: any) {
        console.log(diff);
        const set = diff.$set;
        if (set) {
            for (const key in set) {
                if (!key.startsWith("fields.")) {
                    continue;
                }
                const value = SerializationHelper.Deserialize(set[key]);
                const fKey = key.substring(7);
                this[fKey] = value;
            }
        }
    }
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

    export function MakeCopy(doc: Doc, copyProto: boolean = false): Doc {
        const copy = new Doc;
        Object.keys(doc).forEach(key => {
            const field = doc[key];
            if (key === "proto" && copyProto) {
                if (field instanceof Doc) {
                    copy[key] = Doc.MakeCopy(field);
                }
            } else {
                if (field instanceof RefField) {
                    copy[key] = field;
                } else if (field instanceof ObjectField) {
                    copy[key] = ObjectField.MakeCopy(field);
                } else {
                    copy[key] = field;
                }
            }
        });
        return copy;
    }

    export function MakeLink(source: Doc, target: Doc) {
        UndoManager.RunInBatch(() => {
            let linkDoc = Docs.TextDocument({ width: 100, height: 30, borderRounding: -1 });
            //let linkDoc = new Doc;
            linkDoc.title = "-link name-";
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
            return linkDoc;
        }, "make link");
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