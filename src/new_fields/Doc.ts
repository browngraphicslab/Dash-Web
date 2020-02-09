import { observable, ObservableMap, runInAction, action, computed } from "mobx";
import { alias, map, serializable } from "serializr";
import { DocServer } from "../client/DocServer";
import { DocumentType } from "../client/documents/DocumentTypes";
import { Scripting, scriptingGlobal } from "../client/util/Scripting";
import { afterDocDeserialize, autoObject, Deserializable, SerializationHelper } from "../client/util/SerializationHelper";
import { Copy, HandleUpdate, Id, OnUpdate, Parent, Self, SelfProxy, ToScriptString, ToString, Update } from "./FieldSymbols";
import { List } from "./List";
import { ObjectField } from "./ObjectField";
import { PrefetchProxy, ProxyField } from "./Proxy";
import { FieldId, RefField } from "./RefField";
import { listSpec } from "./Schema";
import { ComputedField, ScriptField } from "./ScriptField";
import { BoolCast, Cast, FieldValue, NumCast, StrCast, ToConstructor } from "./Types";
import { deleteProperty, getField, getter, makeEditable, makeReadOnly, setter, updateFunction } from "./util";
import { intersectRect } from "../Utils";
import { UndoManager } from "../client/util/UndoManager";
import { computedFn } from "mobx-utils";
import { RichTextField } from "./RichTextField";
import { Script } from "vm";

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
        return "(null)";
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
            ownKeys: target => Object.keys(target.__allfields),
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
    private get __fields() {
        return this.___fields;
    }
    private get __allfields() {
        let obj = {} as any;
        Object.assign(obj, this.___fields);
        runInAction(() => obj.__LAYOUT__ = this.__LAYOUT__);
        return obj;
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

    private [UpdatingFromServer]: boolean = false;

    private [Update] = (diff: any) => {
        if (this[UpdatingFromServer]) {
            return;
        }
        DocServer.UpdateField(this[Id], diff);
    }

    private [Self] = this;
    private [SelfProxy]: any;
    public [WidthSym] = () => NumCast(this[SelfProxy]._width);
    public [HeightSym] = () => NumCast(this[SelfProxy]._height);
    public get [DataSym]() { return Cast(this[SelfProxy].resolvedDataDoc, Doc, null) || this[SelfProxy]; }
    public get [LayoutSym]() { return this[SelfProxy].__LAYOUT__; }
    @computed get __LAYOUT__() {
        const templateLayoutDoc = Cast(Doc.LayoutField(this[SelfProxy]), Doc, null);
        if (templateLayoutDoc) {
            const renderFieldKey = (templateLayoutDoc[StrCast(templateLayoutDoc.layoutKey, "layout")] as string).split("'")[1];
            return Cast(this[SelfProxy][renderFieldKey + "-layout[" + templateLayoutDoc[Id] + "]"], Doc, null) || templateLayoutDoc;
        }
        return undefined;
    }

    [ToScriptString]() {
        return "invalid";
    }
    [ToString]() {
        return "Doc";
    }

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

    export function resetView(doc: Doc) {
        doc._panX = doc._customOriginX ?? 0;
        doc._panY = doc._customOriginY ?? 0;
        doc.scale = doc._customOriginScale ?? 1;
    }

    export function resetViewToOrigin(doc: Doc) {
        doc._panX = 0;
        doc._panY = 0;
        doc.scale = 1;
    }

    export function setView(doc: Doc) {
        doc._customOriginX = doc._panX;
        doc._customOriginY = doc._panY;
        doc._customOriginScale = doc.scale;
    }

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
            const self = doc[Self];
            return getField(self, key, ignoreProto);
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

    // gets the document's prototype or returns the document if it is a prototype
    export function GetProto(doc: Doc) {
        return doc && (Doc.GetT(doc, "isPrototype", "boolean", true) ? doc : (doc.proto || doc));
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
    export function RemoveDocFromList(listDoc: Doc, key: string, doc: Doc) {
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
    export function AddDocToList(listDoc: Doc, key: string, doc: Doc, relativeTo?: Doc, before?: boolean, first?: boolean, allowDuplicates?: boolean, reversed?: boolean) {
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

    export function MakeTitled(title: string) {
        const doc = new Doc();
        doc.title = title;
        return doc;
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
    // Determines whether the combination of the layoutDoc and dataDoc represents
    // a template relationship :  there is a dataDoc and it doesn't match the layoutDoc an
    // the lyouatDoc's layout is layout string (not a document) 
    //
    export function WillExpandTemplateLayout(layoutDoc: Doc, dataDoc?: Doc) {
        return (layoutDoc.isTemplateForField || layoutDoc.isTemplateDoc) && dataDoc && layoutDoc !== dataDoc && !(Doc.LayoutField(layoutDoc) instanceof Doc);
    }

    //
    // Returns an expanded template layout for a target data document if there is a template relationship
    // between the two. If so, the layoutDoc is expanded into a new document that inherits the properties 
    // of the original layout while allowing for individual layout properties to be overridden in the expanded layout.
    //
    export function expandTemplateLayout(templateLayoutDoc: Doc, targetDoc?: Doc) {
        if (!WillExpandTemplateLayout(templateLayoutDoc, targetDoc) || !targetDoc) return templateLayoutDoc;

        const templateField = StrCast(templateLayoutDoc.isTemplateForField);  // the field that the template renders
        // First it checks if an expanded layout already exists -- if so it will be stored on the dataDoc
        // using the template layout doc's id as the field key.
        // If it doesn't find the expanded layout, then it makes a delegate of the template layout and
        // saves it on the data doc indexed by the template layout's id.
        //
        const layoutFielddKey = Doc.LayoutFieldKey(templateLayoutDoc);
        const expandedLayoutFieldKey = (templateField || layoutFielddKey) + "-layout[" + templateLayoutDoc[Id] + "]";
        let expandedTemplateLayout = targetDoc?.[expandedLayoutFieldKey];
        if (templateLayoutDoc.resolvedDataDoc instanceof Promise) {

            expandedTemplateLayout = undefined;
        } else if (templateLayoutDoc.resolvedDataDoc === Doc.GetDataDoc(targetDoc)) {
            expandedTemplateLayout = templateLayoutDoc;
        } else if (expandedTemplateLayout === undefined) {
            setTimeout(action(() => {
                if (!targetDoc[expandedLayoutFieldKey]) {
                    const newLayoutDoc = Doc.MakeDelegate(templateLayoutDoc, undefined, "[" + templateLayoutDoc.title + "]");
                    newLayoutDoc.expandedTemplate = targetDoc;
                    targetDoc[expandedLayoutFieldKey] = newLayoutDoc;
                    const dataDoc = Doc.GetDataDoc(targetDoc);
                    newLayoutDoc.resolvedDataDoc = dataDoc;
                    if (dataDoc[templateField] === undefined && templateLayoutDoc[templateField] instanceof List && Cast(templateLayoutDoc[templateField], listSpec(Doc), []).length) {
                        dataDoc[templateField] = ComputedField.MakeFunction(`ObjectField.MakeCopy(templateLayoutDoc["${templateField}"] as List)`, { templateLayoutDoc: Doc.name }, { templateLayoutDoc: templateLayoutDoc });
                    }
                }
            }), 0);
        }
        return expandedTemplateLayout instanceof Doc ? expandedTemplateLayout : undefined; // layout is undefined if the expandedTemplate is pending.
    }

    // if the childDoc is a template for a field, then this will return the expanded layout with its data doc.
    // otherwise, it just returns the childDoc
    export function GetLayoutDataDocPair(containerDoc: Doc, containerDataDoc: Opt<Doc>, childDoc: Doc) {
        const resolvedDataDoc = containerDataDoc === containerDoc || !containerDataDoc || (!childDoc.isTemplateDoc && !childDoc.isTemplateForField) ? undefined : containerDataDoc;
        return { layout: Doc.expandTemplateLayout(childDoc, resolvedDataDoc), data: resolvedDataDoc };
    }
    export function CreateDocumentExtensionForField(doc: Doc, fieldKey: string) {
        let proto: Doc | undefined = doc;
        while (proto && !Doc.IsPrototype(proto) && proto.proto) {
            proto = proto.proto;
        }
        let docExtensionForField = ((proto || doc)[fieldKey + "_ext"] as Doc);
        if (!docExtensionForField) {
            docExtensionForField = new Doc(doc[Id] + fieldKey, true);
            docExtensionForField.title = fieldKey + ".ext"; // courtesy field--- shouldn't be needed except maybe for debugging
            docExtensionForField.extendsDoc = doc; // this is used by search to map field matches on the extension doc back to the document it extends.
            docExtensionForField.extendsField = fieldKey; // this can be used by search to map matches on the extension doc back to the field that was extended.
            docExtensionForField.type = DocumentType.EXTENSION;
            (proto || doc)[fieldKey + "_ext"] = new PrefetchProxy(docExtensionForField);
        }
        return docExtensionForField;
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
                const field = ProxyField.WithoutProxy(() => doc[key]);
                if (field instanceof RefField) {
                    copy[key] = field;
                } else if (cfield instanceof ComputedField) {
                    copy[key] = ComputedField.MakeFunction(cfield.script.originalScript);
                } else if (field instanceof ObjectField) {
                    copy[key] = key.includes("layout[") && doc[key] instanceof Doc ? Doc.MakeCopy(doc[key] as Doc, false) : ObjectField.MakeCopy(field);
                } else if (field instanceof Promise) {
                    debugger; //This shouldn't happend...
                } else {
                    copy[key] = field;
                }
            }
        });

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
            const applied = ApplyTemplateTo(templateDoc, Doc.MakeDelegate(new Doc()), "layout", templateDoc.title + "(..." + _applyCount++ + ")");
            applied && (Doc.GetProto(applied).layout = applied.layout);
            return applied;
        }
        return undefined;
    }
    export function ApplyTemplateTo(templateDoc: Doc, target: Doc, targetKey: string, titleTarget: string | undefined) {
        if (!templateDoc) {
            target.layout = undefined;
            target._nativeWidth = undefined;
            target._nativeHeight = undefined;
            target.onClick = undefined;
            target.type = undefined;
            return;
        }

        if (!Doc.AreProtosEqual(target[targetKey] as Doc, templateDoc)) {
            titleTarget && (Doc.GetProto(target).title = titleTarget);
            Doc.GetProto(target)[targetKey] = new PrefetchProxy(templateDoc);
        }
        target.layoutKey = targetKey;
        return target;
    }

    //
    //  This function converts a generic field layout display into a field layout that displays a specific
    // metadata field indicated by the title of the template field (not the default field that it was rendering)
    //
    export function MakeMetadataFieldTemplate(templateField: Doc, templateDoc: Opt<Doc>): boolean {

        // find the metadata field key that this template field doc will display (indicated by its title)
        const metadataFieldKey = StrCast(templateField.title).replace(/^-/, "");

        // update the original template to mark it as a template
        templateField.isTemplateForField = metadataFieldKey;
        templateField.title = metadataFieldKey;

        // move any data that the template field had been rendering over to the template doc so that things will still be rendered
        // when the template field is adjusted to point to the new metadatafield key.
        // note 1: if the template field contained a list of documents, each of those documents will be converted to templates as well.
        // note 2: this will not overwrite any field that already exists on the template doc at the field key
        if (!templateDoc?.[metadataFieldKey] && templateField.data instanceof ObjectField) {
            Cast(templateField.data, listSpec(Doc), [])?.map(d => d instanceof Doc && MakeMetadataFieldTemplate(d, templateDoc));
            (Doc.GetProto(templateField)[metadataFieldKey] = ObjectField.MakeCopy(templateField.data));
        }
        if (templateField.data instanceof RichTextField && (templateField.data.Text || templateField.data.Data.toString().includes("dashField"))) {
            templateField._textTemplate = ComputedField.MakeFunction(`copyField(this.${metadataFieldKey})`, { this: Doc.name });
        }

        // get the layout string that the template uses to specify its layout
        const templateFieldLayoutString = StrCast(Doc.LayoutField(Doc.Layout(templateField)));

        // change itto render the target metadata field instead of what it was rendering before and assign it to the template field layout document.
        Doc.Layout(templateField).layout = templateFieldLayoutString.replace(/fieldKey={'[^']*'}/, `fieldKey={'${metadataFieldKey}'}`);

        // assign the template field doc a delegate of any extension document that was previously used to render the template field (since extension doc's carry rendering informatino)
        Doc.Layout(templateField)[metadataFieldKey + "_ext"] = Doc.MakeDelegate(templateField[templateFieldLayoutString?.split("'")[1] + "_ext"] as Doc);

        if (templateField.backgroundColor !== templateDoc?.defaultBackgroundColor) {
            templateField.defaultBackgroundColor = templateField.backgroundColor;
        }

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
    // a layout field.  In that case, all layout information comes from there unless overriden by Document  
    export function Layout(doc: Doc): Doc { return doc[LayoutSym] || doc; }
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
            return brushManager.BrushedDoc.has(doc) || brushManager.BrushedDoc.has(Doc.GetDataDoc(doc));
        })(doc);
    }
    // don't bother memoizing (caching) the result if called from a non-reactive context. (plus this avoids a warning message)
    export function IsBrushedDegreeUnmemoized(doc: Doc) {
        return brushManager.BrushedDoc.has(doc) ? 2 : brushManager.BrushedDoc.has(Doc.GetDataDoc(doc)) ? 1 : 0;
    }
    export function IsBrushedDegree(doc: Doc) {
        return computedFn(function IsBrushDegree(doc: Doc) {
            return brushManager.BrushedDoc.has(doc) ? 2 : brushManager.BrushedDoc.has(Doc.GetDataDoc(doc)) ? 1 : 0;
        })(doc);
    }
    export function BrushDoc(doc: Doc) {
        brushManager.BrushedDoc.set(doc, true);
        brushManager.BrushedDoc.set(Doc.GetDataDoc(doc), true);
        return doc;
    }
    export function UnBrushDoc(doc: Doc) {
        brushManager.BrushedDoc.delete(doc);
        brushManager.BrushedDoc.delete(Doc.GetDataDoc(doc));
        return doc;
    }


    export function LinkOtherAnchor(linkDoc: Doc, anchorDoc: Doc) { return Doc.AreProtosEqual(anchorDoc, Cast(linkDoc.anchor1, Doc) as Doc) ? Cast(linkDoc.anchor2, Doc) as Doc : Cast(linkDoc.anchor1, Doc) as Doc; }
    export function LinkEndpoint(linkDoc: Doc, anchorDoc: Doc) { return Doc.AreProtosEqual(anchorDoc, Cast(linkDoc.anchor1, Doc) as Doc) ? "layout_key1" : "layout_key2"; }

    export function linkFollowUnhighlight() {
        Doc.UnhighlightAll();
        document.removeEventListener("pointerdown", linkFollowUnhighlight);
    }

    let dt = 0;
    export function linkFollowHighlight(destDoc: Doc, dataAndDisplayDocs = true) {
        linkFollowUnhighlight();
        Doc.HighlightDoc(destDoc, dataAndDisplayDocs);
        document.removeEventListener("pointerdown", linkFollowUnhighlight);
        document.addEventListener("pointerdown", linkFollowUnhighlight);
        const x = dt = Date.now();
        window.setTimeout(() => dt === x && linkFollowUnhighlight(), 5000);
    }

    export class HighlightBrush {
        @observable HighlightedDoc: Map<Doc, boolean> = new Map();
    }
    const highlightManager = new HighlightBrush();
    export function IsHighlighted(doc: Doc) {
        return highlightManager.HighlightedDoc.get(doc) || highlightManager.HighlightedDoc.get(Doc.GetDataDoc(doc));
    }
    export function HighlightDoc(doc: Doc, dataAndDisplayDocs = true) {
        runInAction(() => {
            highlightManager.HighlightedDoc.set(doc, true);
            dataAndDisplayDocs && highlightManager.HighlightedDoc.set(Doc.GetDataDoc(doc), true);
        });
    }
    export function UnHighlightDoc(doc: Doc) {
        runInAction(() => {
            highlightManager.HighlightedDoc.set(doc, false);
            highlightManager.HighlightedDoc.set(Doc.GetDataDoc(doc), false);
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

    export function setChildLayout(target: Doc, source?: Doc) {
        target.childLayout = source && source.isTemplateDoc ? source : source &&
            source.dragFactory instanceof Doc && source.dragFactory.isTemplateDoc ? source.dragFactory :
            source && source.layout instanceof Doc && source.layout.isTemplateDoc ? source.layout : undefined;
    }
    export function setChildDetailedLayout(target: Doc, source?: Doc) {
        target.childDetailed = source && source.isTemplateDoc ? source : source &&
            source.dragFactory instanceof Doc && source.dragFactory.isTemplateDoc ? source.dragFactory :
            source && source.layout instanceof Doc && source.layout.isTemplateDoc ? source.layout : undefined;
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

    export function setNativeView(doc: any) {
        const prevLayout = StrCast(doc.layoutKey).split("_")[1];
        const deiconify = prevLayout === "icon" && StrCast(doc.deiconifyLayout) ? "layout_" + StrCast(doc.deiconifyLayout) : "";
        doc.deiconifyLayout = undefined;
        if (StrCast(doc.title).endsWith("_" + prevLayout)) doc.title = StrCast(doc.title).replace("_" + prevLayout, "");
        doc.layoutKey = deiconify || "layout";
    }
    export function setDocFilter(container: Doc, key: string, value: any, modifiers?: string) {
        const docFilters = Cast(container._docFilter, listSpec("string"), []);
        for (let i = 0; i < docFilters.length; i += 3) {
            if (docFilters[i] === key && docFilters[i + 1] === value) {
                docFilters.splice(i, 3);
                break;
            }
        }
        if (modifiers !== undefined) {
            docFilters.push(key);
            docFilters.push(value);
            docFilters.push(modifiers);
            container._docFilter = new List<string>(docFilters);
        }
    }
}

Scripting.addGlobal(function renameAlias(doc: any, n: any) { return StrCast(Doc.GetProto(doc).title).replace(/\([0-9]*\)/, "") + `(${n})`; });
Scripting.addGlobal(function getProto(doc: any) { return Doc.GetProto(doc); });
Scripting.addGlobal(function setChildLayout(target: any, source: any) { Doc.setChildLayout(target, source); });
Scripting.addGlobal(function setChildDetailedLayout(target: any, source: any) { Doc.setChildDetailedLayout(target, source); });
Scripting.addGlobal(function getAlias(doc: any) { return Doc.MakeAlias(doc); });
Scripting.addGlobal(function getCopy(doc: any, copyProto: any) { return doc.isTemplateDoc ? Doc.ApplyTemplate(doc) : Doc.MakeCopy(doc, copyProto); });
Scripting.addGlobal(function copyField(field: any) { return ObjectField.MakeCopy(field); });
Scripting.addGlobal(function aliasDocs(field: any) { return new List<Doc>(field.map((d: any) => Doc.MakeAlias(d))); });
Scripting.addGlobal(function docList(field: any) { return DocListCast(field); });
Scripting.addGlobal(function sameDocs(doc1: any, doc2: any) { return Doc.AreProtosEqual(doc1, doc2); });
Scripting.addGlobal(function setNativeView(doc: any) { Doc.setNativeView(doc); });
Scripting.addGlobal(function undo() { return UndoManager.Undo(); });
Scripting.addGlobal(function redo() { return UndoManager.Redo(); });
Scripting.addGlobal(function curPresentationItem() {
    const curPres = Doc.UserDoc().curPresentation as Doc;
    return curPres && DocListCast(curPres[Doc.LayoutFieldKey(curPres)])[NumCast(curPres._itemIndex)];
})
Scripting.addGlobal(function selectDoc(doc: any) { Doc.UserDoc().SelectedDocs = new List([doc]); });
Scripting.addGlobal(function selectedDocs(container: Doc, excludeCollections: boolean, prevValue: any) {
    const docs = DocListCast(Doc.UserDoc().SelectedDocs).filter(d => !Doc.AreProtosEqual(d, container) && !d.annotationOn && d.type !== DocumentType.DOCUMENT && d.type !== DocumentType.KVP && (!excludeCollections || !Cast(d.data, listSpec(Doc), null)));
    return docs.length ? new List(docs) : prevValue;
});
Scripting.addGlobal(function setDocFilter(container: Doc, key: string, value: any, modifiers?: string) { Doc.setDocFilter(container, key, value, modifiers); });