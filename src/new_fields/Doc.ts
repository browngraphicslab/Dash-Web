import { observable, action } from "mobx";
import { serializable, primitive, map, alias, list, PropSchema, custom } from "serializr";
import { autoObject, SerializationHelper, Deserializable, afterDocDeserialize } from "../client/util/SerializationHelper";
import { DocServer } from "../client/DocServer";
import { setter, getter, getField, updateFunction, deleteProperty, makeEditable, makeReadOnly } from "./util";
import { Cast, ToConstructor, PromiseValue, FieldValue, NumCast, BoolCast, StrCast } from "./Types";
import { listSpec } from "./Schema";
import { ObjectField } from "./ObjectField";
import { RefField, FieldId } from "./RefField";
import { ToScriptString, SelfProxy, Parent, OnUpdate, Self, HandleUpdate, Update, Id } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";
import { List } from "./List";
import { DocumentType } from "../client/documents/Documents";
import { ComputedField } from "./ScriptField";

export namespace Field {
    export function toKeyValueString(doc: Doc, key: string): string {
        const onDelegate = Object.keys(doc).includes(key);

        let field = ComputedField.WithoutComputed(() => FieldValue(doc[key]));
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

export function DocListCast(field: FieldResult): Doc[] {
    return Cast(field, listSpec(Doc), []).filter(d => d instanceof Doc) as Doc[];
}

export const WidthSym = Symbol("Width");
export const HeightSym = Symbol("Height");

function fetchProto(doc: Doc) {
    const proto = doc.proto;
    if (proto instanceof Promise) {
        return proto;
    }
}

@scriptingGlobal
@Deserializable("doc", fetchProto).withFields(["id"])
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

    public async [HandleUpdate](diff: any) {
        const set = diff.$set;
        if (set) {
            for (const key in set) {
                if (!key.startsWith("fields.")) {
                    continue;
                }
                const value = await SerializationHelper.Deserialize(set[key]);
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
    export function MakeReadOnly(): { end(): void } {
        makeReadOnly();
        return {
            end() {
                makeEditable();
            }
        };
    }

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
    export async function SetInPlace(doc: Doc, key: string, value: Field | undefined, defaultProto: boolean) {
        let hasProto = doc.proto instanceof Doc;
        let onDeleg = Object.getOwnPropertyNames(doc).indexOf(key) !== -1;
        let onProto = hasProto && Object.getOwnPropertyNames(doc.proto).indexOf(key) !== -1;
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
        let r = (doc === other);
        let r2 = (doc.proto === other);
        let r3 = (other.proto === doc);
        let r4 = (doc.proto === other.proto && other.proto !== undefined);
        return r || r2 || r3 || r4;
    }

    // gets the document's prototype or returns the document if it is a prototype
    export function GetProto(doc: Doc) {
        return Doc.GetT(doc, "isPrototype", "boolean", true) ? doc : (doc.proto || doc);
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

    export function AddDocToList(target: Doc, key: string, doc: Doc, relativeTo?: Doc, before?: boolean, first?: boolean, allowDuplicates?: boolean) {
        if (target[key] === undefined) {
            Doc.GetProto(target)[key] = new List<Doc>();
        }
        let list = Cast(target[key], listSpec(Doc));
        if (list) {
            if (allowDuplicates !== true) {
                let pind = list.reduce((l, d, i) => d instanceof Doc && Doc.AreProtosEqual(d, doc) ? i : l, -1);
                if (pind !== -1) {
                    list.splice(pind, 1);
                }
            }
            if (first) list.splice(0, 0, doc);
            else {
                let ind = relativeTo ? list.indexOf(relativeTo) : -1;
                if (ind === -1) list.push(doc);
                else list.splice(before ? ind : ind + 1, 0, doc);
            }
        }
        return true;
    }

    //
    // Computes the bounds of the contents of a set of documents.
    //
    export function ComputeContentBounds(docList: Doc[]) {
        let bounds = docList.reduce((bounds, doc) => {
            var [sptX, sptY] = [NumCast(doc.x), NumCast(doc.y)];
            let [bptX, bptY] = [sptX + doc[WidthSym](), sptY + doc[HeightSym]()];
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            };
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: -Number.MAX_VALUE, b: -Number.MAX_VALUE });
        return bounds;
    }

    //
    // Resolves a reference to a field by returning 'doc' if field extension is specified,
    // otherwise, it returns the extension document stored in doc.<fieldKey>_ext.
    // This mechanism allows any fields to be extended with an extension document that can
    // be used to capture field-specific metadata.  For example, an image field can be extended
    // to store annotations, ink, and other data.
    //
    export function resolvedFieldDataDoc(doc: Doc, fieldKey: string, fieldExt: string) {
        return fieldExt && doc[fieldKey + "_ext"] instanceof Doc ? doc[fieldKey + "_ext"] as Doc : doc;
    }

    export function UpdateDocumentExtensionForField(doc: Doc, fieldKey: string) {
        let docExtensionForField = doc[fieldKey + "_ext"] as Doc;
        if (docExtensionForField === undefined) {
            setTimeout(() => {
                docExtensionForField = new Doc(doc[Id] + fieldKey, true);
                docExtensionForField.title = fieldKey + ".ext";
                docExtensionForField.extendsDoc = doc; // this is used by search to map field matches on the extension doc back to the document it extends.
                docExtensionForField.type = DocumentType.EXTENSION;
                let proto: Doc | undefined = doc;
                while (proto && !Doc.IsPrototype(proto)) {
                    proto = proto.proto;
                }
                (proto ? proto : doc)[fieldKey + "_ext"] = docExtensionForField;
            }, 0);
        } else if (doc instanceof Doc) { // backward compatibility -- add fields for docs that don't have them already
            docExtensionForField.extendsDoc === undefined && setTimeout(() => docExtensionForField.extendsDoc = doc, 0);
            docExtensionForField.type === undefined && setTimeout(() => docExtensionForField.type = DocumentType.EXTENSION, 0);
        }
    }
    export function MakeAlias(doc: Doc) {
        if (!GetT(doc, "isPrototype", "boolean", true)) {
            return Doc.MakeCopy(doc);
        }
        return Doc.MakeDelegate(doc); // bcz?
    }

    //
    // Determines whether the combination of the layoutDoc and dataDoc represents
    // a template relationship.  If so, the layoutDoc will be expanded into a new
    // document that inherits the properties of the original layout while allowing
    // for individual layout properties to be overridden in the expanded layout.
    //
    export function WillExpandTemplateLayout(layoutDoc: Doc, dataDoc?: Doc) {
        return BoolCast(layoutDoc.isTemplate) && dataDoc && layoutDoc !== dataDoc && !(layoutDoc.layout instanceof Doc);
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

        let expandedTemplateLayout = dataDoc[templateLayoutDoc[Id]];
        if (expandedTemplateLayout instanceof Doc) {
            return expandedTemplateLayout;
        }
        let expandedLayoutFieldKey = "Layout[" + templateLayoutDoc[Id] + "]";
        expandedTemplateLayout = dataDoc[expandedLayoutFieldKey];
        if (expandedTemplateLayout instanceof Doc) {
            return expandedTemplateLayout;
        }
        if (expandedTemplateLayout === undefined) {
            setTimeout(() =>
                dataDoc[expandedLayoutFieldKey] = Doc.MakeDelegate(templateLayoutDoc, undefined, templateLayoutDoc.title + ".layout"), 0);
        }
        return templateLayoutDoc; // use the templateLayout when it's not a template or the expandedTemplate is pending.
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
                } else if (field instanceof Promise) {
                    field.then(f => (copy[key] === undefined) && (copy[key] = f)); //TODO what should we do here?
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
        if (!templateDoc) return undefined;
        let otherdoc = new Doc();
        otherdoc.width = templateDoc[WidthSym]();
        otherdoc.height = templateDoc[HeightSym]();
        otherdoc.title = templateDoc.title + "(..." + _applyCount++ + ")";
        otherdoc.layout = Doc.MakeDelegate(templateDoc);
        otherdoc.miniLayout = StrCast(templateDoc.miniLayout);
        otherdoc.detailedLayout = otherdoc.layout;
        otherdoc.type = DocumentType.TEMPLATE;
        return otherdoc;
    }

    export function MakeTemplate(fieldTemplate: Doc, metaKey: string, proto: Doc) {
        // move data doc fields to layout doc as needed (nativeWidth/nativeHeight, data, ??)
        let backgroundLayout = StrCast(fieldTemplate.backgroundLayout);
        let fieldLayoutDoc = fieldTemplate;
        if (fieldTemplate.layout instanceof Doc) {
            fieldLayoutDoc = Doc.MakeDelegate(fieldTemplate.layout);
        }
        let layout = StrCast(fieldLayoutDoc.layout).replace(/fieldKey={"[^"]*"}/, `fieldKey={"${metaKey}"}`);
        if (backgroundLayout) {
            layout = StrCast(fieldLayoutDoc.layout).replace(/fieldKey={"[^"]*"}/, `fieldKey={"${metaKey}"} fieldExt={"annotations"}`);
            backgroundLayout = backgroundLayout.replace(/fieldKey={"[^"]*"}/, `fieldKey={"${metaKey}"}`);
        }
        let nw = Cast(fieldTemplate.nativeWidth, "number");
        let nh = Cast(fieldTemplate.nativeHeight, "number");

        let layoutDelegate = fieldTemplate.layout instanceof Doc ? fieldLayoutDoc : fieldTemplate;
        layoutDelegate.layout = layout;

        fieldTemplate.title = metaKey;
        fieldTemplate.templateField = metaKey;
        fieldTemplate.layout = layoutDelegate !== fieldTemplate ? layoutDelegate : layout;
        fieldTemplate.backgroundLayout = backgroundLayout;
        fieldTemplate.nativeWidth = nw;
        fieldTemplate.nativeHeight = nh;
        fieldTemplate.isTemplate = true;
        fieldTemplate.showTitle = "title";
        setTimeout(() => fieldTemplate.proto = proto);
    }

    export async function ToggleDetailLayout(d: Doc) {
        let miniLayout = await PromiseValue(d.miniLayout);
        let detailLayout = await PromiseValue(d.detailedLayout);
        d.layout !== miniLayout ? miniLayout && (d.layout = d.miniLayout) : detailLayout && (d.layout = detailLayout);
        if (d.layout === detailLayout) Doc.GetProto(d).nativeWidth = Doc.GetProto(d).nativeHeight = undefined;
    }
    export async function UseDetailLayout(d: Doc) {
        let miniLayout = await PromiseValue(d.miniLayout);
        let detailLayout = await PromiseValue(d.detailedLayout);
        if (miniLayout && d.layout === miniLayout && detailLayout) {
            d.layout = detailLayout;
            d.nativeWidth = d.nativeHeight = undefined;
        }
    }
}