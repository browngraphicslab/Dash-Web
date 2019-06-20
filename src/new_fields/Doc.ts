import { observable, action } from "mobx";
import { serializable, primitive, map, alias, list } from "serializr";
import { autoObject, SerializationHelper, Deserializable } from "../client/util/SerializationHelper";
import { DocServer } from "../client/DocServer";
import { setter, getter, getField, updateFunction, deleteProperty } from "./util";
import { Cast, ToConstructor, PromiseValue, FieldValue, NumCast } from "./Types";
import { listSpec } from "./Schema";
import { ObjectField } from "./ObjectField";
import { RefField, FieldId } from "./RefField";
import { ToScriptString, SelfProxy, Parent, OnUpdate, Self, HandleUpdate, Update, Id } from "./FieldSymbols";

export namespace Field {
    export function toScriptString(field: Field): string {
        if (typeof field === "string") {
            return `"${field}"`;
        } else if (typeof field === "number" || typeof field === "boolean") {
            return String(field);
        } else {
            return field[ToScriptString]();
        }
    }
    export function IsField(field: any): field is Field;
    export function IsField(field: any, includeUndefined: true): field is Field | undefined;
    export function IsField(field: any, includeUndefined: boolean = false): field is Field | undefined {
        return (typeof field === "string")
            || (typeof field === "number")
            || (typeof field === "boolean")
            || (field instanceof ObjectField)
            || (field instanceof RefField)
            || (includeUndefined && field === undefined);
    }
}
export type Field = number | string | boolean | ObjectField | RefField;
export type Opt<T> = T | undefined;
export type FieldWaiting<T extends RefField = RefField> = T extends undefined ? never : Promise<T | undefined>;
export type FieldResult<T extends Field = Field> = Opt<T> | FieldWaiting<Extract<T, RefField>>;

/**
 * Cast any field to either a List of Docs or undefined if the given field isn't a List of Docs.  
 * If a default value is given, that will be returned instead of undefined.  
 * If a default value is given, the returned value should not be modified as it might be a temporary value.  
 * If no default value is given, and the returned value is not undefined, it can be safely modified.  
 */
export function DocListCastAsync(field: FieldResult): Promise<Doc[] | undefined>;
export function DocListCastAsync(field: FieldResult, defaultValue: Doc[]): Promise<Doc[]>;
export function DocListCastAsync(field: FieldResult, defaultValue?: Doc[]) {
    const list = Cast(field, listSpec(Doc));
    return list ? Promise.all(list).then(() => list) : Promise.resolve(defaultValue);
}

export function DocListCast(field: FieldResult): Doc[] {
    return Cast(field, listSpec(Doc), []).filter(d => d instanceof Doc) as Doc[];
}

export const WidthSym = Symbol("Width");
export const HeightSym = Symbol("Height");

@Deserializable("doc").withFields(["id"])
export class Doc extends RefField {
    constructor(id?: FieldId, forceSave?: boolean) {
        super(id);
        const doc = new Proxy<this>(this, {
            set: setter,
            get: getter,
            // getPrototypeOf: (target) => Cast(target[SelfProxy].proto, Doc) || null, // TODO this might be able to replace the proto logic in getter
            has: (target, key) => key in target.__fields,
            ownKeys: target => Object.keys(target.__fields),
            getOwnPropertyDescriptor: (target, prop) => {
                if (prop in target.__fields) {
                    return {
                        configurable: true,//TODO Should configurable be true?
                        enumerable: true,
                        value: target.__fields[prop]
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
    public [WidthSym] = () => NumCast(this[SelfProxy].width);  // bcz: is this the right way to access width/height?   it didn't work with : this.width
    public [HeightSym] = () => NumCast(this[SelfProxy].height);

    [ToScriptString]() {
        return "invalid";
    }

    public [HandleUpdate](diff: any) {
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
        const unset = diff.$unset;
        if (unset) {
            for (const key in unset) {
                if (!key.startsWith("fields.")) {
                    continue;
                }
                const fKey = key.substring(7);
                delete this[fKey];
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
    export function GetT<T extends Field>(doc: Doc, key: string, ctor: ToConstructor<T>, ignoreProto: boolean = false): FieldResult<T> {
        return Cast(Get(doc, key, ignoreProto), ctor) as FieldResult<T>;
    }
    export function IsPrototype(doc: Doc) {
        return GetT(doc, "isPrototype", "boolean", true);
    }
    export async function SetOnPrototype(doc: Doc, key: string, value: Field) {
        const proto = Object.getOwnPropertyNames(doc).indexOf("isPrototype") === -1 ? doc.proto : doc;

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
                // Do we want to filter out undefineds?
                // if (value !== undefined) {
                doc[key] = value;
                // }
            }
        }
        return doc;
    }

    // compare whether documents or their protos match
    export function AreProtosEqual(doc?: Doc, other?: Doc) {
        if (!doc || !other) return false;
        let r = (doc === other);
        let r2 = (doc.proto === other);
        let r3 = (other.proto === doc);
        let r4 = (doc.proto === other.proto);
        return r || r2 || r3 || r4;
    }

    // gets the document's prototype or returns the document if it is a prototype
    export function GetProto(doc: Doc) {
        return Doc.GetT(doc, "isPrototype", "boolean", true) ? doc : doc.proto!;
    }

    export function allKeys(doc: Doc): string[] {
        const results: Set<string> = new Set;

        let proto: Doc | undefined = doc;
        while (proto) {
            Object.keys(proto).forEach(key => results.add(key));
            proto = proto.proto;
        }

        return Array.from(results);
    }

    export function AddDocToList(target: Doc, key: string, doc: Doc, relativeTo?: Doc, before?: boolean) {
        let list = Cast(target[key], listSpec(Doc));
        if (list) {
            let ind = relativeTo ? list.indexOf(relativeTo) : -1;
            if (ind === -1) list.push(doc);
            else list.splice(before ? ind : ind + 1, 0, doc);
        }
        return true;
    }

    export function MakeAlias(doc: Doc) {
        if (!GetT(doc, "isPrototype", "boolean", true)) {
            return Doc.MakeCopy(doc);
        }
        return new Doc;
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

    export function MakeDelegate(doc: Doc, id?: string): Doc;
    export function MakeDelegate(doc: Opt<Doc>, id?: string): Opt<Doc>;
    export function MakeDelegate(doc: Opt<Doc>, id?: string): Opt<Doc> {
        if (!doc) {
            return undefined;
        }
        const delegate = new Doc(id, true);
        delegate.proto = doc;
        return delegate;
    }
}