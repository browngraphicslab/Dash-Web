import { UndoManager } from "../client/util/UndoManager";
import { Doc, FieldResult, UpdatingFromServer, LayoutSym, AclPrivate, AclEdit, AclReadonly, AclAddonly, AclSym, DataSym, DocListCast, AclAdmin, HeightSym, WidthSym, updateCachedAcls, AclUnset, DocListCastAsync, ForceServerWrite } from "./Doc";
import { SerializationHelper } from "../client/util/SerializationHelper";
import { ProxyField, PrefetchProxy } from "./Proxy";
import { RefField } from "./RefField";
import { ObjectField } from "./ObjectField";
import { action, trace, } from "mobx";
import { Parent, OnUpdate, Update, Id, SelfProxy, Self } from "./FieldSymbols";
import { DocServer } from "../client/DocServer";
import { ComputedField } from "./ScriptField";
import { ScriptCast, StrCast } from "./Types";
import { returnZero } from "../Utils";
import CursorField from "./CursorField";
import { List } from "./List";
import { SnappingManager } from "../client/util/SnappingManager";
import { computedFn } from "mobx-utils";

function _readOnlySetter(): never {
    throw new Error("Documents can't be modified in read-only mode");
}

const tracing = false;
export function TraceMobx() {
    tracing && trace();
}


export interface GetterResult {
    value: FieldResult;
    shouldReturn?: boolean;
}
export type GetterPlugin = (receiver: any, prop: string | number, currentValue: any) => GetterResult | undefined;
const getterPlugins: GetterPlugin[] = [];

export namespace Plugins {
    export function addGetterPlugin(plugin: GetterPlugin) {
        getterPlugins.push(plugin);
    }
}

const _setterImpl = action(function (target: any, prop: string | symbol | number, value: any, receiver: any): boolean {
    if (SerializationHelper.IsSerializing()) {
        target[prop] = value;
        return true;
    }

    if (typeof prop === "symbol") {
        target[prop] = value;
        return true;
    }
    if (value !== undefined) {
        value = value[SelfProxy] || value;
    }
    const curValue = target.__fields[prop];
    if (curValue === value || (curValue instanceof ProxyField && value instanceof RefField && curValue.fieldId === value[Id])) {
        // TODO This kind of checks correctly in the case that curValue is a ProxyField and value is a RefField, but technically
        // curValue should get filled in with value if it isn't already filled in, in case we fetched the referenced field some other way
        return true;
    }
    if (value instanceof RefField) {
        value = new ProxyField(value);
    }
    if (value instanceof ObjectField) {
        if (value[Parent] && value[Parent] !== receiver && !(value instanceof PrefetchProxy)) {
            throw new Error("Can't put the same object in multiple documents at the same time");
        }
        value[Parent] = receiver;
        value[OnUpdate] = updateFunction(target, prop, value, receiver);
    }
    if (curValue instanceof ObjectField) {
        delete curValue[Parent];
        delete curValue[OnUpdate];
    }

    const effectiveAcl = GetEffectiveAcl(target);

    const writeMode = DocServer.getFieldWriteMode(prop as string);
    const fromServer = target[UpdatingFromServer];
    const sameAuthor = fromServer || (receiver.author === Doc.CurrentUserEmail);
    const writeToDoc = sameAuthor || effectiveAcl === AclEdit || effectiveAcl === AclAdmin || (writeMode !== DocServer.WriteMode.LiveReadonly);
    const writeToServer = (sameAuthor || effectiveAcl === AclEdit || effectiveAcl === AclAdmin || writeMode === DocServer.WriteMode.Default) && !DocServer.Control.isReadOnly();// && !playgroundMode;

    if (writeToDoc) {
        if (value === undefined) {
            target.__fieldKeys && (delete target.__fieldKeys[prop]);
            delete target.__fields[prop];
        } else {
            target.__fieldKeys && (target.__fieldKeys[prop] = true);
            target.__fields[prop] = value;
        }
        //if (typeof value === "object" && !(value instanceof ObjectField)) debugger;

        if (writeToServer) {
            if (value === undefined) target[Update]({ '$unset': { ["fields." + prop]: "" } });
            else target[Update]({ '$set': { ["fields." + prop]: value instanceof ObjectField ? SerializationHelper.Serialize(value) : (value === undefined ? null : value) } });
        } else {
            DocServer.registerDocWithCachedUpdate(receiver, prop as string, curValue);
        }
        (!receiver[UpdatingFromServer] || receiver[ForceServerWrite]) && UndoManager.AddEvent({
            redo: () => receiver[prop] = value,
            undo: () => receiver[prop] = curValue
        });
        return true;
    }
    return false;
});

let _setter: (target: any, prop: string | symbol | number, value: any, receiver: any) => boolean = _setterImpl;

export function makeReadOnly() {
    _setter = _readOnlySetter;
}

export function makeEditable() {
    _setter = _setterImpl;
}

export function normalizeEmail(email: string) {
    return email.replace(/\./g, '__');
}
export function denormalizeEmail(email: string) {
    return email.replace(/__/g, '.');
}

// playground mode allows the user to add/delete documents or make layout changes without them saving to the server
// let playgroundMode = false;

// export function togglePlaygroundMode() {
//     playgroundMode = !playgroundMode;
// }

/**
 * These are the various levels of access a user can have to a document.
 * 
 * Admin: a user with admin access to a document can remove/edit that document, add/remove/edit annotations (depending on permissions), as well as change others' access rights to that document.
 * 
 * Edit: a user with edit access to a document can remove/edit that document, add/remove/edit annotations (depending on permissions), but not change any access rights to that document.
 * 
 * Add: a user with add access to a document can augment documents/annotations to that document but cannot edit or delete anything.
 * 
 * View: a user with view access to a document can only view it - they cannot add/remove/edit anything.
 * 
 * None: the document is not shared with that user.
 */
export enum SharingPermissions {
    Admin = "Admin",
    Edit = "Can Edit",
    Add = "Can Augment",
    View = "Can View",
    None = "Not Shared"
}

// return acl from cache or cache the acl and return.
const getEffectiveAclCache = computedFn(function (target: any, user?: string) { return getEffectiveAcl(target, user); }, true);

/**
 * Calculates the effective access right to a document for the current user.
 */
export function GetEffectiveAcl(target: any, user?: string): symbol {
    return !target ? AclPrivate :
        target[UpdatingFromServer] ? AclAdmin : getEffectiveAclCache(target, user);// all changes received from the server must be processed as Admin.  return this directly so that the acls aren't cached (UpdatingFromServer is not observable)
}

function getPropAcl(target: any, prop: string | symbol | number) {
    if (prop === UpdatingFromServer || target[UpdatingFromServer] || prop === AclSym) return AclAdmin;  // requesting the UpdatingFromServer prop or AclSym must always go through to keep the local DB consistent
    if (prop && DocServer.PlaygroundFields?.includes(prop.toString())) return AclEdit; // playground props are always editable
    return GetEffectiveAcl(target);
}

let HierarchyMapping: Map<symbol, number> | undefined;

function getEffectiveAcl(target: any, user?: string): symbol {
    const targetAcls = target[AclSym];
    const userChecked = user || Doc.CurrentUserEmail;    // if the current user is the author of the document / the current user is a member of the admin group
    if (userChecked === (target.__fields?.author || target.author)) return AclAdmin; // target may be a Doc of Proxy, so check __fields.author and .author
    if (SnappingManager.GetCachedGroupByName("Admin")) return AclAdmin;

    if (targetAcls && Object.keys(targetAcls).length) {
        HierarchyMapping = HierarchyMapping || new Map<symbol, number>([
            [AclPrivate, 0],
            [AclReadonly, 1],
            [AclAddonly, 2],
            [AclEdit, 3],
            [AclAdmin, 4]
        ]);

        let effectiveAcl = AclPrivate;
        for (const [key, value] of Object.entries(targetAcls)) {
            // there are issues with storing fields with . in the name, so they are replaced with _ during creation
            // as a result we need to restore them again during this comparison.
            const entity = denormalizeEmail(key.substring(4)); // an individual or a group
            if (HierarchyMapping.get(value as symbol)! > HierarchyMapping.get(effectiveAcl)!) {
                if (SnappingManager.GetCachedGroupByName(entity) || userChecked === entity) {
                    effectiveAcl = value as symbol;
                }
            }
        }

        // if there's an overriding acl set through the properties panel or sharing menu, that's what's returned if the user isn't an admin of the document
        const override = targetAcls["acl-Override"];
        if (override !== AclUnset && override !== undefined) effectiveAcl = override;

        // if we're in playground mode, return AclEdit (or AclAdmin if that's the user's effectiveAcl)
        return DocServer?.Control?.isReadOnly?.() && HierarchyMapping.get(effectiveAcl)! < 3 ? AclEdit : effectiveAcl;
    }
    return AclAdmin;
}
/**
 * Recursively distributes the access right for a user across the children of a document and its annotations.
 * @param key the key storing the access right (e.g. acl-groupname)
 * @param acl the access right being stored (e.g. "Can Edit")
 * @param target the document on which this access right is being set
 * @param inheritingFromCollection whether the target is being assigned rights after being dragged into a collection (and so is inheriting the acls from the collection)
 * inheritingFromCollection is not currently being used but could be used if acl assignment defaults change
 */
export function distributeAcls(key: string, acl: SharingPermissions, target: Doc, inheritingFromCollection?: boolean, visited?: Doc[]) {
    if (!visited) visited = [] as Doc[];
    if (visited.includes(target)) return;
    visited.push(target);

    const HierarchyMapping = new Map<string, number>([
        ["Not Shared", 0],
        ["Can View", 1],
        ["Can Augment", 2],
        ["Can Edit", 3],
        ["Admin", 4]
    ]);

    let layoutDocChanged = false; // determines whether fetchProto should be called or not (i.e. is there a change that should be reflected in target[AclSym])
    let dataDocChanged = false;
    const dataDoc = target[DataSym];

    // if it is inheriting from a collection, it only inherits if A) the key doesn't already exist or B) the right being inherited is more restrictive
    if (GetEffectiveAcl(target) === AclAdmin && (!inheritingFromCollection || !target[key] || HierarchyMapping.get(StrCast(target[key]))! > HierarchyMapping.get(acl)!)) {
        target[key] = acl;
        layoutDocChanged = true;
    }

    if (dataDoc && (!inheritingFromCollection || !dataDoc[key] || HierarchyMapping.get(StrCast(dataDoc[key]))! > HierarchyMapping.get(acl)!)) {

        if (GetEffectiveAcl(dataDoc) === AclAdmin) {
            dataDoc[key] = acl;
            dataDocChanged = true;
        }

        // maps over the aliases of the document
        const links = DocListCast(dataDoc.links);
        links.forEach(link => distributeAcls(key, acl, link, inheritingFromCollection, visited));

        // maps over the children of the document
        DocListCast(dataDoc[Doc.LayoutFieldKey(dataDoc)]).map(d => {
            // if (GetEffectiveAcl(d) === AclAdmin && (!inheritingFromCollection || !d[key] || HierarchyMapping.get(StrCast(d[key]))! > HierarchyMapping.get(acl)!)) {
            distributeAcls(key, acl, d, inheritingFromCollection, visited);
            // }
            const data = d[DataSym];
            if (data) {// && GetEffectiveAcl(data) === AclAdmin && (!inheritingFromCollection || !data[key] || HierarchyMapping.get(StrCast(data[key]))! > HierarchyMapping.get(acl)!)) {
                distributeAcls(key, acl, data, inheritingFromCollection, visited);
            }
        });

        // maps over the annotations of the document
        DocListCast(dataDoc[Doc.LayoutFieldKey(dataDoc) + "-annotations"]).map(d => {
            // if (GetEffectiveAcl(d) === AclAdmin && (!inheritingFromCollection || !d[key] || HierarchyMapping.get(StrCast(d[key]))! > HierarchyMapping.get(acl)!)) {
            distributeAcls(key, acl, d, inheritingFromCollection, visited);
            // }
            const data = d[DataSym];
            if (data) {// && GetEffectiveAcl(data) === AclAdmin && (!inheritingFromCollection || !data[key] || HierarchyMapping.get(StrCast(data[key]))! > HierarchyMapping.get(acl)!)) {
                distributeAcls(key, acl, data, inheritingFromCollection, visited);
            }
        });
    }

    layoutDocChanged && updateCachedAcls(target); // updates target[AclSym] when changes to acls have been made
    dataDocChanged && updateCachedAcls(dataDoc);
}

const layoutProps = ["panX", "panY", "width", "height", "nativeWidth", "nativeHeight", "fitWidth", "fitToBox",
    "chromeStatus", "viewType", "gridGap", "xMargin", "yMargin", "autoHeight"];
export function setter(target: any, in_prop: string | symbol | number, value: any, receiver: any): boolean {
    let prop = in_prop;
    const effectiveAcl = getPropAcl(target, prop);
    if (effectiveAcl !== AclEdit && effectiveAcl !== AclAdmin) return true;
    // if you're trying to change an acl but don't have Admin access / you're trying to change it to something that isn't an acceptable acl, you can't
    if (typeof prop === "string" && prop.startsWith("acl") && (effectiveAcl !== AclAdmin || ![...Object.values(SharingPermissions), undefined, "None"].includes(value))) return true;
    // if (typeof prop === "string" && prop.startsWith("acl") && !["Can Edit", "Can Augment", "Can View", "Not Shared", undefined].includes(value)) return true;

    if (typeof prop === "string" && prop !== "__id" && prop !== "__fields" && (prop.startsWith("_") || layoutProps.includes(prop))) {
        // if (!prop.startsWith("_")) {
        //     console.log(prop + " is deprecated - switch to _" + prop);
        //     prop = "_" + prop;
        // }
        if (!prop.startsWith("__")) prop = prop.substring(1);
        if (target.__LAYOUT__) {
            target.__LAYOUT__[prop] = value;
            return true;
        }
    }
    if (target.__fields[prop] instanceof ComputedField && target.__fields[prop].setterscript && value !== undefined && !(value instanceof ComputedField)) {
        return ScriptCast(target.__fields[prop])?.setterscript?.run({ self: target[SelfProxy], this: target[SelfProxy], value }).success ? true : false;
    }
    return _setter(target, prop, value, receiver);
}

export function getter(target: any, in_prop: string | symbol | number, receiver: any): any {
    let prop = in_prop;

    if (in_prop === AclSym) return target[AclSym];
    if (in_prop === "toString" || (in_prop !== HeightSym && in_prop !== WidthSym && in_prop !== LayoutSym && typeof prop === "symbol")) return target.__fields[prop] || target[prop];
    if (GetEffectiveAcl(target) === AclPrivate) return prop === HeightSym || prop === WidthSym ? returnZero : undefined;
    if (prop === LayoutSym) return target.__LAYOUT__;
    let search = false;
    if (typeof prop === "string" && prop !== "__id" && prop !== "__fields" && (prop.startsWith("_") || layoutProps.includes(prop))) {
        // if (!prop.startsWith("_")) {
        //     console.log(prop + " is deprecated - switch to _" + prop);
        //     prop = "_" + prop;
        // }
        if (!prop.startsWith("__")) search = true;
        if (target.__LAYOUT__) return target.__LAYOUT__[prop] ?? (search ? target.__LAYOUT__[prop.substring(1)] : undefined);
    }
    if (prop === "then") {//If we're being awaited
        return undefined;
    }
    if (typeof prop === "symbol") {
        return target.__fields[prop] || target[prop];
    }
    if (SerializationHelper.IsSerializing()) {
        return target[prop];
    }
    return getFieldImpl(target, prop, receiver) ?? (search ? getFieldImpl(target, (prop as any as string).substring(1), receiver) : undefined);
}

function getFieldImpl(target: any, prop: string | number, receiver: any, ignoreProto: boolean = false): any {
    receiver = receiver || target[SelfProxy];
    let field = target.__fields[prop];
    for (const plugin of getterPlugins) {
        const res = plugin(receiver, prop, field);
        if (res === undefined) continue;
        if (res.shouldReturn) {
            return res.value;
        } else {
            field = res.value;
        }
    }
    if (field === undefined && !ignoreProto && prop !== "proto") {
        const proto = getFieldImpl(target, "proto", receiver, true);//TODO tfs: instead of receiver we could use target[SelfProxy]... I don't which semantics we want or if it really matters
        if (proto instanceof Doc && GetEffectiveAcl(proto) !== AclPrivate) {
            return getFieldImpl(proto[Self], prop, receiver, ignoreProto);
        }
        return undefined;
    }
    return field;

}
export function getField(target: any, prop: string | number, ignoreProto: boolean = false): any {
    return getFieldImpl(target, prop, undefined, ignoreProto);
}

export function deleteProperty(target: any, prop: string | number | symbol) {
    if (typeof prop === "symbol") {
        delete target[prop];
        return true;
    }
    target[SelfProxy][prop] = undefined;
    return true;
}

export function updateFunction(target: any, prop: any, value: any, receiver: any) {
    let lastValue = ObjectField.MakeCopy(value);
    return (diff?: any) => {
        const op =
            diff?.op === "$addToSet" ? { '$addToSet': { ["fields." + prop]: SerializationHelper.Serialize(new List<Doc>(diff.items)) } } :
                diff?.op === "$remFromSet" ? { '$remFromSet': { ["fields." + prop]: SerializationHelper.Serialize(new List<Doc>(diff.items)) } }
                    : { '$set': { ["fields." + prop]: SerializationHelper.Serialize(value) } };
        !op.$set && ((op as any).length = diff.length);
        const prevValue = ObjectField.MakeCopy(lastValue as List<any>);
        lastValue = ObjectField.MakeCopy(value);
        const newValue = ObjectField.MakeCopy(value);

        if (!(value instanceof CursorField) && !(value?.some?.((v: any) => v instanceof CursorField))) {
            !receiver[UpdatingFromServer] && UndoManager.AddEvent(
                diff?.op === "$addToSet" ?
                    {
                        redo: () => {
                            receiver[prop].push(...diff.items.map((item: any) => item.value ? item.value() : item));
                            lastValue = ObjectField.MakeCopy(receiver[prop]);
                        },
                        undo: action(() => {
                            diff.items.forEach((item: any) => {
                                const ind = receiver[prop].indexOf(item.value ? item.value() : item);
                                ind !== -1 && receiver[prop].splice(ind, 1);
                            });
                            lastValue = ObjectField.MakeCopy(receiver[prop]);
                        })
                    } :
                    diff?.op === "$remFromSet" ?
                        {
                            redo: action(() => {
                                diff.items.forEach((item: any) => {
                                    const ind = receiver[prop].indexOf(item.value ? item.value() : item);
                                    ind !== -1 && receiver[prop].splice(ind, 1);
                                });
                                lastValue = ObjectField.MakeCopy(receiver[prop]);
                            }),
                            undo: () => {
                                diff.items.forEach((item: any) => {
                                    const ind = (prevValue as List<any>).indexOf(item.value ? item.value() : item);
                                    ind !== -1 && receiver[prop].indexOf(item.value ? item.value() : item) === -1 && receiver[prop].splice(ind, 0, item);
                                });
                                lastValue = ObjectField.MakeCopy(receiver[prop]);
                            }
                        }
                        : {
                            redo: () => {
                                receiver[prop] = ObjectField.MakeCopy(newValue as List<any>);
                                lastValue = ObjectField.MakeCopy(receiver[prop]);
                            },
                            undo: () => {
                                receiver[prop] = ObjectField.MakeCopy(prevValue as List<any>);
                                lastValue = ObjectField.MakeCopy(receiver[prop]);
                            }
                        });
        }
        target[Update](op);
    };
}