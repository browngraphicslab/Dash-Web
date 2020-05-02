import { action, computed, observable, ObservableMap, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import { alias, map, serializable } from "serializr";
import { DocServer } from "../client/DocServer";
import { DocumentType } from "../client/documents/DocumentTypes";
import { Scripting, scriptingGlobal } from "../client/util/Scripting";
import { afterDocDeserialize, autoObject, Deserializable, SerializationHelper } from "../client/util/SerializationHelper";
import { UndoManager } from "../client/util/UndoManager";
import { intersectRect } from "../Utils";
import { HandleUpdate, Id, OnUpdate, Parent, Self, SelfProxy, ToScriptString, ToString, Update, Copy } from "./FieldSymbols";
import { List } from "./List";
import { ObjectField } from "./ObjectField";
import { PrefetchProxy, ProxyField } from "./Proxy";
import { FieldId, RefField } from "./RefField";
import { RichTextField } from "./RichTextField";
import { listSpec } from "./Schema";
import { ComputedField, ScriptField } from "./ScriptField";
import { Cast, FieldValue, NumCast, StrCast, ToConstructor, ScriptCast } from "./Types";
import { deleteProperty, getField, getter, makeEditable, makeReadOnly, setter, updateFunction } from "./util";
import { Docs, DocumentOptions } from "../client/documents/Documents";
import { PdfField, VideoField, AudioField, ImageField } from "./URLField";

export namespace Field {
    export function toKeyValueString(doc: Doc, key: string): string {
        const onDelegate = Object.keys(doc).includes(key);

        const field = ComputedField.WithoutComputed(() => FieldValue(doc[key]));
        if (Field.IsField(field)) {
            return (onDelegate ? "=" : "") + (field instanceof ComputedField ? `:=${field.script.originalScript}` : Field.toScriptString(field));
        }
        return "";
    }
    export function toScriptString(field: Field): string {
        if (typeof field === "string") {
            return `"${field}"`;
        } else if (typeof field === "number" || typeof field === "boolean") {
            return String(field);
        } else {
            return field[ToScriptString]();
        }
    }
    export function toString(field: Field): string {
        if (typeof field === "string") {
            return field;
        } else if (typeof field === "number" || typeof field === "boolean") {
            return String(field);
        } else if (field instanceof ObjectField) {
            return field[ToString]();
        } else if (field instanceof RefField) {
            return field[ToString]();
        }
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

export async function DocCastAsync(field: FieldResult): Promise<Opt<Doc>> {
    return Cast(field, Doc);
}

export function DocListCast(field: FieldResult): Doc[] {
    return Cast(field, listSpec(Doc), []).filter(d => d instanceof Doc) as Doc[];
}

export const WidthSym = Symbol("Width");
export const HeightSym = Symbol("Height");
export const DataSym = Symbol("Data");
export const LayoutSym = Symbol("Layout");
export const UpdatingFromServer = Symbol("UpdatingFromServer");
const CachedUpdates = Symbol("Cached updates");


function fetchProto(doc: Doc) {
    const proto = doc.proto;
    if (proto instanceof Promise) {
        return proto;
    }
}

@scriptingGlobal
@Deserializable("Doc", fetchProto).withFields(["id"])
export class Doc extends RefField {
    constructor(id?: FieldId, forceSave?: boolean) {
        super(id);
        const doc = new Proxy<this>(this, {
            set: setter,
            get: getter,
            // getPrototypeOf: (target) => Cast(target[SelfProxy].proto, Doc) || null, // TODO this might be able to replace the proto logic in getter
            has: (target, key) => key in target.__fields,
            ownKeys: target => {
                const obj = {} as any;
                Object.assign(obj, target.___fields);
                runInAction(() => obj.__LAYOUT__ = target.__LAYOUT__);
                return Object.keys(obj);
            },
            getOwnPropertyDescriptor: (target, prop) => {
                if (prop.toString() === "__LAYOUT__") {
                    return Reflect.getOwnPropertyDescriptor(target, prop);
                }
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

    @serializable(alias("fields", map(autoObject(), { afterDeserialize: afterDocDeserialize })))
    private get __fields() { return this.___fields; }
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

    private [UpdatingFromServer]: boolean = false;

    private [Update] = (diff: any) => {
        !this[UpdatingFromServer] && DocServer.UpdateField(this[Id], diff);
    }

    private [Self] = this;
    private [SelfProxy]: any;
    public [WidthSym] = () => NumCast(this[SelfProxy]._width);
    public [HeightSym] = () => NumCast(this[SelfProxy]._height);
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

    [ToScriptString]() { return `DOC-"${this[Self][Id]}"-`; }
    [ToString]() { return `Doc(${this.title})`; }

    private [CachedUpdates]: { [key: string]: () => void | Promise<any> } = {};
    public static CurrentUserEmail: string = "";
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
                    this[UpdatingFromServer] = true;
                    this[fKey] = value;
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
        } catch  {
            return doc;
        }
    }
    export function GetT<T extends Field>(doc: Doc, key: string, ctor: ToConstructor<T>, ignoreProto: boolean = false): FieldResult<T> {
        return Cast(Get(doc, key, ignoreProto), ctor) as FieldResult<T>;
    }
    export function IsPrototype(doc: Doc) {
        return GetT(doc, "isPrototype", "boolean", true);
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
            console.log("GetProto: error: got Promise insead of Doc");
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
                    list.splice(pind, 1);
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
        const alias = !GetT(doc, "isPrototype", "boolean", true) ? Doc.MakeCopy(doc, undefined, id) : Doc.MakeDelegate(doc, id);
        const layout = Doc.LayoutField(alias);
        if (layout instanceof Doc && layout !== alias && layout === Doc.Layout(alias)) {
            Doc.SetLayout(alias, Doc.MakeAlias(layout));
        }
        alias.aliasOf = doc;
        alias.title = ComputedField.MakeFunction(`renameAlias(this, ${Doc.GetProto(doc).aliasNumber = NumCast(Doc.GetProto(doc).aliasNumber) + 1})`);
        return alias;
    }

    //
    // Determines whether the layout needs to be expanded (as a template).
    // template expansion is rquired when the layout is a template doc/field and there's a datadoc which isn't equal to the layout template
    //
    export function WillExpandTemplateLayout(layoutDoc: Doc, dataDoc?: Doc) {
        return (layoutDoc.isTemplateForField || layoutDoc.isTemplateDoc) && dataDoc && layoutDoc !== dataDoc;
    }

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
        }
        else if (expandedTemplateLayout === undefined) {
            if (templateLayoutDoc.resolvedDataDoc === Doc.GetProto(targetDoc) && templateLayoutDoc.PARAMS === StrCast(targetDoc.PARAMS)) {
                expandedTemplateLayout = templateLayoutDoc; // reuse an existing template layout if its for the same document with the same params
            } else {
                templateLayoutDoc.resolvedDataDoc && (templateLayoutDoc = Cast(templateLayoutDoc.proto, Doc, null) || templateLayoutDoc); // if the template has already been applied (ie, a nested template), then use the template's prototype
                setTimeout(action(() => {
                    if (!targetDoc[expandedLayoutFieldKey]) {
                        const newLayoutDoc = Doc.MakeDelegate(templateLayoutDoc, undefined, "[" + templateLayoutDoc.title + "]");
                        // the template's arguments are stored in params which is derefenced to find
                        // the actual field key where the parameterized template data is stored.
                        newLayoutDoc[params] = args !== "..." ? args : ""; // ... signifies the layout has sub template(s) -- so we have to expand the layout for them so that they can get the correct 'rootDocument' field, but we don't need to reassign their params.  it would be better if the 'rootDocument' field could be passed dynamically to avoid have to create instances
                        newLayoutDoc.rootDocument = targetDoc;
                        targetDoc[expandedLayoutFieldKey] = newLayoutDoc;
                        const dataDoc = Doc.GetProto(targetDoc);
                        newLayoutDoc.resolvedDataDoc = dataDoc;
                        if (dataDoc[templateField] === undefined && templateLayoutDoc[templateField] instanceof List) {
                            dataDoc[templateField] = ComputedField.MakeFunction(`ObjectField.MakeCopy(templateLayoutDoc["${templateField}"] as List)`, { templateLayoutDoc: Doc.name }, { templateLayoutDoc });
                        }
                    }
                }), 0);
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
        const exclude = Cast(doc.excludeFields, listSpec("string"), []);
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
                    copy[key] = ComputedField.MakeFunction(cfield.script.originalScript);
                } else if (field instanceof ObjectField) {
                    copy[key] = doc[key] instanceof Doc ?
                        key.includes("layout[") ? Doc.MakeCopy(doc[key] as Doc, false) : doc[key] : // reference documents except copy documents that are expanded teplate fields 
                        ObjectField.MakeCopy(field);
                } else if (field instanceof Promise) {
                    debugger; //This shouldn't happend...
                } else {
                    copy[key] = field;
                }
            }
        });

        return copy;
    }

    export function MakeClone(doc: Doc, cloneProto: boolean = true): Doc {
        const copy = new Doc(undefined, true);
        const exclude = Cast(doc.excludeFields, listSpec("string"), []);
        Object.keys(doc).forEach(key => {
            if (exclude.includes(key)) return;
            const cfield = ComputedField.WithoutComputed(() => FieldValue(doc[key]));
            const field = ProxyField.WithoutProxy(() => doc[key]);
            if (key === "proto" && cloneProto) {
                if (doc[key] instanceof Doc) {
                    copy[key] = Doc.MakeClone(doc[key]!, false);
                }
            } else {
                if (field instanceof RefField) {
                    copy[key] = field;
                } else if (cfield instanceof ComputedField) {
                    copy[key] = ComputedField.MakeFunction(cfield.script.originalScript);
                } else if (field instanceof ObjectField) {
                    const list = Cast(doc[key], listSpec(Doc));
                    if (list !== undefined && !(list instanceof Promise)) {
                        copy[key] = new List<Doc>(list.filter(d => d instanceof Doc).map(d => Doc.MakeCopy(d as Doc, false)));
                    } else {
                        copy[key] = doc[key] instanceof Doc ?
                            key.includes("layout[") ?
                                Doc.MakeCopy(doc[key] as Doc, false) : doc[key] : // reference documents except copy documents that are expanded teplate fields 
                            ObjectField.MakeCopy(field);
                    }
                } else if (field instanceof Promise) {
                    debugger; //This shouldn't happend...
                } else {
                    copy[key] = field;
                }
            }
        });
        Doc.SetInPlace(copy, "title", "CLONE: " + doc.title, true);
        copy.cloneOf = doc;
        return copy;
    }

    export function MakeDelegate(doc: Doc, id?: string, title?: string): Doc;
    export function MakeDelegate(doc: Opt<Doc>, id?: string, title?: string): Opt<Doc>;
    export function MakeDelegate(doc: Opt<Doc>, id?: string, title?: string): Opt<Doc> {
        if (doc) {
            const delegate = new Doc(id, true);
            delegate.proto = doc;
            title && (delegate.title = title);
            return delegate;
        }
        return undefined;
    }

    let _applyCount: number = 0;
    export function ApplyTemplate(templateDoc: Doc) {
        if (templateDoc) {
            const target = Doc.MakeDelegate(new Doc());
            const targetKey = StrCast(templateDoc.layoutKey, "layout");
            const applied = ApplyTemplateTo(templateDoc, target, targetKey, templateDoc.title + "(..." + _applyCount++ + ")");
            target.layoutKey = targetKey;
            applied && (Doc.GetProto(applied).type = templateDoc.type);
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
                Doc.GetProto(target)[targetKey] = new PrefetchProxy(templateDoc);
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
        // copy the textTemplates from 'this' (not 'self') because the layout contains the template info, not the original doc
        if (templateCaptionValue instanceof RichTextField && !templateCaptionValue.Empty()) {
            templateField["caption-textTemplate"] = ComputedField.MakeFunction(`copyField(this.caption)`);
        }
        if (templateFieldValue instanceof RichTextField && !templateFieldValue.Empty()) {
            templateField[metadataFieldKey + "-textTemplate"] = ComputedField.MakeFunction(`copyField(this.${metadataFieldKey})`);
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
        if (Doc.IsHighlighted(doc)) {
            return 6;
        }
        else {
            return Doc.IsBrushedDegree(doc);
        }
    }

    export class DocBrush {
        BrushedDoc: ObservableMap<Doc, boolean> = new ObservableMap();
    }
    const brushManager = new DocBrush();

    export class DocData {
        @observable _user_doc: Doc = undefined!;
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
    const manager = new DocData();
    export function SearchQuery(): string { return manager._searchQuery; }
    export function SetSearchQuery(query: string) { runInAction(() => manager._searchQuery = query); }
    export function UserDoc(): Doc { return manager._user_doc; }
    export function SetUserDoc(doc: Doc) { manager._user_doc = doc; }
    export function IsBrushed(doc: Doc) {
        return computedFn(function IsBrushed(doc: Doc) {
            return brushManager.BrushedDoc.has(doc) || brushManager.BrushedDoc.has(Doc.GetProto(doc));
        })(doc);
    }
    // don't bother memoizing (caching) the result if called from a non-reactive context. (plus this avoids a warning message)
    export function IsBrushedDegreeUnmemoized(doc: Doc) {
        return brushManager.BrushedDoc.has(doc) ? 2 : brushManager.BrushedDoc.has(Doc.GetProto(doc)) ? 1 : 0;
    }
    export function IsBrushedDegree(doc: Doc) {
        return computedFn(function IsBrushDegree(doc: Doc) {
            return Doc.IsBrushedDegreeUnmemoized(doc);
        })(doc);
    }
    export function BrushDoc(doc: Doc) {
        brushManager.BrushedDoc.set(doc, true);
        brushManager.BrushedDoc.set(Doc.GetProto(doc), true);
        return doc;
    }
    export function UnBrushDoc(doc: Doc) {
        brushManager.BrushedDoc.delete(doc);
        brushManager.BrushedDoc.delete(Doc.GetProto(doc));
        return doc;
    }


    export function LinkOtherAnchor(linkDoc: Doc, anchorDoc: Doc) { return Doc.AreProtosEqual(anchorDoc, Cast(linkDoc.anchor1, Doc) as Doc) ? Cast(linkDoc.anchor2, Doc) as Doc : Cast(linkDoc.anchor1, Doc) as Doc; }
    export function LinkEndpoint(linkDoc: Doc, anchorDoc: Doc) { return Doc.AreProtosEqual(anchorDoc, Cast(linkDoc.anchor1, Doc) as Doc) ? "1" : "2"; }

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
        return doc?.isTemplateDoc ? doc :
            Cast(doc?.dragFactory, Doc, null)?.isTemplateDoc ? doc?.dragFactory :
                Cast(doc?.layout, Doc, null)?.isTemplateDoc ? doc?.layout : undefined;
    }

    export function matchFieldValue(doc: Doc, key: string, value: any): boolean {
        const fieldVal = doc[key];
        if (Cast(fieldVal, listSpec("string"), []).length) {
            const vals = Cast(fieldVal, listSpec("string"), []);
            return vals.some(v => v === value);
        }
        const fieldStr = Field.toString(fieldVal as Field);
        return fieldStr === value;
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
        const docRangeFilters = Cast(target._docRangeFilters, listSpec("string"), []);
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
            target._docRangeFilters = new List<string>(docRangeFilters);
        }
    }

    export function aliasDocs(field: any) {
        return new List<Doc>(field.map((d: any) => Doc.MakeAlias(d)));
    }

    // filters document in a container collection:
    // all documents with the specified value for the specified key are included/excluded 
    // based on the modifiers :"check", "x", undefined
    export function setDocFilter(container: Doc, key: string, value: any, modifiers?: "check" | "x" | undefined) {
        const docFilters = Cast(container._docFilters, listSpec("string"), []);
        for (let i = 0; i < docFilters.length; i += 3) {
            if (docFilters[i] === key && docFilters[i + 1] === value) {
                docFilters.splice(i, 3);
                break;
            }
        }
        if (typeof modifiers === "string") {
            docFilters.push(key);
            docFilters.push(value);
            docFilters.push(modifiers);
            container._docFilters = new List<string>(docFilters);
        }
    }
    export function readDocRangeFilter(doc: Doc, key: string) {
        const docRangeFilters = Cast(doc._docRangeFilters, listSpec("string"), []);
        for (let i = 0; i < docRangeFilters.length; i += 3) {
            if (docRangeFilters[i] === key) {
                return [Number(docRangeFilters[i + 1]), Number(docRangeFilters[i + 2])];
            }
        }
    }

    export function freezeNativeDimensions(layoutDoc: Doc, width: number, height: number): void {
        layoutDoc._autoHeight = false;
        if (!layoutDoc._nativeWidth) {
            layoutDoc._nativeWidth = NumCast(layoutDoc._width, width);
            layoutDoc._nativeHeight = NumCast(layoutDoc._height, height);
        }
    }
    export function assignDocToField(doc: Doc, field: string, id: string) {
        DocServer.GetRefField(id).then(layout => layout instanceof Doc && (doc[field] = layout));
        return id;
    }

    export function isDocPinned(doc: Doc) {
        //add this new doc to props.Document
        const curPres = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;
        if (curPres) {
            return DocListCast(curPres.data).findIndex((val) => Doc.AreProtosEqual(val, doc)) !== -1;
        }
        return false;
    }

    // applies a custom template to a document.  the template is identified by it's short name (e.g, slideView not layout_slideView)
    export function makeCustomViewClicked(doc: Doc, creator: Opt<(documents: Array<Doc>, options: DocumentOptions, id?: string) => Doc>, templateSignature: string = "custom", docLayoutTemplate?: Doc) {
        const batch = UndoManager.StartBatch("makeCustomViewClicked");
        runInAction(() => {
            doc.layoutKey = "layout_" + templateSignature;
            if (doc[doc.layoutKey] === undefined) {
                createCustomView(doc, creator, templateSignature, docLayoutTemplate);
            }
        });
        batch.end();
    }
    export function findTemplate(templateName: string, type: string, signature: string) {
        let docLayoutTemplate: Opt<Doc>;
        const iconViews = DocListCast(Cast(Doc.UserDoc()["template-icons"], Doc, null)?.data);
        const templBtns = DocListCast(Cast(Doc.UserDoc()["template-buttons"], Doc, null)?.data);
        const noteTypes = DocListCast(Cast(Doc.UserDoc()["template-notes"], Doc, null)?.data);
        const clickFuncs = DocListCast(Cast(Doc.UserDoc().clickFuncs, Doc, null)?.data);
        const allTemplates = iconViews.concat(templBtns).concat(noteTypes).concat(clickFuncs).map(btnDoc => (btnDoc.dragFactory as Doc) || btnDoc).filter(doc => doc.isTemplateDoc);
        // bcz: this is hacky -- want to have different templates be applied depending on the "type" of a document.  but type is not reliable and there could be other types of template searches so this should be generalized
        // first try to find a template that matches the specific document type (<typeName>_<templateName>).  otherwise, fallback to a general match on <templateName>
        !docLayoutTemplate && allTemplates.forEach(tempDoc => StrCast(tempDoc.title) === templateName + "_" + type && (docLayoutTemplate = tempDoc));
        !docLayoutTemplate && allTemplates.forEach(tempDoc => StrCast(tempDoc.title) === templateName && (docLayoutTemplate = tempDoc));
        return docLayoutTemplate;
    }
    export function createCustomView(doc: Doc, creator: Opt<(documents: Array<Doc>, options: DocumentOptions, id?: string) => Doc>, templateSignature: string = "custom", docLayoutTemplate?: Doc) {
        const templateName = templateSignature.replace(/\(.*\)/, "");
        docLayoutTemplate = docLayoutTemplate || findTemplate(templateName, StrCast(doc.type), templateSignature);

        const customName = "layout_" + templateSignature;
        const _width = NumCast(doc._width);
        const _height = NumCast(doc._height);
        const options = { title: "data", backgroundColor: StrCast(doc.backgroundColor), _autoHeight: true, _width, x: -_width / 2, y: - _height / 2, _showSidebar: false };

        let fieldTemplate: Opt<Doc>;
        if (doc.data instanceof RichTextField || typeof (doc.data) === "string") {
            fieldTemplate = Docs.Create.TextDocument("", options);
        } else if (doc.data instanceof PdfField) {
            fieldTemplate = Docs.Create.PdfDocument("http://www.msn.com", options);
        } else if (doc.data instanceof VideoField) {
            fieldTemplate = Docs.Create.VideoDocument("http://www.cs.brown.edu", options);
        } else if (doc.data instanceof AudioField) {
            fieldTemplate = Docs.Create.AudioDocument("http://www.cs.brown.edu", options);
        } else if (doc.data instanceof ImageField) {
            fieldTemplate = Docs.Create.ImageDocument("http://www.cs.brown.edu", options);
        }
        const docTemplate = docLayoutTemplate || creator?.(fieldTemplate ? [fieldTemplate] : [], { title: customName + "(" + doc.title + ")", isTemplateDoc: true, _width: _width + 20, _height: Math.max(100, _height + 45) });

        fieldTemplate && Doc.MakeMetadataFieldTemplate(fieldTemplate, docTemplate ? Doc.GetProto(docTemplate) : docTemplate);
        docTemplate && Doc.ApplyTemplateTo(docTemplate, doc, customName, undefined);
    }
    export function makeCustomView(doc: Doc, custom: boolean, layout: string) {
        Doc.setNativeView(doc);
        if (custom) {
            makeCustomViewClicked(doc, Docs.Create.StackingDocument, layout, undefined);
        }
    }
    export function iconify(doc: Doc) {
        const layoutKey = Cast(doc.layoutKey, "string", null);
        Doc.makeCustomViewClicked(doc, Docs.Create.StackingDocument, "icon", undefined);
        if (layoutKey && layoutKey !== "layout" && layoutKey !== "layout_icon") doc.deiconifyLayout = layoutKey.replace("layout_", "");
    }

    export function pileup(selected: Doc[], x: number, y: number) {
        const newCollection = Docs.Create.PileDocument(selected, { title: "pileup", x: x - 55, y: y - 55, _width: 110, _height: 100, _LODdisable: true });
        let w = 0, h = 0;
        selected.forEach((d, i) => {
            Doc.iconify(d);
            w = Math.max(d[WidthSym](), w);
            h = Math.max(d[HeightSym](), h);
        });
        h = Math.max(h, w * 4 / 3); // converting to an icon does not update the height right away.  so this is a fallback hack to try to do something reasonable
        selected.forEach((d, i) => {
            d.x = Math.cos(Math.PI * 2 * i / selected.length) * 10 - w / 2;
            d.y = Math.sin(Math.PI * 2 * i / selected.length) * 10 - h / 2;
            d.displayTimecode = undefined;  // bcz: this should be automatic somehow.. along with any other properties that were logically associated with the original collection
        });
        newCollection.x = NumCast(newCollection.x) + NumCast(newCollection._width) / 2 - 55;
        newCollection.y = NumCast(newCollection.y) + NumCast(newCollection._height) / 2 - 55;
        newCollection._width = newCollection._height = 110;
        //newCollection.borderRounding = "40px";
        newCollection._jitterRotation = 10;
        newCollection._backgroundColor = "gray";
        newCollection._overflow = "visible";
        return newCollection;
    }


    export async function addFieldEnumerations(doc: Opt<Doc>, enumeratedFieldKey: string, enumerations: { title: string, _backgroundColor?: string, color?: string }[]) {
        let optionsCollection = await DocServer.GetRefField(enumeratedFieldKey);
        if (!(optionsCollection instanceof Doc)) {
            optionsCollection = Docs.Create.StackingDocument([], { title: `${enumeratedFieldKey} field set` }, enumeratedFieldKey);
            Doc.AddDocToList((Doc.UserDoc().fieldTypes as Doc), "data", optionsCollection as Doc);
        }
        const options = optionsCollection as Doc;
        const targetDoc = doc && Doc.GetProto(Cast(doc.rootDocument, Doc, null) || doc);
        const docFind = `options.data.find(doc => doc.title === (this.rootDocument||this)["${enumeratedFieldKey}"])?`;
        targetDoc && (targetDoc.backgroundColor = ComputedField.MakeFunction(docFind + `._backgroundColor || "white"`, undefined, { options }));
        targetDoc && (targetDoc.color = ComputedField.MakeFunction(docFind + `.color || "black"`, undefined, { options }));
        targetDoc && (targetDoc.borderRounding = ComputedField.MakeFunction(docFind + `.borderRounding`, undefined, { options }));
        enumerations.map(enumeration => {
            const found = DocListCast(options.data).find(d => d.title === enumeration.title);
            if (found) {
                found._backgroundColor = enumeration._backgroundColor || found._backgroundColor;
                found._color = enumeration.color || found._color;
            } else {
                Doc.AddDocToList(options, "data", Docs.Create.TextDocument(enumeration.title, enumeration));
            }
        });
        return optionsCollection;
    }
}

Scripting.addGlobal(function renameAlias(doc: any, n: any) { return StrCast(Doc.GetProto(doc).title).replace(/\([0-9]*\)/, "") + `(${n})`; });
Scripting.addGlobal(function getProto(doc: any) { return Doc.GetProto(doc); });
Scripting.addGlobal(function getDocTemplate(doc?: any) { return Doc.getDocTemplate(doc); });
Scripting.addGlobal(function getAlias(doc: any) { return Doc.MakeAlias(doc); });
Scripting.addGlobal(function getCopy(doc: any, copyProto: any) { return doc.isTemplateDoc ? Doc.ApplyTemplate(doc) : Doc.MakeCopy(doc, copyProto); });
Scripting.addGlobal(function copyField(field: any) { return ObjectField.MakeCopy(field); });
Scripting.addGlobal(function aliasDocs(field: any) { return Doc.aliasDocs(field); });
Scripting.addGlobal(function docList(field: any) { return DocListCast(field); });
Scripting.addGlobal(function setInPlace(doc: any, field: any, value: any) { return Doc.SetInPlace(doc, field, value, false); });
Scripting.addGlobal(function sameDocs(doc1: any, doc2: any) { return Doc.AreProtosEqual(doc1, doc2); });
Scripting.addGlobal(function deiconifyView(doc: any) { Doc.deiconifyView(doc); });
Scripting.addGlobal(function undo() { return UndoManager.Undo(); });
Scripting.addGlobal(function redo() { return UndoManager.Redo(); });
Scripting.addGlobal(function DOC(id: string) { console.log("Can't parse a document id in a script"); return "invalid"; });
Scripting.addGlobal(function assignDoc(doc: Doc, field: string, id: string) { return Doc.assignDocToField(doc, field, id); });
Scripting.addGlobal(function docCast(doc: FieldResult): any { return DocCastAsync(doc); });
Scripting.addGlobal(function activePresentationItem() {
    const curPres = Doc.UserDoc().activePresentation as Doc;
    return curPres && DocListCast(curPres[Doc.LayoutFieldKey(curPres)])[NumCast(curPres._itemIndex)];
});
Scripting.addGlobal(function selectDoc(doc: any) { Doc.UserDoc().activeSelection = new List([doc]); });
Scripting.addGlobal(function selectedDocs(container: Doc, excludeCollections: boolean, prevValue: any) {
    const docs = DocListCast(Doc.UserDoc().activeSelection).
        filter(d => !Doc.AreProtosEqual(d, container) && !d.annotationOn && d.type !== DocumentType.DOCHOLDER && d.type !== DocumentType.KVP &&
            (!excludeCollections || d.type !== DocumentType.COL || !Cast(d.data, listSpec(Doc), null)));
    return docs.length ? new List(docs) : prevValue;
});
Scripting.addGlobal(function setDocFilter(container: Doc, key: string, value: any, modifiers?: "check" | "x" | undefined) { Doc.setDocFilter(container, key, value, modifiers); });
Scripting.addGlobal(function setDocFilterRange(container: Doc, key: string, range: number[]) { Doc.setDocFilterRange(container, key, range); });