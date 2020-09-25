import { UndoManager } from "../client/util/UndoManager";
import { Doc, FieldResult, UpdatingFromServer, LayoutSym, AclPrivate, AclEdit, AclReadonly, AclAddonly, AclSym, CachedUpdates, DataSym, DocListCast, AclAdmin, FieldsSym, HeightSym, WidthSym, fetchProto, AclUnset } from "./Doc";
import { SerializationHelper } from "../client/util/SerializationHelper";
import { ProxyField, PrefetchProxy } from "./Proxy";
import { RefField } from "./RefField";
import { ObjectField } from "./ObjectField";
import { action, trace } from "mobx";
import { Parent, OnUpdate, Update, Id, SelfProxy, Self, HandleUpdate, ToString, ToScriptString } from "./FieldSymbols";
import { DocServer } from "../client/DocServer";
import { ComputedField } from "./ScriptField";
import { ScriptCast, StrCast } from "./Types";
import { returnZero } from "../Utils";
import CursorField from "./CursorField";
import { List } from "@material-ui/core";


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
        UndoManager.AddEvent({
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
var _overrideAcl = false;
export function OVERRIDE_acl(val: boolean) {
    _overrideAcl = val;
}

// playground mode allows the user to add/delete documents or make layout changes without them saving to the server
// let playgroundMode = false;

// export function togglePlaygroundMode() {
//     playgroundMode = !playgroundMode;
// }

// the list of groups that the current user is a member of 
let currentUserGroups: string[] = [];

// called from GroupManager once the groups have been fetched from the server
export function setGroups(groups: string[]) {
    currentUserGroups = groups;
}

/**
 * These are the various levels of access a user can have to a document.
 * 
 * Admin: a user with admin access to a document can remove/edit that document, add/remove/edit annotations (depending on permissions), as well as change others' access rights to that document.
 * 
 * Edit: a user with edit access to a document can remove/edit that document, add/remove/edit annotations (depending on permissions), but not change any access rights to that document.
 * 
 * Add: a user with add access to a document can add documents/annotations to that document but cannot edit or delete anything.
 * 
 * View: a user with view access to a document can only view it - they cannot add/remove/edit anything.
 * 
 * None: the document is not shared with that user.
 */
export enum SharingPermissions {
    Admin = "Admin",
    Edit = "Can Edit",
    Add = "Can Add",
    View = "Can View",
    None = "Not Shared"
}

/**
 * Calculates the effective access right to a document for the current user.
 */
export function GetEffectiveAcl(target: any, in_prop?: string | symbol | number, user?: string): symbol {
    if (!target) return AclPrivate;

    // all changes received fromt the server must be processed as Admin
    if (in_prop === UpdatingFromServer || target[UpdatingFromServer]) return AclAdmin;

    // if the current user is the author of the document / the current user is a member of the admin group
    const userChecked = user || Doc.CurrentUserEmail;
    if (userChecked === (target.__fields?.author || target.author)) return AclAdmin;
    if (currentUserGroups.includes("Admin")) return AclAdmin;


    if (target[AclSym] && Object.keys(target[AclSym]).length) {

        // if the acl is being overriden or the property being modified is one of the playground fields (which can be freely modified)
        if (_overrideAcl || (in_prop && DocServer.PlaygroundFields?.includes(in_prop.toString()))) return AclEdit;

        let effectiveAcl = AclPrivate;
        const HierarchyMapping = new Map<symbol, number>([
            [AclPrivate, 0],
            [AclReadonly, 1],
            [AclAddonly, 2],
            [AclEdit, 3],
            [AclAdmin, 4]
        ]);

        for (const [key, value] of Object.entries(target[AclSym])) {
            // there are issues with storing fields with . in the name, so they are replaced with _ during creation
            // as a result we need to restore them again during this comparison.
            const entity = key.substring(4).replace('_', '.'); // an individual or a group
            if (currentUserGroups.includes(entity) || userChecked === entity) {
                if (HierarchyMapping.get(value as symbol)! > HierarchyMapping.get(effectiveAcl)!) {
                    effectiveAcl = value as symbol;
                    if (effectiveAcl === AclAdmin) return effectiveAcl;
                }
            }
        }

        // if there's an overriding acl set through the properties panel or sharing menu, that's what's returned if the user isn't an admin of the document
        const override = target[AclSym]["acl-Override"];
        if (override !== AclUnset && override !== undefined) effectiveAcl = target[AclSym]["acl-Override"];

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
        ["Can Add", 2],
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

    layoutDocChanged && fetchProto(target); // updates target[AclSym] when changes to acls have been made
    dataDocChanged && fetchProto(dataDoc);
}

const layoutProps = ["panX", "panY", "width", "height", "nativeWidth", "nativeHeight", "fitWidth", "fitToBox",
    "chromeStatus", "viewType", "gridGap", "xMargin", "yMargin", "autoHeight"];
export function setter(target: any, in_prop: string | symbol | number, value: any, receiver: any): boolean {
    let prop = in_prop;
    const effectiveAcl = GetEffectiveAcl(target, in_prop);
    if (effectiveAcl !== AclEdit && effectiveAcl !== AclAdmin) return true;

    // if you're trying to change an acl but don't have Admin access / you're trying to change it to something that isn't an acceptable acl, you can't
    if (typeof prop === "string" && prop.startsWith("acl") && (effectiveAcl !== AclAdmin || ![...Object.values(SharingPermissions), undefined, "None"].includes(value))) return true;
    // if (typeof prop === "string" && prop.startsWith("acl") && !["Can Edit", "Can Add", "Can View", "Not Shared", undefined].includes(value)) return true;

    if (typeof prop === "string" && prop !== "__id" && prop !== "__fields" && (prop.startsWith("_") || layoutProps.includes(prop))) {
        if (!prop.startsWith("_")) {
            console.log(prop + " is deprecated - switch to _" + prop);
            prop = "_" + prop;
        }
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

    if (in_prop === "toString" || in_prop === ToString || in_prop === ToScriptString || in_prop === FieldsSym || in_prop === Id || in_prop === HandleUpdate || in_prop === CachedUpdates) return target.__fields[prop] || target[prop];
    if (in_prop === AclSym) return _overrideAcl ? undefined : target[AclSym];
    if (GetEffectiveAcl(target) === AclPrivate && !_overrideAcl) return prop === HeightSym || prop === WidthSym ? returnZero : undefined;
    if (prop === LayoutSym) {
        return target.__LAYOUT__;
    }
    if (typeof prop === "string" && prop !== "__id" && prop !== "__fields" && (prop.startsWith("_") || layoutProps.includes(prop))) {
        if (!prop.startsWith("_")) {
            console.log(prop + " is deprecated - switch to _" + prop);
            prop = "_" + prop;
        }
        if (target.__LAYOUT__) return target.__LAYOUT__[prop];
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
    return getFieldImpl(target, prop, receiver);
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
    let current = ObjectField.MakeCopy(value);
    return (diff?: any) => {
        if (true || !diff) {
            diff = { '$set': { ["fields." + prop]: SerializationHelper.Serialize(value) } };
            const oldValue = current;
            const newValue = ObjectField.MakeCopy(value);
            current = newValue;
            if (!(value instanceof CursorField) && !(value?.some?.((v: any) => v instanceof CursorField))) {
                UndoManager.AddEvent({
                    redo() { receiver[prop] = newValue; },
                    undo() { receiver[prop] = oldValue; }
                });
            }
        }
        target[Update](diff);
    };
}