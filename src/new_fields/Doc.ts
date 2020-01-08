import { observable, ObservableMap, runInAction, action, untracked } from "mobx";
import { alias, map, serializable } from "serializr";
import { DocServer } from "../client/DocServer";
import { DocumentType } from "../client/documents/DocumentTypes";
import { Scripting, scriptingGlobal } from "../client/util/Scripting";
import { afterDocDeserialize, autoObject, Deserializable, SerializationHelper } from "../client/util/SerializationHelper";
import { Copy, HandleUpdate, Id, OnUpdate, Parent, Self, SelfProxy, ToScriptString, Update } from "./FieldSymbols";
import { List } from "./List";
import { ObjectField } from "./ObjectField";
import { PrefetchProxy, ProxyField } from "./Proxy";
import { FieldId, RefField } from "./RefField";
import { listSpec } from "./Schema";
import { ComputedField } from "./ScriptField";
import { BoolCast, Cast, FieldValue, NumCast, PromiseValue, StrCast, ToConstructor } from "./Types";
import { deleteProperty, getField, getter, makeEditable, makeReadOnly, setter, updateFunction } from "./util";
import { intersectRect } from "../Utils";
import { UndoManager } from "../client/util/UndoManager";
import { computedFn } from "mobx-utils";

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

    @serializable(alias("fields", map(autoObject(), { afterDeserialize: afterDocDeserialize })))
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

    private [UpdatingFromServer]: boolean = false;

    private [Update] = (diff: any) => {
        if (this[UpdatingFromServer]) {
            return;
        }
        DocServer.UpdateField(this[Id], diff);
    }

    private [Self] = this;
    private [SelfProxy]: any;
    public [WidthSym] = () => NumCast(this[SelfProxy].width);
    public [HeightSym] = () => NumCast(this[SelfProxy].height);

    [ToScriptString]() {
        return "invalid";
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
    export function MakeAlias(doc: Doc) {
        const alias = !GetT(doc, "isPrototype", "boolean", true) ? Doc.MakeCopy(doc) : Doc.MakeDelegate(doc);
        if (alias.layout instanceof Doc) {
            alias.layout = Doc.MakeAlias(alias.layout);
        }
        const aliasNumber = Doc.GetProto(doc).aliasNumber = NumCast(Doc.GetProto(doc).aliasNumber) + 1;
        alias.title = ComputedField.MakeFunction(`renameAlias(this, ${aliasNumber})`);
        return alias;
    }

    //
    // Determines whether the combination of the layoutDoc and dataDoc represents
    // a template relationship.  If so, the layoutDoc will be expanded into a new
    // document that inherits the properties of the original layout while allowing
    // for individual layout properties to be overridden in the expanded layout.
    //
    export function WillExpandTemplateLayout(layoutDoc: Doc, dataDoc?: Doc) {
        return BoolCast(layoutDoc.isTemplateField) && dataDoc && layoutDoc !== dataDoc && !(layoutDoc[StrCast(layoutDoc.layoutKey, "layout")] instanceof Doc);
    }

    //
    // Returns an expanded template layout for a target data document.
    // First it checks if an expanded layout already exists -- if so it will be stored on the dataDoc
    // using the template layout doc's id as the field key.
    // If it doesn't find the expanded layout, then it makes a delegate of the template layout and
    // saves it on the data doc indexed by the template layout's id
    //
    export function expandTemplateLayout(templateLayoutDoc: Doc, dataDoc?: Doc) {
        if (!WillExpandTemplateLayout(templateLayoutDoc, dataDoc) || !dataDoc) return templateLayoutDoc;
        // if we have a data doc that doesn't match the layout, then we're rendering a template.
        // ... which means we change the layout to be an expanded view of the template layout.  
        // This allows the view override the template's properties and be referenceable as its own document.

        const expandedLayoutFieldKey = "Layout[" + templateLayoutDoc[Id] + "]";
        const expandedTemplateLayout = dataDoc[expandedLayoutFieldKey];
        if (expandedTemplateLayout instanceof Doc) {
            return expandedTemplateLayout;
        }
        if (expandedTemplateLayout === undefined) {
            setTimeout(() => dataDoc[expandedLayoutFieldKey] === undefined &&
                (dataDoc[expandedLayoutFieldKey] = Doc.MakeDelegate(templateLayoutDoc, undefined, "[" + templateLayoutDoc.title + "]")), 0);
        }
        return undefined; // use the templateLayout when it's not a template or the expandedTemplate is pending.
    }

    export function GetLayoutDataDocPair(doc: Doc, dataDoc: Doc | undefined, fieldKey: string, childDocLayout: Doc) {
        let layoutDoc: Doc | undefined = childDocLayout;
        const resolvedDataDoc = !doc.isTemplateField && dataDoc !== doc && dataDoc ? Doc.GetDataDoc(dataDoc) : undefined;
        if (resolvedDataDoc && Doc.WillExpandTemplateLayout(childDocLayout, resolvedDataDoc)) {
            const extensionDoc = fieldExtensionDoc(resolvedDataDoc, StrCast(childDocLayout.templateField, StrCast(childDocLayout.title)));
            layoutDoc = Doc.expandTemplateLayout(childDocLayout, extensionDoc !== resolvedDataDoc ? extensionDoc : undefined);
        } else layoutDoc = childDocLayout;
        return { layout: layoutDoc, data: resolvedDataDoc };
    }

    //
    // Resolves a reference to a field by returning 'doc' if no field extension is specified,
    // otherwise, it returns the extension document stored in doc.<fieldKey>_ext.
    // This mechanism allows any fields to be extended with an extension document that can
    // be used to capture field-specific metadata.  For example, an image field can be extended
    // to store annotations, ink, and other data.
    //
    export function fieldExtensionDoc(doc: Doc, fieldKey: string) {
        const extension = doc[fieldKey + "_ext"];
        if (extension === undefined) {
            setTimeout(() => CreateDocumentExtensionForField(doc, fieldKey), 0);
        }
        return extension ? extension as Doc : undefined;
    }
    export function fieldExtensionDocSync(doc: Doc, fieldKey: string) {
        return (doc[fieldKey + "_ext"] as Doc) || CreateDocumentExtensionForField(doc, fieldKey);
    }

    export function CreateDocumentExtensionForField(doc: Doc, fieldKey: string) {
        const docExtensionForField = new Doc(doc[Id] + fieldKey, true);
        docExtensionForField.title = fieldKey + ".ext"; // courtesy field--- shouldn't be needed except maybe for debugging
        docExtensionForField.extendsDoc = doc; // this is used by search to map field matches on the extension doc back to the document it extends.
        docExtensionForField.extendsField = fieldKey; // this can be used by search to map matches on the extension doc back to the field that was extended.
        docExtensionForField.type = DocumentType.EXTENSION;
        let proto: Doc | undefined = doc;
        while (proto && !Doc.IsPrototype(proto) && proto.proto) {
            proto = proto.proto;
        }
        (proto ? proto : doc)[fieldKey + "_ext"] = new PrefetchProxy(docExtensionForField);
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
        Object.keys(doc).forEach(key => {
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
                    copy[key] = ObjectField.MakeCopy(field);
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
            const applied = ApplyTemplateTo(templateDoc, Doc.MakeDelegate(new Doc()), "layoutCustom", templateDoc.title + "(..." + _applyCount++ + ")");
            applied && (Doc.GetProto(applied).layout = applied.layout);
            return applied;
        }
        return undefined;
    }
    export function ApplyTemplateTo(templateDoc: Doc, target: Doc, targetKey: string, titleTarget: string | undefined = undefined) {
        if (!templateDoc) {
            target.layout = undefined;
            target.nativeWidth = undefined;
            target.nativeHeight = undefined;
            target.onClick = undefined;
            target.type = undefined;
            return;
        }

        const layoutCustomLayout = Doc.MakeDelegate(templateDoc);

        titleTarget && (Doc.GetProto(target).title = titleTarget);
        Doc.GetProto(target).type = DocumentType.TEMPLATE;
        target.onClick = templateDoc.onClick instanceof ObjectField && templateDoc.onClick[Copy]();

        Doc.GetProto(target)[targetKey] = layoutCustomLayout;
        target.layoutKey = targetKey;
        return target;
    }

    export function MakeMetadataFieldTemplate(fieldTemplate: Doc, templateDataDoc: Doc, suppressTitle: boolean = false): boolean {
        // move data doc fields to layout doc as needed (nativeWidth/nativeHeight, data, ??)
        const metadataFieldName = StrCast(fieldTemplate.title).replace(/^-/, "");
        let fieldLayoutDoc = fieldTemplate;
        if (fieldTemplate.layout instanceof Doc) {
            fieldLayoutDoc = Doc.MakeDelegate(fieldTemplate.layout);
        }

        fieldTemplate.templateField = metadataFieldName;
        fieldTemplate.title = metadataFieldName;
        fieldTemplate.isTemplateField = true;
        /* move certain layout properties from the original data doc to the template layout to avoid
           inheriting them from the template's data doc which may also define these fields for its own use.
        */
        fieldTemplate.ignoreAspect = fieldTemplate.ignoreAspect === undefined ? undefined : BoolCast(fieldTemplate.ignoreAspect);
        fieldTemplate.singleColumn = BoolCast(fieldTemplate.singleColumn);
        fieldTemplate.nativeWidth = Cast(fieldTemplate.nativeWidth, "number");
        fieldTemplate.nativeHeight = Cast(fieldTemplate.nativeHeight, "number");
        fieldTemplate.type = fieldTemplate.type;
        fieldTemplate.panX = 0;
        fieldTemplate.panY = 0;
        fieldTemplate.scale = 1;
        fieldTemplate.showTitle = suppressTitle ? undefined : "title";
        const data = fieldTemplate.data;
        // setTimeout(action(() => {
        !templateDataDoc[metadataFieldName] && data instanceof ObjectField && (Doc.GetProto(templateDataDoc)[metadataFieldName] = ObjectField.MakeCopy(data));
        const layout = StrCast(fieldLayoutDoc.layout).replace(/fieldKey={'[^']*'}/, `fieldKey={'${metadataFieldName}'}`);
        const layoutDelegate = Doc.Layout(fieldTemplate);
        layoutDelegate.layout = layout;
        fieldTemplate.layout = layoutDelegate !== fieldTemplate ? layoutDelegate : layout;
        if (fieldTemplate.backgroundColor !== templateDataDoc.defaultBackgroundColor) fieldTemplate.defaultBackgroundColor = fieldTemplate.backgroundColor;
        fieldTemplate.proto = templateDataDoc;
        // }), 0);
        return true;
    }

    export function overlapping(doc1: Doc, doc2: Doc, clusterDistance: number) {
        const doc2Layout = Doc.Layout(doc2);
        const doc1Layout = Doc.Layout(doc1);
        const x2 = NumCast(doc2.x) - clusterDistance;
        const y2 = NumCast(doc2.y) - clusterDistance;
        const w2 = NumCast(doc2Layout.width) + clusterDistance;
        const h2 = NumCast(doc2Layout.height) + clusterDistance;
        const x = NumCast(doc1.x) - clusterDistance;
        const y = NumCast(doc1.y) - clusterDistance;
        const w = NumCast(doc1Layout.width) + clusterDistance;
        const h = NumCast(doc1Layout.height) + clusterDistance;
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
    export function Layout(doc: Doc) { return Doc.LayoutField(doc) instanceof Doc ? doc[StrCast(doc.layoutKey, "layout")] as Doc : doc; }
    export function LayoutField(doc: Doc) { return doc[StrCast(doc.layoutKey, "layout")]; }
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
    export function LinkEndpoint(linkDoc: Doc, anchorDoc: Doc) { return Doc.AreProtosEqual(anchorDoc, Cast(linkDoc.anchor1, Doc) as Doc) ? "layoutKey1" : "layoutKey2"; }

    export function linkFollowUnhighlight() {
        Doc.UnhighlightAll();
        document.removeEventListener("pointerdown", linkFollowUnhighlight);
    }

    let dt = 0;
    export function linkFollowHighlight(destDoc: Doc) {
        linkFollowUnhighlight();
        Doc.HighlightDoc(destDoc);
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
    export function HighlightDoc(doc: Doc) {
        runInAction(() => {
            highlightManager.HighlightedDoc.set(doc, true);
            highlightManager.HighlightedDoc.set(Doc.GetDataDoc(doc), true);
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
}


Scripting.addGlobal(function renameAlias(doc: any, n: any) { return StrCast(Doc.GetProto(doc).title).replace(/\([0-9]*\)/, "") + `(${n})`; });
Scripting.addGlobal(function getProto(doc: any) { return Doc.GetProto(doc); });
Scripting.addGlobal(function setChildLayout(target: any, source: any) { Doc.setChildLayout(target, source); });
Scripting.addGlobal(function getAlias(doc: any) { return Doc.MakeAlias(doc); });
Scripting.addGlobal(function getCopy(doc: any, copyProto: any) { return doc.isTemplateDoc ? Doc.ApplyTemplate(doc) : Doc.MakeCopy(doc, copyProto); });
Scripting.addGlobal(function copyField(field: any) { return ObjectField.MakeCopy(field); });
Scripting.addGlobal(function aliasDocs(field: any) { return new List<Doc>(field.map((d: any) => Doc.MakeAlias(d))); });
Scripting.addGlobal(function docList(field: any) { return DocListCast(field); });
Scripting.addGlobal(function sameDocs(doc1: any, doc2: any) { return Doc.AreProtosEqual(doc1, doc2); });
Scripting.addGlobal(function undo() { return UndoManager.Undo(); });
Scripting.addGlobal(function redo() { return UndoManager.Redo(); });
Scripting.addGlobal(function selectDoc(doc: any) { Doc.UserDoc().SelectedDocs = new List([doc]); });
Scripting.addGlobal(function selectedDocs(container: Doc, excludeCollections: boolean, prevValue: any) {
    const docs = DocListCast(Doc.UserDoc().SelectedDocs).filter(d => !Doc.AreProtosEqual(d, container) && !d.annotationOn && d.type !== DocumentType.DOCUMENT && d.type !== DocumentType.KVP && (!excludeCollections || !Cast(d.data, listSpec(Doc), null)));
    return docs.length ? new List(docs) : prevValue;
});