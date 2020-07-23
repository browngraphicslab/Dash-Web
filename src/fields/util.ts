import { UndoManager } from "../client/util/UndoManager";
import { Doc, FieldResult, UpdatingFromServer, LayoutSym, AclPrivate, AclEdit, AclReadonly, AclAddonly, AclSym, fetchProto, DataSym, DocListCast } from "./Doc";
import { SerializationHelper } from "../client/util/SerializationHelper";
import { ProxyField, PrefetchProxy } from "./Proxy";
import { RefField } from "./RefField";
import { ObjectField } from "./ObjectField";
import { action, trace } from "mobx";
import { Parent, OnUpdate, Update, Id, SelfProxy, Self } from "./FieldSymbols";
import { DocServer } from "../client/DocServer";
import { ComputedField } from "./ScriptField";
import { ScriptCast, StrCast } from "./Types";
import { SharingPermissions } from "../client/util/SharingManager";


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
    //console.log("-set " + target[SelfProxy].title + "(" + target[SelfProxy][prop] + ")." + prop.toString() + " = " + value);
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
    const writeMode = DocServer.getFieldWriteMode(prop as string);
    const fromServer = target[UpdatingFromServer];
    const sameAuthor = fromServer || (receiver.author === Doc.CurrentUserEmail);
    const writeToDoc = sameAuthor || GetEffectiveAcl(target) === AclEdit || (writeMode !== DocServer.WriteMode.LiveReadonly);
    const writeToServer = (sameAuthor || GetEffectiveAcl(target) === AclEdit || writeMode === DocServer.WriteMode.Default) && !playgroundMode;

    if (writeToDoc) {
        if (value === undefined) {
            delete target.__fields[prop];
        } else {
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
export function OVERRIDE_ACL(val: boolean) {
    _overrideAcl = val;
}

let playgroundMode = false;

export function togglePlaygroundMode() {
    playgroundMode = !playgroundMode;
}

export function getPlaygroundMode() {
    return playgroundMode;
}

let currentUserGroups: string[] = [];

export function setGroups(groups: string[]) {
    currentUserGroups = groups;
}

export function GetEffectiveAcl(target: any, in_prop?: string | symbol | number): symbol {
    if (in_prop === UpdatingFromServer || target[UpdatingFromServer]) return AclEdit;

    if (target[AclSym] && Object.keys(target[AclSym]).length) {

        if (target.__fields?.author === Doc.CurrentUserEmail || target.author === Doc.CurrentUserEmail || currentUserGroups.includes("admin")) return AclEdit;

        if (_overrideAcl || (in_prop && DocServer.PlaygroundFields?.includes(in_prop.toString()))) return AclEdit;

        let effectiveAcl = AclPrivate;
        let aclPresent = false;

        const HierarchyMapping = new Map<symbol, number>([
            [AclPrivate, 0],
            [AclReadonly, 1],
            [AclAddonly, 2],
            [AclEdit, 3]
        ]);

        for (const [key, value] of Object.entries(target[AclSym])) {
            if (currentUserGroups.includes(key.substring(4)) || Doc.CurrentUserEmail === key.substring(4).replace("_", ".")) {
                if (HierarchyMapping.get(value as symbol)! >= HierarchyMapping.get(effectiveAcl)!) {
                    aclPresent = true;
                    effectiveAcl = value as symbol;
                    if (effectiveAcl === AclEdit) break;
                }
            }
        }
        return aclPresent ? effectiveAcl : AclEdit;
    }
    return AclEdit;
}

export function distributeAcls(key: string, acl: SharingPermissions, target: Doc, inheritingFromCollection?: boolean) {

    const HierarchyMapping = new Map<string, number>([
        ["Not Shared", 0],
        ["Can View", 1],
        ["Can Add", 2],
        ["Can Edit", 3]
    ]);

    const dataDoc = target[DataSym];

    if (!inheritingFromCollection || !target[key] || HierarchyMapping.get(StrCast(target[key]))! > HierarchyMapping.get(acl)!) target[key] = acl;

    if (dataDoc && (!inheritingFromCollection || !dataDoc[key] || HierarchyMapping.get(StrCast(dataDoc[key]))! > HierarchyMapping.get(acl)!)) {
        dataDoc[key] = acl;

        DocListCast(dataDoc[Doc.LayoutFieldKey(dataDoc)]).map(d => {
            if (d.author === Doc.CurrentUserEmail && (!inheritingFromCollection || !d[key] || HierarchyMapping.get(StrCast(d[key]))! > HierarchyMapping.get(acl)!)) {
                distributeAcls(key, acl, d);
                d[key] = acl;
            }
            const data = d[DataSym];
            if (data && data.author === Doc.CurrentUserEmail && (!inheritingFromCollection || !data[key] || HierarchyMapping.get(StrCast(data[key]))! > HierarchyMapping.get(acl)!)) {
                distributeAcls(key, acl, data);
                data[key] = acl;
            }
        });

        DocListCast(dataDoc[Doc.LayoutFieldKey(dataDoc) + "-annotations"]).map(d => {
            if (d.author === Doc.CurrentUserEmail && (!inheritingFromCollection || !d[key] || HierarchyMapping.get(StrCast(d[key]))! > HierarchyMapping.get(acl)!)) {
                distributeAcls(key, acl, d);
                d[key] = acl;
            }
            const data = d[DataSym];
            if (data && data.author === Doc.CurrentUserEmail && (!inheritingFromCollection || !data[key] || HierarchyMapping.get(StrCast(data[key]))! > HierarchyMapping.get(acl)!)) {
                distributeAcls(key, acl, data);
                data[key] = acl;
            }
        });
    }
}

const layoutProps = ["panX", "panY", "width", "height", "nativeWidth", "nativeHeight", "fitWidth", "fitToBox",
    "chromeStatus", "viewType", "gridGap", "xMargin", "yMargin", "autoHeight"];
export function setter(target: any, in_prop: string | symbol | number, value: any, receiver: any): boolean {
    let prop = in_prop;
    if (GetEffectiveAcl(target, in_prop) !== AclEdit) {
        return true;
    }

    if (typeof prop === "string" && prop.startsWith("ACL") && !["Can Edit", "Can Add", "Can View", "Not Shared", undefined].includes(value)) return true;

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
    if (in_prop === AclSym) return _overrideAcl ? undefined : target[AclSym];
    if (GetEffectiveAcl(target) === AclPrivate && !_overrideAcl) return undefined;
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
            UndoManager.AddEvent({
                redo() { receiver[prop] = newValue; },
                undo() { receiver[prop] = oldValue; }
            });
        }
        target[Update](diff);
    };
}