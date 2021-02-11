import { saveAs } from "file-saver";
import { action, computed, observable, ObservableMap, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import { alias, map, serializable } from "serializr";
import { DocServer } from "../client/DocServer";
import { DocumentType } from "../client/documents/DocumentTypes";
import { LinkManager } from "../client/util/LinkManager";
import { Scripting, scriptingGlobal } from "../client/util/Scripting";
import { SelectionManager } from "../client/util/SelectionManager";
import { afterDocDeserialize, autoObject, Deserializable, SerializationHelper } from "../client/util/SerializationHelper";
import { UndoManager } from "../client/util/UndoManager";
import { CollectionDockingView } from "../client/views/collections/CollectionDockingView";
import { intersectRect, Utils } from "../Utils";
import { DateField } from "./DateField";
import { Copy, HandleUpdate, Id, OnUpdate, Parent, Self, SelfProxy, ToScriptString, ToString, Update } from "./FieldSymbols";
import { InkTool } from "./InkField";
import { List } from "./List";
import { ObjectField } from "./ObjectField";
import { PrefetchProxy, ProxyField } from "./Proxy";
import { FieldId, RefField } from "./RefField";
import { RichTextField } from "./RichTextField";
import { listSpec } from "./Schema";
import { ComputedField, ScriptField } from "./ScriptField";
import { Cast, FieldValue, NumCast, StrCast, ToConstructor } from "./Types";
import { AudioField, ImageField, PdfField, VideoField, WebField } from "./URLField";
import { deleteProperty, GetEffectiveAcl, getField, getter, makeEditable, makeReadOnly, normalizeEmail, setter, SharingPermissions, updateFunction } from "./util";
import JSZip = require("jszip");

export namespace Field {
    export function toKeyValueString(doc: Doc, key: string): string {
        const onDelegate = Object.keys(doc).includes(key);
        const field = ComputedField.WithoutComputed(() => FieldValue(doc[key]));
        return !Field.IsField(field) ? "" : (onDelegate ? "=" : "") + (field instanceof ComputedField ? `:=${field.script.originalScript}` : Field.toScriptString(field));
    }
    export function toScriptString(field: Field): string {
        if (typeof field === "string") return `"${field}"`;
        if (typeof field === "number" || typeof field === "boolean") return String(field);
        if (field === undefined || field === null) return "null";
        return field[ToScriptString]();
    }
    export function toString(field: Field): string {
        if (typeof field === "string") return field;
        if (typeof field === "number" || typeof field === "boolean") return String(field);
        if (field instanceof ObjectField) return field[ToString]();
        if (field instanceof RefField) return field[ToString]();
        return "";
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

export async function DocCastAsync(field: FieldResult): Promise<Opt<Doc>> { return Cast(field, Doc); }

export function StrListCast(field: FieldResult) { return Cast(field, listSpec("string"), []); }
export function DocListCast(field: FieldResult) { return Cast(field, listSpec(Doc), []).filter(d => d instanceof Doc) as Doc[]; }
export function DocListCastOrNull(field: FieldResult) { return Cast(field, listSpec(Doc), null)?.filter(d => d instanceof Doc) as Doc[] | undefined; }

export const WidthSym = Symbol("Width");
export const HeightSym = Symbol("Height");
export const DataSym = Symbol("Data");
export const LayoutSym = Symbol("Layout");
export const FieldsSym = Symbol("Fields");
export const AclSym = Symbol("Acl");
export const AclUnset = Symbol("AclUnset");
export const AclPrivate = Symbol("AclOwnerOnly");
export const AclReadonly = Symbol("AclReadOnly");
export const AclAddonly = Symbol("AclAddonly");
export const AclEdit = Symbol("AclEdit");
export const AclAdmin = Symbol("AclAdmin");
export const UpdatingFromServer = Symbol("UpdatingFromServer");
export const ForceServerWrite = Symbol("ForceServerWrite");
export const CachedUpdates = Symbol("Cached updates");

const AclMap = new Map<string, symbol>([
    ["None", AclUnset],
    [SharingPermissions.None, AclPrivate],
    [SharingPermissions.View, AclReadonly],
    [SharingPermissions.Add, AclAddonly],
    [SharingPermissions.Edit, AclEdit],
    [SharingPermissions.Admin, AclAdmin]
]);

// caches the document access permissions for the current user.
// this recursively updates all protos as well.
export function updateCachedAcls(doc: Doc) {
    if (!doc) return;
    const permissions: { [key: string]: symbol } = {};

    doc[UpdatingFromServer] = true;
    Object.keys(doc).filter(key => key.startsWith("acl") && (permissions[key] = AclMap.get(StrCast(doc[key]))!));
    doc[UpdatingFromServer] = false;

    if (Object.keys(permissions).length) {
        doc[AclSym] = permissions;
    }

    if (doc.proto instanceof Promise) {
        doc.proto.then(updateCachedAcls);
        return doc.proto;
    }
}

@scriptingGlobal
@Deserializable("Doc", updateCachedAcls).withFields(["id"])
export class Doc extends RefField {
    constructor(id?: FieldId, forceSave?: boolean) {
        super(id);
        const doc = new Proxy<this>(this, {
            set: setter,
            get: getter,
            // getPrototypeOf: (target) => Cast(target[SelfProxy].proto, Doc) || null, // TODO this might be able to replace the proto logic in getter
            has: (target, key) => GetEffectiveAcl(target) !== AclPrivate && key in target.__fields,
            ownKeys: target => {
                const obj = {} as any;
                if (GetEffectiveAcl(target) !== AclPrivate) Object.assign(obj, target.___fieldKeys);
                runInAction(() => obj.__LAYOUT__ = target.__LAYOUT__);
                return Object.keys(obj);
            },
            getOwnPropertyDescriptor: (target, prop) => {
                if (prop.toString() === "__LAYOUT__") {
                    return Reflect.getOwnPropertyDescriptor(target, prop);
                }
                if (prop in target.__fieldKeys) {
                    return {
                        configurable: true,//TODO Should configurable be true?
                        enumerable: true,
                        value: 0//() => target.__fields[prop])
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

    @serializable(alias("fields", map(autoObject(), { afterDeserialize: afterDocDeserialize })))
    private get __fields() { return this.___fields; }
    private set __fields(value) {
        this.___fields = value;
        for (const key in value) {
            const field = value[key];
            (field !== undefined) && (this.__fieldKeys[key] = true);
            if (!(field instanceof ObjectField)) continue;
            field[Parent] = this[Self];
            field[OnUpdate] = updateFunction(this[Self], key, field, this[SelfProxy]);
        }
    }
    private get __fieldKeys() { return this.___fieldKeys; }
    private set __fieldKeys(value) { this.___fieldKeys = value; }

    @observable private ___fields: any = {};
    @observable private ___fieldKeys: any = {};
    @observable public [AclSym]: { [key: string]: symbol };

    private [UpdatingFromServer]: boolean = false;
    private [ForceServerWrite]: boolean = false;

    private [Update] = (diff: any) => {
        (!this[UpdatingFromServer] || this[ForceServerWrite]) && DocServer.UpdateField(this[Id], diff);
    }

    private [Self] = this;
    private [SelfProxy]: any;
    public [FieldsSym](clear?: boolean) {
        const self = this[SelfProxy];
        runInAction(() => clear && Array.from(Object.keys(self)).forEach(key => delete self[key]));
        return this.___fields;
    }
    public [WidthSym] = () => NumCast(this[SelfProxy]._width);
    public [HeightSym] = () => NumCast(this[SelfProxy]._height);
    public [ToScriptString] = () => `DOC-"${this[Self][Id]}"-`;
    public [ToString] = () => `Doc(${GetEffectiveAcl(this[SelfProxy]) === AclPrivate ? "-inaccessible-" : this[SelfProxy].title})`;
    public get [LayoutSym]() { return this[SelfProxy].__LAYOUT__; }
    public get [DataSym]() {
        const self = this[SelfProxy];
        return self.resolvedDataDoc && !self.isTemplateForField ? self :
            Doc.GetProto(Cast(Doc.Layout(self).resolvedDataDoc, Doc, null) || self);
    }
    @computed get __LAYOUT__() {
        const templateLayoutDoc = Cast(Doc.LayoutField(this[SelfProxy]), Doc, null);
        if (templateLayoutDoc) {
            let renderFieldKey: any;
            const layoutField = templateLayoutDoc[StrCast(templateLayoutDoc.layoutKey, "layout")];
            if (typeof layoutField === "string") {
                renderFieldKey = layoutField.split("fieldKey={'")[1].split("'")[0];//layoutField.split("'")[1];
            } else {
                return Cast(layoutField, Doc, null);
            }
            return Cast(this[SelfProxy][renderFieldKey + "-layout[" + templateLayoutDoc[Id] + "]"], Doc, null) || templateLayoutDoc;
        }
        return undefined;

    }

    private [CachedUpdates]: { [key: string]: () => void | Promise<any> } = {};
    public static CurrentUserEmail: string = "";
    public static get CurrentUserEmailNormalized() { return normalizeEmail(Doc.CurrentUserEmail); }
    public async [HandleUpdate](diff: any) {
        const set = diff.$set;
        const sameAuthor = this.author === Doc.CurrentUserEmail;
        if (set) {
            for (const key in set) {
                if (!key.startsWith("fields.")) {
                    continue;
                }
                const fKey = key.substring(7);
                const fn = async () => {
                    const value = await SerializationHelper.Deserialize(set[key]);
                    const prev = GetEffectiveAcl(this);
                    this[UpdatingFromServer] = true;
                    this[fKey] = value;
                    this[UpdatingFromServer] = false;
                    if (fKey.startsWith("acl")) {
                        updateCachedAcls(this);
                    }
                    if (prev === AclPrivate && GetEffectiveAcl(this) !== AclPrivate) {
                        DocServer.GetRefField(this[Id], true);
                    }
                    // if (prev !== AclPrivate && GetEffectiveAcl(this) === AclPrivate) {
                    //     this[FieldsSym](true);
                    // }
                };
                if (sameAuthor || fKey.startsWith("acl") || DocServer.getFieldWriteMode(fKey) !== DocServer.WriteMode.Playground) {
                    delete this[CachedUpdates][fKey];
                    await fn();
                } else {
                    this[CachedUpdates][fKey] = fn;
                }
            }
        }
        const unset = diff.$unset;
        if (unset) {
            for (const key in unset) {
                if (!key.startsWith("fields.")) {
                    continue;
                }
                const fKey = key.substring(7);
                const fn = () => {
                    this[UpdatingFromServer] = true;
                    delete this[fKey];
                    this[UpdatingFromServer] = false;
                };
                if (sameAuthor || DocServer.getFieldWriteMode(fKey) !== DocServer.WriteMode.Playground) {
                    delete this[CachedUpdates][fKey];
                    await fn();
                } else {
                    this[CachedUpdates][fKey] = fn;
                }
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

    export function RunCachedUpdate(doc: Doc, field: string) {
        const update = doc[CachedUpdates][field];
        if (update) {
            update();
            delete doc[CachedUpdates][field];
        }
    }
    export function AddCachedUpdate(doc: Doc, field: string, oldValue: any) {
        const val = oldValue;
        doc[CachedUpdates][field] = () => {
            doc[UpdatingFromServer] = true;
            doc[field] = val;
            doc[UpdatingFromServer] = false;
        };
    }
    export function MakeReadOnly(): { end(): void } {
        makeReadOnly();
        return {
            end() {
                makeEditable();
            }
        };
    }

    export function Get(doc: Doc, key: string, ignoreProto: boolean = false): FieldResult {
        try {
            return getField(doc[Self], key, ignoreProto);
        } catch {
            return doc;
        }
    }
    export function GetT<T extends Field>(doc: Doc, key: string, ctor: ToConstructor<T>, ignoreProto: boolean = false): FieldResult<T> {
        return Cast(Get(doc, key, ignoreProto), ctor) as FieldResult<T>;
    }
    export function IsPrototype(doc: Doc) {
        return GetT(doc, "isPrototype", "boolean", true);
    }
    export function IsBaseProto(doc: Doc) {
        return GetT(doc, "baseProto", "boolean", true);
    }
    export function IsSystem(doc: Doc) {
        return GetT(doc, "system", "boolean", true);
    }
    export async function SetInPlace(doc: Doc, key: string, value: Field | undefined, defaultProto: boolean) {
        const hasProto = doc.proto instanceof Doc;
        const onDeleg = Object.getOwnPropertyNames(doc).indexOf(key) !== -1;
        const onProto = hasProto && Object.getOwnPropertyNames(doc.proto).indexOf(key) !== -1;
        if (onDeleg || !hasProto || (!onProto && !defaultProto)) {
            doc[key] = value;
        } else doc.proto![key] = value;
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

    /**
     * This function is intended to model Object.assign({}, {}) [https://mzl.la/1Mo3l21], which copies
     * the values of the properties of a source object into the target.
     * 
     * This is just a specific, Dash-authored version that serves the same role for our
     * Doc class.
     * 
     * @param doc the target document into which you'd like to insert the new fields 
     * @param fields the fields to project onto the target. Its type signature defines a mapping from some string key
     * to a potentially undefined field, where each entry in this mapping is optional. 
     */
    export function assign<K extends string>(doc: Doc, fields: Partial<Record<K, Opt<Field>>>, skipUndefineds: boolean = false) {
        for (const key in fields) {
            if (fields.hasOwnProperty(key)) {
                const value = fields[key];
                if (!skipUndefineds || value !== undefined) { // Do we want to filter out undefineds?
                    doc[key] = value;
                }
            }
        }
        return doc;
    }

    // compare whether documents or their protos match
    export function AreProtosEqual(doc?: Doc, other?: Doc) {
        if (!doc || !other) return false;
        const r = (doc === other);
        const r2 = (Doc.GetProto(doc) === other);
        const r3 = (Doc.GetProto(other) === doc);
        const r4 = (Doc.GetProto(doc) === Doc.GetProto(other) && Doc.GetProto(other) !== undefined);
        return r || r2 || r3 || r4;
    }

    // Gets the data document for the document.  Note: this is mis-named -- it does not specifically
    // return the doc's proto, but rather recursively searches through the proto inheritance chain 
    // and returns the document who's proto is undefined or whose proto is marked as a base prototype ('isPrototype').
    export function GetProto(doc: Doc): Doc {
        if (doc instanceof Promise) {
            // console.log("GetProto: warning: got Promise insead of Doc");
        }
        const proto = doc && (Doc.GetT(doc, "isPrototype", "boolean", true) ? doc : (doc.proto || doc));
        return proto === doc ? proto : Doc.GetProto(proto);
    }
    export function GetDataDoc(doc: Doc): Doc {
        const proto = Doc.GetProto(doc);
        return proto === doc ? proto : Doc.GetDataDoc(proto);
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

    export function IndexOf(toFind: Doc, list: Doc[], allowProtos: boolean = true) {
        let index = list.reduce((p, v, i) => (v instanceof Doc && v === toFind) ? i : p, -1);
        index = allowProtos && index !== -1 ? index : list.reduce((p, v, i) => (v instanceof Doc && Doc.AreProtosEqual(v, toFind)) ? i : p, -1);
        return index; // list.findIndex(doc => doc === toFind || Doc.AreProtosEqual(doc, toFind));
    }
    export function RemoveDocFromList(listDoc: Doc, fieldKey: string | undefined, doc: Doc) {
        const key = fieldKey ? fieldKey : Doc.LayoutFieldKey(listDoc);
        if (listDoc[key] === undefined) {
            Doc.GetProto(listDoc)[key] = new List<Doc>();
        }
        const list = Cast(listDoc[key], listSpec(Doc));
        if (list) {
            const ind = list.indexOf(doc);
            if (ind !== -1) {
                list.splice(ind, 1);
                return true;
            }
        }
        return false;
    }
    export function AddDocToList(listDoc: Doc, fieldKey: string | undefined, doc: Doc, relativeTo?: Doc, before?: boolean, first?: boolean, allowDuplicates?: boolean, reversed?: boolean) {
        const key = fieldKey ? fieldKey : Doc.LayoutFieldKey(listDoc);
        if (listDoc[key] === undefined) {
            Doc.GetProto(listDoc)[key] = new List<Doc>();
        }
        const list = Cast(listDoc[key], listSpec(Doc));
        if (list) {
            if (allowDuplicates !== true) {
                const pind = list.reduce((l, d, i) => d instanceof Doc && d[Id] === doc[Id] ? i : l, -1);
                if (pind !== -1) {
                    return true;
                    //list.splice(pind, 1);  // bcz: this causes schemaView docs in the Catalog to move to the bottom of the schema view when they are dragged even though they haven't left the collection
                }
            }
            if (first) {
                list.splice(0, 0, doc);
            }
            else {
                const ind = relativeTo ? list.indexOf(relativeTo) : -1;
                if (ind === -1) {
                    if (reversed) list.splice(0, 0, doc);
                    else list.push(doc);
                }
                else {
                    if (reversed) list.splice(before ? (list.length - ind) + 1 : list.length - ind, 0, doc);
                    else list.splice(before ? ind : ind + 1, 0, doc);
                }
            }
            return true;
        }
        return false;
    }

    //
    // Computes the bounds of the contents of a set of documents.
    //
    export function ComputeContentBounds(docList: Doc[]) {
        const bounds = docList.reduce((bounds, doc) => {
            const [sptX, sptY] = [NumCast(doc.x), NumCast(doc.y)];
            const [bptX, bptY] = [sptX + doc[WidthSym](), sptY + doc[HeightSym]()];
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            };
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: -Number.MAX_VALUE, b: -Number.MAX_VALUE });
        return bounds;
    }

    export function MakeAlias(doc: Doc, id?: string) {
        const alias = !GetT(doc, "isPrototype", "boolean", true) && doc.proto ? Doc.MakeCopy(doc, undefined, id) : Doc.MakeDelegate(doc, id);
        const layout = Doc.LayoutField(alias);
        if (layout instanceof Doc && layout !== alias && layout === Doc.Layout(alias)) {
            Doc.SetLayout(alias, Doc.MakeAlias(layout));
        }
        alias.aliasOf = doc;
        if (doc !== Doc.GetProto(doc)) {
            alias.title = ComputedField.MakeFunction(`renameAlias(this, ${Doc.GetProto(doc).aliasNumber = NumCast(Doc.GetProto(doc).aliasNumber) + 1})`);
        }
        alias.author = Doc.CurrentUserEmail;

        Doc.AddDocToList(doc[DataSym], "aliases", alias);

        return alias;
    }

    export async function makeClone(doc: Doc, cloneMap: Map<string, Doc>, rtfs: { copy: Doc, key: string, field: RichTextField }[], exclusions: string[], dontCreate: boolean): Promise<Doc> {
        if (Doc.IsBaseProto(doc)) return doc;
        if (cloneMap.get(doc[Id])) return cloneMap.get(doc[Id])!;
        const copy = dontCreate ? doc : new Doc(undefined, true);
        cloneMap.set(doc[Id], copy);
        if (LinkManager.Instance.getAllLinks().includes(doc) && LinkManager.Instance.getAllLinks().indexOf(copy) === -1) LinkManager.Instance.addLink(copy);
        const filter = Cast(doc.cloneFieldFilter, listSpec("string"), exclusions);
        await Promise.all(Object.keys(doc).map(async key => {
            if (filter.includes(key)) return;
            const assignKey = (val: any) => !dontCreate && (copy[key] = val);
            const cfield = ComputedField.WithoutComputed(() => FieldValue(doc[key]));
            const field = ProxyField.WithoutProxy(() => doc[key]);
            const copyObjectField = async (field: ObjectField) => {
                const list = Cast(doc[key], listSpec(Doc));
                const docs = list && (await DocListCastAsync(list))?.filter(d => d instanceof Doc);
                if (docs !== undefined && docs.length) {
                    const clones = await Promise.all(docs.map(async d => Doc.makeClone(d, cloneMap, rtfs, exclusions, dontCreate)));
                    !dontCreate && assignKey(new List<Doc>(clones));
                } else if (doc[key] instanceof Doc) {
                    assignKey(key.includes("layout[") ? undefined : key.startsWith("layout") ? doc[key] as Doc : await Doc.makeClone(doc[key] as Doc, cloneMap, rtfs, exclusions, dontCreate)); // reference documents except copy documents that are expanded teplate fields 
                } else {
                    assignKey(ObjectField.MakeCopy(field));
                    if (field instanceof RichTextField) {
                        if (field.Data.includes('"docid":') || field.Data.includes('"targetId":') || field.Data.includes('"linkId":')) {
                            rtfs.push({ copy, key, field });
                        }
                    }
                }
            };
            if (key === "proto") {
                if (doc[key] instanceof Doc) {
                    assignKey(await Doc.makeClone(doc[key]!, cloneMap, rtfs, exclusions, dontCreate));
                }
            } else {
                if (field instanceof RefField) {
                    assignKey(field);
                } else if (cfield instanceof ComputedField) {
                    !dontCreate && assignKey(ComputedField.MakeFunction(cfield.script.originalScript));
                    (key === "links" && field instanceof ObjectField) && await copyObjectField(field);
                } else if (field instanceof ObjectField) {
                    await copyObjectField(field);
                } else if (field instanceof Promise) {
                    debugger; //This shouldn't happend...
                } else {
                    assignKey(field);
                }
            }
        }));
        if (!dontCreate) {
            Doc.SetInPlace(copy, "title", "CLONE: " + doc.title, true);
            copy.cloneOf = doc;
            cloneMap.set(doc[Id], copy);
        }
        return copy;
    }
    export async function MakeClone(doc: Doc, dontCreate: boolean = false) {
        const cloneMap = new Map<string, Doc>();
        const rtfMap: { copy: Doc, key: string, field: RichTextField }[] = [];
        const copy = await Doc.makeClone(doc, cloneMap, rtfMap, ["context", "annotationOn", "cloneOf"], dontCreate);
        rtfMap.map(({ copy, key, field }) => {
            const replacer = (match: any, attr: string, id: string, offset: any, string: any) => {
                const mapped = cloneMap.get(id);
                return attr + "\"" + (mapped ? mapped[Id] : id) + "\"";
            };
            const replacer2 = (match: any, href: string, id: string, offset: any, string: any) => {
                const mapped = cloneMap.get(id);
                return href + (mapped ? mapped[Id] : id);
            };
            const regex = `(${Utils.prepend("/doc/")})([^"]*)`;
            const re = new RegExp(regex, "g");
            copy[key] = new RichTextField(field.Data.replace(/("docid":|"targetId":|"linkId":)"([^"]+)"/g, replacer).replace(re, replacer2), field.Text);
        });
        return { clone: copy, map: cloneMap };
    }

    export async function Zip(doc: Doc) {
        // const a = document.createElement("a");
        // const url = Utils.prepend(`/downloadId/${this.props.Document[Id]}`);
        // a.href = url;
        // a.download = `DocExport-${this.props.Document[Id]}.zip`;
        // a.click();
        const { clone, map } = await Doc.MakeClone(doc, true);
        function replacer(key: any, value: any) {
            if (["cloneOf", "context", "cursors"].includes(key)) return undefined;
            else if (value instanceof Doc) {
                if (key !== "field" && Number.isNaN(Number(key))) {
                    const __fields = value[FieldsSym]();
                    return { id: value[Id], __type: "Doc", fields: __fields };
                } else {
                    return { fieldId: value[Id], __type: "proxy" };
                }
            }
            else if (value instanceof ScriptField) return { script: value.script, __type: "script" };
            else if (value instanceof RichTextField) return { Data: value.Data, Text: value.Text, __type: "RichTextField" };
            else if (value instanceof ImageField) return { url: value.url.href, __type: "image" };
            else if (value instanceof PdfField) return { url: value.url.href, __type: "pdf" };
            else if (value instanceof AudioField) return { url: value.url.href, __type: "audio" };
            else if (value instanceof VideoField) return { url: value.url.href, __type: "video" };
            else if (value instanceof WebField) return { url: value.url.href, __type: "web" };
            else if (value instanceof DateField) return { date: value.toString(), __type: "date" };
            else if (value instanceof ProxyField) return { fieldId: value.fieldId, __type: "proxy" };
            else if (value instanceof Array && key !== "fields") return { fields: value, __type: "list" };
            else if (value instanceof ComputedField) return { script: value.script, __type: "computed" };
            else return value;
        }

        const docs: { [id: string]: any } = {};
        Array.from(map.entries()).forEach(f => docs[f[0]] = f[1]);
        const docString = JSON.stringify({ id: doc[Id], docs }, replacer);

        const zip = new JSZip();

        zip.file(doc.title + ".json", docString);

        // // Generate a directory within the Zip file structure
        // var img = zip.folder("images");

        // // Add a file to the directory, in this case an image with data URI as contents
        // img.file("smile.gif", imgData, {base64: true});

        // Generate the zip file asynchronously
        zip.generateAsync({ type: "blob" })
            .then((content: any) => {
                // Force down of the Zip file
                saveAs(content, doc.title + ".zip"); // glr: Possibly change the name of the document to match the title?
            });
    }
    //
    // Determines whether the layout needs to be expanded (as a template).
    // template expansion is rquired when the layout is a template doc/field and there's a datadoc which isn't equal to the layout template
    //
    export function WillExpandTemplateLayout(layoutDoc: Doc, dataDoc?: Doc) {
        return (layoutDoc.isTemplateForField || layoutDoc.isTemplateDoc) && dataDoc && layoutDoc !== dataDoc;
    }

    const _pendingMap: Map<string, boolean> = new Map();
    //
    // Returns an expanded template layout for a target data document if there is a template relationship
    // between the two. If so, the layoutDoc is expanded into a new document that inherits the properties 
    // of the original layout while allowing for individual layout properties to be overridden in the expanded layout.
    // templateArgs should be equivalent to the layout key that generates the template since that's where the template parameters are stored in ()'s at the end of the key.
    // NOTE:  the template will have references to "@params" -- the template arguments will be assigned to the '@params' field
    // so that when the @params key is accessed, it will be rewritten as the key that is stored in the 'params' field and
    // the derefence will then occur on the rootDocument (the original document).
    // in the future, field references could be written as @<someparam> and then arguments would be passed in the layout key as:
    //   layout_mytemplate(somparam=somearg).   
    // then any references to @someparam would be rewritten as accesses to 'somearg' on the rootDocument
    export function expandTemplateLayout(templateLayoutDoc: Doc, targetDoc?: Doc, templateArgs?: string) {
        const args = templateArgs?.match(/\(([a-zA-Z0-9._\-]*)\)/)?.[1].replace("()", "") || StrCast(templateLayoutDoc.PARAMS);
        if (!args && !WillExpandTemplateLayout(templateLayoutDoc, targetDoc) || !targetDoc) return templateLayoutDoc;

        const templateField = StrCast(templateLayoutDoc.isTemplateForField);  // the field that the template renders
        // First it checks if an expanded layout already exists -- if so it will be stored on the dataDoc
        // using the template layout doc's id as the field key.
        // If it doesn't find the expanded layout, then it makes a delegate of the template layout and
        // saves it on the data doc indexed by the template layout's id.
        //
        const params = args.split("=").length > 1 ? args.split("=")[0] : "PARAMS";
        const layoutFielddKey = Doc.LayoutFieldKey(templateLayoutDoc);
        const expandedLayoutFieldKey = (templateField || layoutFielddKey) + "-layout[" + templateLayoutDoc[Id] + (args ? `(${args})` : "") + "]";
        let expandedTemplateLayout = targetDoc?.[expandedLayoutFieldKey];

        if (templateLayoutDoc.resolvedDataDoc instanceof Promise) {
            expandedTemplateLayout = undefined;
            _pendingMap.set(targetDoc[Id] + expandedLayoutFieldKey, true);
        }
        else if (expandedTemplateLayout === undefined && !_pendingMap.get(targetDoc[Id] + expandedLayoutFieldKey + args)) {
            if (templateLayoutDoc.resolvedDataDoc === (targetDoc.rootDocument || Doc.GetProto(targetDoc)) && templateLayoutDoc.PARAMS === StrCast(targetDoc.PARAMS)) {
                expandedTemplateLayout = templateLayoutDoc; // reuse an existing template layout if its for the same document with the same params
            } else {
                templateLayoutDoc.resolvedDataDoc && (templateLayoutDoc = Cast(templateLayoutDoc.proto, Doc, null) || templateLayoutDoc); // if the template has already been applied (ie, a nested template), then use the template's prototype
                if (!targetDoc[expandedLayoutFieldKey]) {
                    _pendingMap.set(targetDoc[Id] + expandedLayoutFieldKey + args, true);
                    setTimeout(action(() => {
                        const newLayoutDoc = Doc.MakeDelegate(templateLayoutDoc, undefined, "[" + templateLayoutDoc.title + "]");
                        // the template's arguments are stored in params which is derefenced to find
                        // the actual field key where the parameterized template data is stored.
                        newLayoutDoc[params] = args !== "..." ? args : ""; // ... signifies the layout has sub template(s) -- so we have to expand the layout for them so that they can get the correct 'rootDocument' field, but we don't need to reassign their params.  it would be better if the 'rootDocument' field could be passed dynamically to avoid have to create instances
                        newLayoutDoc.rootDocument = targetDoc;
                        const dataDoc = Doc.GetProto(targetDoc);
                        newLayoutDoc.resolvedDataDoc = dataDoc;
                        if (dataDoc[templateField] === undefined && templateLayoutDoc[templateField] instanceof List && (templateLayoutDoc[templateField] as any).length) {
                            dataDoc[templateField] = ComputedField.MakeFunction(`ObjectField.MakeCopy(templateLayoutDoc["${templateField}"] as List)`, { templateLayoutDoc: Doc.name }, { templateLayoutDoc });
                        }
                        targetDoc[expandedLayoutFieldKey] = newLayoutDoc;

                        _pendingMap.delete(targetDoc[Id] + expandedLayoutFieldKey + args);
                    }));
                }
            }
        }
        return expandedTemplateLayout instanceof Doc ? expandedTemplateLayout : undefined; // layout is undefined if the expandedTemplateLayout is pending.
    }

    // if the childDoc is a template for a field, then this will return the expanded layout with its data doc.
    // otherwise, it just returns the childDoc
    export function GetLayoutDataDocPair(containerDoc: Doc, containerDataDoc: Opt<Doc>, childDoc: Doc) {
        if (!childDoc || childDoc instanceof Promise || !Doc.GetProto(childDoc)) {
            console.log("No, no, no!");
            return { layout: childDoc, data: childDoc };
        }
        const resolvedDataDoc = (Doc.AreProtosEqual(containerDataDoc, containerDoc) || (!childDoc.isTemplateDoc && !childDoc.isTemplateForField && !childDoc.PARAMS) ? undefined : containerDataDoc);
        return { layout: Doc.expandTemplateLayout(childDoc, resolvedDataDoc, "(" + StrCast(containerDoc.PARAMS) + ")"), data: resolvedDataDoc };
    }

    export function Overwrite(doc: Doc, overwrite: Doc, copyProto: boolean = false): Doc {
        Object.keys(doc).forEach(key => {
            const field = ProxyField.WithoutProxy(() => doc[key]);
            if (key === "proto" && copyProto) {
                if (doc.proto instanceof Doc && overwrite.proto instanceof Doc) {
                    overwrite[key] = Doc.Overwrite(doc[key]!, overwrite.proto);
                }
            } else {
                if (field instanceof RefField) {
                    overwrite[key] = field;
                } else if (field instanceof ObjectField) {
                    overwrite[key] = ObjectField.MakeCopy(field);
                } else if (field instanceof Promise) {
                    debugger; //This shouldn't happend...
                } else {
                    overwrite[key] = field;
                }
            }
        });

        return overwrite;
    }

    export function MakeCopy(doc: Doc, copyProto: boolean = false, copyProtoId?: string): Doc {
        const copy = new Doc(copyProtoId, true);
        const exclude = Cast(doc.cloneFieldFilter, listSpec("string"), []);
        Object.keys(doc).forEach(key => {
            if (exclude.includes(key)) return;
            const cfield = ComputedField.WithoutComputed(() => FieldValue(doc[key]));
            const field = ProxyField.WithoutProxy(() => doc[key]);
            if (key === "proto" && copyProto) {
                if (doc[key] instanceof Doc) {
                    copy[key] = Doc.MakeCopy(doc[key]!, false);
                }
            } else {
                if (field instanceof RefField) {
                    copy[key] = field;
                } else if (cfield instanceof ComputedField) {
                    copy[key] = cfield[Copy]();// ComputedField.MakeFunction(cfield.script.originalScript);
                } else if (field instanceof ObjectField) {
                    copy[key] = doc[key] instanceof Doc ?
                        key.includes("layout[") ? undefined : doc[key] : // reference documents except remove documents that are expanded teplate fields 
                        ObjectField.MakeCopy(field);
                } else if (field instanceof Promise) {
                    debugger; //This shouldn't happend...
                } else {
                    copy[key] = field;
                }
            }
        });
        copy.author = Doc.CurrentUserEmail;
        Doc.UserDoc().defaultAclPrivate && (copy["acl-Public"] = "Not Shared");
        return copy;
    }


    export function MakeDelegate(doc: Doc, id?: string, title?: string): Doc;
    export function MakeDelegate(doc: Opt<Doc>, id?: string, title?: string): Opt<Doc>;
    export function MakeDelegate(doc: Opt<Doc>, id?: string, title?: string): Opt<Doc> {
        if (doc) {
            const delegate = new Doc(id, true);
            delegate.proto = doc;
            delegate.author = Doc.CurrentUserEmail;
            title && (delegate.title = title);
            return delegate;
        }
        return undefined;
    }

    let _applyCount: number = 0;
    export function ApplyTemplate(templateDoc: Doc) {
        if (templateDoc) {
            const proto = new Doc();
            proto.author = Doc.CurrentUserEmail;
            const target = Doc.MakeDelegate(proto);
            const targetKey = StrCast(templateDoc.layoutKey, "layout");
            const applied = ApplyTemplateTo(templateDoc, target, targetKey, templateDoc.title + "(..." + _applyCount++ + ")");
            target.layoutKey = targetKey;
            applied && (Doc.GetProto(applied).type = templateDoc.type);
            Doc.UserDoc().defaultAclPrivate && (applied["acl-Public"] = "Not Shared");
            return applied;
        }
        return undefined;
    }
    export function ApplyTemplateTo(templateDoc: Doc, target: Doc, targetKey: string, titleTarget: string | undefined) {
        if (!Doc.AreProtosEqual(target[targetKey] as Doc, templateDoc)) {
            if (target.resolvedDataDoc) {
                target[targetKey] = new PrefetchProxy(templateDoc);
            } else {
                titleTarget && (Doc.GetProto(target).title = titleTarget);
                const setDoc = [AclAdmin, AclEdit].includes(GetEffectiveAcl(Doc.GetProto(target))) ? Doc.GetProto(target) : target;
                setDoc[targetKey] = new PrefetchProxy(templateDoc);
            }
        }
        return target;
    }

    //
    //  This function converts a generic field layout display into a field layout that displays a specific
    // metadata field indicated by the title of the template field (not the default field that it was rendering)
    //
    export function MakeMetadataFieldTemplate(templateField: Doc, templateDoc: Opt<Doc>): boolean {

        // find the metadata field key that this template field doc will display (indicated by its title)
        const metadataFieldKey = StrCast(templateField.isTemplateForField) || StrCast(templateField.title).replace(/^-/, "");

        // update the original template to mark it as a template
        templateField.isTemplateForField = metadataFieldKey;
        templateField.title = metadataFieldKey;

        const templateFieldValue = templateField[metadataFieldKey] || templateField[Doc.LayoutFieldKey(templateField)];
        const templateCaptionValue = templateField.caption;
        // move any data that the template field had been rendering over to the template doc so that things will still be rendered
        // when the template field is adjusted to point to the new metadatafield key.
        // note 1: if the template field contained a list of documents, each of those documents will be converted to templates as well.
        // note 2: this will not overwrite any field that already exists on the template doc at the field key
        if (!templateDoc?.[metadataFieldKey] && templateFieldValue instanceof ObjectField) {
            Cast(templateFieldValue, listSpec(Doc), [])?.map(d => d instanceof Doc && MakeMetadataFieldTemplate(d, templateDoc));
            (Doc.GetProto(templateField)[metadataFieldKey] = ObjectField.MakeCopy(templateFieldValue));
        }
        // get the layout string that the template uses to specify its layout
        const templateFieldLayoutString = StrCast(Doc.LayoutField(Doc.Layout(templateField)));

        // change it to render the target metadata field instead of what it was rendering before and assign it to the template field layout document.
        Doc.Layout(templateField).layout = templateFieldLayoutString.replace(/fieldKey={'[^']*'}/, `fieldKey={'${metadataFieldKey}'}`);

        // assign the template field doc a delegate of any extension document that was previously used to render the template field (since extension doc's carry rendering informatino)
        Doc.Layout(templateField)[metadataFieldKey + "_ext"] = Doc.MakeDelegate(templateField[templateFieldLayoutString?.split("'")[1] + "_ext"] as Doc);

        return true;
    }

    export function overlapping(doc1: Doc, doc2: Doc, clusterDistance: number) {
        const doc2Layout = Doc.Layout(doc2);
        const doc1Layout = Doc.Layout(doc1);
        const x2 = NumCast(doc2.x) - clusterDistance;
        const y2 = NumCast(doc2.y) - clusterDistance;
        const w2 = NumCast(doc2Layout._width) + clusterDistance;
        const h2 = NumCast(doc2Layout._height) + clusterDistance;
        const x = NumCast(doc1.x) - clusterDistance;
        const y = NumCast(doc1.y) - clusterDistance;
        const w = NumCast(doc1Layout._width) + clusterDistance;
        const h = NumCast(doc1Layout._height) + clusterDistance;
        return doc1.z === doc2.z && intersectRect({ left: x, top: y, width: w, height: h }, { left: x2, top: y2, width: w2, height: h2 });
    }

    export function isBrushedHighlightedDegree(doc: Doc) {
        return Doc.IsHighlighted(doc) ? 6 : Doc.IsBrushedDegree(doc);
    }

    export class DocBrush {
        BrushedDoc: ObservableMap<Doc, boolean> = new ObservableMap();
        SearchMatchDoc: ObservableMap<Doc, { searchMatch: number }> = new ObservableMap();
    }
    const brushManager = new DocBrush();

    export class DocData {
        @observable _user_doc: Doc = undefined!;
        @observable _sharing_doc: Doc = undefined!;
        @observable _searchQuery: string = "";
    }

    // the document containing the view layout information - will be the Document itself unless the Document has
    // a layout field or 'layout' is given.  
    export function Layout(doc: Doc, layout?: Doc): Doc {
        const overrideLayout = layout && Cast(doc[`${StrCast(layout.isTemplateForField, "data")}-layout[` + layout[Id] + "]"], Doc, null);
        return overrideLayout || doc[LayoutSym] || doc;
    }
    export function SetLayout(doc: Doc, layout: Doc | string) { doc[StrCast(doc.layoutKey, "layout")] = layout; }
    export function LayoutField(doc: Doc) { return doc[StrCast(doc.layoutKey, "layout")]; }
    export function LayoutFieldKey(doc: Doc): string { return StrCast(Doc.Layout(doc).layout).split("'")[1]; }
    export function NativeAspect(doc: Doc, dataDoc?: Doc, useDim?: boolean) {
        return Doc.NativeWidth(doc, dataDoc, useDim) / (Doc.NativeHeight(doc, dataDoc, useDim) || 1);
    }
    export function NativeWidth(doc?: Doc, dataDoc?: Doc, useWidth?: boolean) { return !doc ? 0 : NumCast(doc._nativeWidth, NumCast((dataDoc || doc)[Doc.LayoutFieldKey(doc) + "-nativeWidth"], useWidth ? doc[WidthSym]() : 0)); }
    export function NativeHeight(doc?: Doc, dataDoc?: Doc, useHeight?: boolean) { return !doc ? 0 : NumCast(doc._nativeHeight, NumCast((dataDoc || doc)[Doc.LayoutFieldKey(doc) + "-nativeHeight"], useHeight ? doc[HeightSym]() : 0)); }
    export function SetNativeWidth(doc: Doc, width: number | undefined) { doc[Doc.LayoutFieldKey(doc) + "-nativeWidth"] = width; }
    export function SetNativeHeight(doc: Doc, height: number | undefined) { doc[Doc.LayoutFieldKey(doc) + "-nativeHeight"] = height; }


    const manager = new DocData();
    export function SearchQuery(): string { return manager._searchQuery; }
    export function SetSearchQuery(query: string) { runInAction(() => manager._searchQuery = query); }
    export function UserDoc(): Doc { return manager._user_doc; }
    export function SharingDoc(): Doc { return Cast(Doc.UserDoc().mySharedDocs, Doc, null); }
    export function LinkDBDoc(): Doc { return Cast(Doc.UserDoc().myLinkDatabase, Doc, null); }

    export function SetSelectedTool(tool: InkTool) { Doc.UserDoc().activeInkTool = tool; }
    export function GetSelectedTool(): InkTool { return StrCast(Doc.UserDoc().activeInkTool, InkTool.None) as InkTool; }
    export function SetUserDoc(doc: Doc) { return (manager._user_doc = doc); }

    const isSearchMatchCache = computedFn(function IsSearchMatch(doc: Doc) {
        return brushManager.SearchMatchDoc.has(doc) ? brushManager.SearchMatchDoc.get(doc) :
            brushManager.SearchMatchDoc.has(Doc.GetProto(doc)) ? brushManager.SearchMatchDoc.get(Doc.GetProto(doc)) : undefined;
    });
    export function IsSearchMatch(doc: Doc) { return isSearchMatchCache(doc); }
    export function IsSearchMatchUnmemoized(doc: Doc) {
        return brushManager.SearchMatchDoc.has(doc) ? brushManager.SearchMatchDoc.get(doc) :
            brushManager.SearchMatchDoc.has(Doc.GetProto(doc)) ? brushManager.SearchMatchDoc.get(Doc.GetProto(doc)) : undefined;
    }
    export function SetSearchMatch(doc: Doc, results: { searchMatch: number }) {
        if (doc && GetEffectiveAcl(doc) !== AclPrivate && GetEffectiveAcl(Doc.GetProto(doc)) !== AclPrivate) {
            brushManager.SearchMatchDoc.set(doc, results);
        }
        return doc;
    }
    export function SearchMatchNext(doc: Doc, backward: boolean) {
        if (!doc || GetEffectiveAcl(doc) === AclPrivate || GetEffectiveAcl(Doc.GetProto(doc)) === AclPrivate) return doc;
        const result = brushManager.SearchMatchDoc.get(doc);
        const num = Math.abs(result?.searchMatch || 0) + 1;
        runInAction(() => result && brushManager.SearchMatchDoc.set(doc, { searchMatch: backward ? -num : num }));
        return doc;
    }
    export function ClearSearchMatches() {
        brushManager.SearchMatchDoc.clear();
    }

    const isBrushedCache = computedFn(function IsBrushed(doc: Doc) { return brushManager.BrushedDoc.has(doc) || brushManager.BrushedDoc.has(Doc.GetProto(doc)); });
    export function IsBrushed(doc: Doc) { return isBrushedCache(doc); }

    // don't bother memoizing (caching) the result if called from a non-reactive context. (plus this avoids a warning message)
    export function IsBrushedDegreeUnmemoized(doc: Doc) {
        if (!doc || GetEffectiveAcl(doc) === AclPrivate || GetEffectiveAcl(Doc.GetProto(doc)) === AclPrivate) return 0;
        return brushManager.BrushedDoc.has(doc) ? 2 : brushManager.BrushedDoc.has(Doc.GetProto(doc)) ? 1 : 0;
    }
    export function IsBrushedDegree(doc: Doc) {
        return computedFn(function IsBrushDegree(doc: Doc) {
            return Doc.IsBrushedDegreeUnmemoized(doc);
        })(doc);
    }
    export function BrushDoc(doc: Doc) {
        if (!doc || GetEffectiveAcl(doc) === AclPrivate || GetEffectiveAcl(Doc.GetProto(doc)) === AclPrivate) return doc;
        brushManager.BrushedDoc.set(doc, true);
        brushManager.BrushedDoc.set(Doc.GetProto(doc), true);
        return doc;
    }
    export function UnBrushDoc(doc: Doc) {
        if (!doc || GetEffectiveAcl(doc) === AclPrivate || GetEffectiveAcl(Doc.GetProto(doc)) === AclPrivate) return doc;
        brushManager.BrushedDoc.delete(doc);
        brushManager.BrushedDoc.delete(Doc.GetProto(doc));
        return doc;
    }

    export function LinkEndpoint(linkDoc: Doc, anchorDoc: Doc) {
        return Doc.AreProtosEqual(anchorDoc, (linkDoc.anchor1 as Doc).annotationOn as Doc) ||
            Doc.AreProtosEqual(anchorDoc, linkDoc.anchor1 as Doc) ? "1" : "2";
    }

    export function linkFollowUnhighlight() {
        Doc.UnhighlightAll();
        document.removeEventListener("pointerdown", linkFollowUnhighlight);
    }

    let _lastDate = 0;
    export function linkFollowHighlight(destDoc: Doc, dataAndDisplayDocs = true) {
        linkFollowUnhighlight();
        Doc.HighlightDoc(destDoc, dataAndDisplayDocs);
        document.removeEventListener("pointerdown", linkFollowUnhighlight);
        document.addEventListener("pointerdown", linkFollowUnhighlight);
        const lastDate = _lastDate = Date.now();
        window.setTimeout(() => _lastDate === lastDate && linkFollowUnhighlight(), 5000);
    }

    export class HighlightBrush {
        @observable HighlightedDoc: Map<Doc, boolean> = new Map();
    }
    const highlightManager = new HighlightBrush();
    export function IsHighlighted(doc: Doc) {
        if (!doc || GetEffectiveAcl(doc) === AclPrivate || GetEffectiveAcl(Doc.GetProto(doc)) === AclPrivate) return false;
        return highlightManager.HighlightedDoc.get(doc) || highlightManager.HighlightedDoc.get(Doc.GetProto(doc));
    }
    export function HighlightDoc(doc: Doc, dataAndDisplayDocs = true) {
        runInAction(() => {
            highlightManager.HighlightedDoc.set(doc, true);
            dataAndDisplayDocs && highlightManager.HighlightedDoc.set(Doc.GetProto(doc), true);
        });
    }
    export function UnHighlightDoc(doc: Doc) {
        runInAction(() => {
            highlightManager.HighlightedDoc.set(doc, false);
            highlightManager.HighlightedDoc.set(Doc.GetProto(doc), false);
        });
    }
    export function UnhighlightAll() {
        const mapEntries = highlightManager.HighlightedDoc.keys();
        let docEntry: IteratorResult<Doc>;
        while (!(docEntry = mapEntries.next()).done) {
            const targetDoc = docEntry.value;
            targetDoc && Doc.UnHighlightDoc(targetDoc);
        }

    }
    export function UnBrushAllDocs() {
        brushManager.BrushedDoc.clear();
    }

    export function getDocTemplate(doc?: Doc) {
        return !doc ? undefined :
            doc.isTemplateDoc ? doc :
                Cast(doc.dragFactory, Doc, null)?.isTemplateDoc ? doc.dragFactory :
                    Cast(Doc.Layout(doc), Doc, null)?.isTemplateDoc ?
                        (Cast(Doc.Layout(doc), Doc, null).resolvedDataDoc ? Doc.Layout(doc).proto : Doc.Layout(doc)) :
                        undefined;
    }

    export function matchFieldValue(doc: Doc, key: string, value: any): boolean {
        const fieldVal = doc[key];
        if (Cast(fieldVal, listSpec("string"), []).length) {
            const vals = Cast(fieldVal, listSpec("string"), []);
            const docs = vals.some(v => (v as any) instanceof Doc);
            if (docs) return value === Field.toString(fieldVal as Field);
            return vals.some(v => v.includes(value));  // bcz: arghh: Todo: comparison should be parameterized as exact, or substring
        }
        const fieldStr = Field.toString(fieldVal as Field);
        return fieldStr.includes(value); // bcz: arghh: Todo: comparison should be parameterized as exact, or substring
    }

    export function deiconifyView(doc: any) {
        StrCast(doc.layoutKey).split("_")[1] === "icon" && setNativeView(doc);
    }

    export function setNativeView(doc: any) {
        const prevLayout = StrCast(doc.layoutKey).split("_")[1];
        const deiconify = prevLayout === "icon" && StrCast(doc.deiconifyLayout) ? "layout_" + StrCast(doc.deiconifyLayout) : "";
        prevLayout === "icon" && (doc.deiconifyLayout = undefined);
        doc.layoutKey = deiconify || "layout";
    }
    export function setDocFilterRange(target: Doc, key: string, range?: number[]) {
        const container = target ?? CollectionDockingView.Instance.props.Document;
        const docRangeFilters = Cast(container._docRangeFilters, listSpec("string"), []);
        for (let i = 0; i < docRangeFilters.length; i += 3) {
            if (docRangeFilters[i] === key) {
                docRangeFilters.splice(i, 3);
                break;
            }
        }
        if (range !== undefined) {
            docRangeFilters.push(key);
            docRangeFilters.push(range[0].toString());
            docRangeFilters.push(range[1].toString());
            container._docRangeFilters = new List<string>(docRangeFilters);
        }
    }

    // filters document in a container collection:
    // all documents with the specified value for the specified key are included/excluded 
    // based on the modifiers :"check", "x", undefined
    export function setDocFilter(target: Opt<Doc>, key: string, value: any, modifiers?: "remove" | "match" | "check" | "x" | undefined) {
        // console.log(key, value, modifiers);
        const container = target ?? CollectionDockingView.Instance.props.Document;
        const docFilters = Cast(container._docFilters, listSpec("string"), []);
        runInAction(() => {
            for (let i = 0; i < docFilters.length; i++) {
                const fields = docFilters[i].split(":"); // split key:value:modifier
                if (fields[0] === key && (fields[1] === value || modifiers === "match" || modifiers === "remove")) {
                    if (fields[2] === modifiers && modifiers && fields[1] === value) return;
                    docFilters.splice(i, 1);
                    container._docFilters = new List<string>(docFilters);
                    break;
                }
            }
            if (typeof modifiers === "string") {
                if (!docFilters.length && modifiers === "match" && value === undefined) {
                    container._docFilters = undefined;
                } else if (modifiers !== "remove") {
                    docFilters.push(key + ":" + value + ":" + modifiers);
                    container._docFilters = new List<string>(docFilters);
                }
            }
        });
    }
    export function readDocRangeFilter(doc: Doc, key: string) {
        const docRangeFilters = Cast(doc._docRangeFilters, listSpec("string"), []);
        for (let i = 0; i < docRangeFilters.length; i += 3) {
            if (docRangeFilters[i] === key) {
                return [Number(docRangeFilters[i + 1]), Number(docRangeFilters[i + 2])];
            }
        }
    }
    export function assignDocToField(doc: Doc, field: string, id: string) {
        DocServer.GetRefField(id).then(layout => layout instanceof Doc && (doc[field] = layout));
        return id;
    }

    export function toggleNativeDimensions(layoutDoc: Doc, contentScale: number, panelWidth: number, panelHeight: number) {
        runInAction(() => {
            if (Doc.NativeWidth(layoutDoc) || Doc.NativeHeight(layoutDoc)) {
                layoutDoc._viewScale = NumCast(layoutDoc._viewScale, 1) * contentScale;
                layoutDoc._nativeWidth = undefined;
                layoutDoc._nativeHeight = undefined;
            }
            else {
                layoutDoc._autoHeight = false;
                if (!Doc.NativeWidth(layoutDoc)) {
                    layoutDoc._nativeWidth = NumCast(layoutDoc._width, panelWidth);
                    layoutDoc._nativeHeight = NumCast(layoutDoc._height, panelHeight);
                }
            }
        });
    }

    export function isDocPinned(doc: Doc) {
        //add this new doc to props.Document
        const curPres = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;
        if (curPres) {
            return DocListCast(curPres.data).findIndex((val) => Doc.AreProtosEqual(val, doc)) !== -1;
        }
        return false;
    }

    export function copyDragFactory(dragFactory: Doc) {
        const ndoc = dragFactory.isTemplateDoc ? Doc.ApplyTemplate(dragFactory) : Doc.MakeCopy(dragFactory, true);
        if (ndoc && dragFactory["dragFactory-count"] !== undefined) {
            dragFactory["dragFactory-count"] = NumCast(dragFactory["dragFactory-count"]) + 1;
            Doc.SetInPlace(ndoc, "title", ndoc.title + " " + NumCast(dragFactory["dragFactory-count"]).toString(), true);
        }
        return ndoc;
    }
    export function delegateDragFactory(dragFactory: Doc) {
        const ndoc = Doc.MakeDelegate(dragFactory);
        ndoc.isPrototype = true;
        if (ndoc && dragFactory["dragFactory-count"] !== undefined) {
            dragFactory["dragFactory-count"] = NumCast(dragFactory["dragFactory-count"]) + 1;
            Doc.GetProto(ndoc).title = ndoc.title + " " + NumCast(dragFactory["dragFactory-count"]).toString();
        }
        return ndoc;
    }

    export function toIcon(doc: Doc) {
        switch (StrCast(doc.type)) {
            case DocumentType.IMG: return "image";
            case DocumentType.COMPARISON: return "columns";
            case DocumentType.RTF: return "sticky-note";
            case DocumentType.COL: return "folder";
            case DocumentType.WEB: return "globe-asia";
            case DocumentType.SCREENSHOT: return "photo-video";
            case DocumentType.WEBCAM: return "video";
            case DocumentType.AUDIO: return "microphone";
            case DocumentType.BUTTON: return "bolt";
            case DocumentType.PRES: return "tv";
            case DocumentType.SCRIPTING: return "terminal";
            case DocumentType.IMPORT: return "cloud-upload-alt";
            case DocumentType.DOCHOLDER: return "expand";
            case DocumentType.VID: return "video";
            case DocumentType.INK: return "pen-nib";
            case DocumentType.PDF: return "file-pdf";
            case DocumentType.LINK: return "link";
            default: return "question";
        }
    }


    export namespace Get {

        const primitives = ["string", "number", "boolean"];

        export interface JsonConversionOpts {
            data: any;
            title?: string;
            appendToExisting?: { targetDoc: Doc, fieldKey?: string };
            excludeEmptyObjects?: boolean;
        }

        const defaultKey = "json";

        /**
         * This function takes any valid JSON(-like) data, i.e. parsed or unparsed, and at arbitrarily
         * deep levels of nesting, converts the data and structure into nested documents with the appropriate fields.
         * 
         * After building a hierarchy within / below a top-level document, it then returns that top-level parent.
         * 
         * If we've received a string, treat it like valid JSON and try to parse it into an object. If this fails, the
         * string is invalid JSON, so we should assume that the input is the result of a JSON.parse()
         * call that returned a regular string value to be stored as a Field.
         * 
         * If we've received something other than a string, since the caller might also pass in the results of a
         * JSON.parse() call, valid input might be an object, an array (still typeof object), a boolean or a number.
         * Anything else (like a function, etc. passed in naively as any) is meaningless for this operation.
         * 
         * All TS/JS objects get converted directly to documents, directly preserving the key value structure. Everything else,
         * lacking the key value structure, gets stored as a field in a wrapper document.
         * 
         * @param data for convenience and flexibility, either a valid JSON string to be parsed,
         * or the result of any JSON.parse() call.
         * @param title an optional title to give to the highest parent document in the hierarchy.
         * If whether this function creates a new document or appendToExisting is specified and that document already has a title,
         * because this title field can be left undefined for the opposite behavior, including a title will overwrite the existing title.
         * @param appendToExisting **if specified**, there are two cases, both of which return the target document:
         * 
         * 1) the json to be converted can be represented as a document, in which case the target document will act as the root
         * of the tree and receive all the conversion results as new fields on itself
         * 2) the json can't be represented as a document, in which case the function will assign the field-level conversion
         * results to either the specified key on the target document, or to its "json" key by default.
         * 
         * If not specified, the function creates and returns a new entirely generic document (different from the Doc.Create calls)
         * to act as the root of the tree.
         * 
         * One might choose to specify this field if you want to write to a document returned from a Document.Create function call,
         * say a TreeView document that will be rendered, not just an untyped, identityless doc that would otherwise be created
         * from a default call to new Doc.
         * 
         * @param excludeEmptyObjects whether non-primitive objects (TypeScript objects and arrays) should be converted even
         * if they contain no data. By default, empty objects and arrays are ignored.
         */
        export function FromJson({ data, title, appendToExisting, excludeEmptyObjects }: JsonConversionOpts): Opt<Doc> {
            if (excludeEmptyObjects === undefined) {
                excludeEmptyObjects = true;
            }
            if (data === undefined || data === null || ![...primitives, "object"].includes(typeof data)) {
                return undefined;
            }
            let resolved: any;
            try {
                resolved = JSON.parse(typeof data === "string" ? data : JSON.stringify(data));
            } catch (e) {
                return undefined;
            }
            let output: Opt<Doc>;
            if (typeof resolved === "object" && !(resolved instanceof Array)) {
                output = convertObject(resolved, excludeEmptyObjects, title, appendToExisting?.targetDoc);
            } else {
                const result = toField(resolved, excludeEmptyObjects);
                if (appendToExisting) {
                    (output = appendToExisting.targetDoc)[appendToExisting.fieldKey || defaultKey] = result;
                } else {
                    (output = new Doc).json = result;
                }
            }
            title && output && (output.title = title);
            return output;
        }

        /**
         * For each value of the object, recursively convert it to its appropriate field value
         * and store the field at the appropriate key in the document if it is not undefined
         * @param object the object to convert
         * @returns the object mapped from JSON to field values, where each mapping 
         * might involve arbitrary recursion (since toField might itself call convertObject)
         */
        const convertObject = (object: any, excludeEmptyObjects: boolean, title?: string, target?: Doc): Opt<Doc> => {
            const hasEntries = Object.keys(object).length;
            if (hasEntries || !excludeEmptyObjects) {
                const resolved = target ?? new Doc;
                if (hasEntries) {
                    let result: Opt<Field>;
                    Object.keys(object).map(key => {
                        // if excludeEmptyObjects is true, any qualifying conversions from toField will
                        // be undefined, and thus the results that would have
                        // otherwise been empty (List or Doc)s will just not be written
                        if (result = toField(object[key], excludeEmptyObjects, key)) {
                            resolved[key] = result;
                        }
                    });
                }
                title && (resolved.title = title);
                return resolved;
            }
        };

        /**
         * For each element in the list, recursively convert it to a document or other field 
         * and push the field to the list if it is not undefined
         * @param list the list to convert
         * @returns the list mapped from JSON to field values, where each mapping 
         * might involve arbitrary recursion (since toField might itself call convertList)
         */
        const convertList = (list: Array<any>, excludeEmptyObjects: boolean): Opt<List<Field>> => {
            const target = new List();
            let result: Opt<Field>;
            // if excludeEmptyObjects is true, any qualifying conversions from toField will
            // be undefined, and thus the results that would have
            // otherwise been empty (List or Doc)s will just not be written
            list.map(item => (result = toField(item, excludeEmptyObjects)) && target.push(result));
            if (target.length || !excludeEmptyObjects) {
                return target;
            }
        };

        const toField = (data: any, excludeEmptyObjects: boolean, title?: string): Opt<Field> => {
            if (data === null || data === undefined) {
                return undefined;
            }
            if (primitives.includes(typeof data)) {
                return data;
            }
            if (typeof data === "object") {
                return data instanceof Array ? convertList(data, excludeEmptyObjects) : convertObject(data, excludeEmptyObjects, title, undefined);
            }
            throw new Error(`How did ${data} of type ${typeof data} end up in JSON?`);
        };
    }

}

Scripting.addGlobal(function renameAlias(doc: any, n: any) { return StrCast(Doc.GetProto(doc).title).replace(/\([0-9]*\)/, "") + `(${n})`; });
Scripting.addGlobal(function getProto(doc: any) { return Doc.GetProto(doc); });
Scripting.addGlobal(function getDocTemplate(doc?: any) { return Doc.getDocTemplate(doc); });
Scripting.addGlobal(function getAlias(doc: any) { return Doc.MakeAlias(doc); });
Scripting.addGlobal(function getCopy(doc: any, copyProto: any) { return doc.isTemplateDoc ? Doc.ApplyTemplate(doc) : Doc.MakeCopy(doc, copyProto); });
Scripting.addGlobal(function copyDragFactory(dragFactory: Doc) { return Doc.copyDragFactory(dragFactory); });
Scripting.addGlobal(function delegateDragFactory(dragFactory: Doc) { return Doc.delegateDragFactory(dragFactory); });
Scripting.addGlobal(function copyField(field: any) { return field instanceof ObjectField ? ObjectField.MakeCopy(field) : field; });
Scripting.addGlobal(function docList(field: any) { return DocListCast(field); });
Scripting.addGlobal(function setInPlace(doc: any, field: any, value: any) { return Doc.SetInPlace(doc, field, value, false); });
Scripting.addGlobal(function sameDocs(doc1: any, doc2: any) { return Doc.AreProtosEqual(doc1, doc2); });
Scripting.addGlobal(function deiconifyView(doc: any) { Doc.deiconifyView(doc); });
Scripting.addGlobal(function undo() { SelectionManager.DeselectAll(); return UndoManager.Undo(); });
Scripting.addGlobal(function redo() { SelectionManager.DeselectAll(); return UndoManager.Redo(); });
Scripting.addGlobal(function DOC(id: string) { console.log("Can't parse a document id in a script"); return "invalid"; });
Scripting.addGlobal(function assignDoc(doc: Doc, field: string, id: string) { return Doc.assignDocToField(doc, field, id); });
Scripting.addGlobal(function docCast(doc: FieldResult): any { return DocCastAsync(doc); });
Scripting.addGlobal(function activePresentationItem() {
    const curPres = Doc.UserDoc().activePresentation as Doc;
    return curPres && DocListCast(curPres[Doc.LayoutFieldKey(curPres)])[NumCast(curPres._itemIndex)];
});
Scripting.addGlobal(function selectedDocs(container: Doc, excludeCollections: boolean, prevValue: any) {
    const docs = SelectionManager.Views().map(dv => dv.props.Document).
        filter(d => !Doc.AreProtosEqual(d, container) && !d.annotationOn && d.type !== DocumentType.DOCHOLDER && d.type !== DocumentType.KVP &&
            (!excludeCollections || d.type !== DocumentType.COL || !Cast(d.data, listSpec(Doc), null)));
    return docs.length ? new List(docs) : prevValue;
});
Scripting.addGlobal(function setDocFilter(container: Doc, key: string, value: any, modifiers?: "match" | "check" | "x" | undefined) { Doc.setDocFilter(container, key, value, modifiers); });
Scripting.addGlobal(function setDocFilterRange(container: Doc, key: string, range: number[]) { Doc.setDocFilterRange(container, key, range); });
