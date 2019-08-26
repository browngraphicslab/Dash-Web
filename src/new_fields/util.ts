import { UndoManager } from "../client/util/UndoManager";
import { Doc, Field, FieldResult, UpdatingFromServer, Permissions } from "./Doc";
import { SerializationHelper } from "../client/util/SerializationHelper";
import { ProxyField } from "./Proxy";
import { RefField } from "./RefField";
import { ObjectField } from "./ObjectField";
import { action } from "mobx";
import { Parent, OnUpdate, Update, Id, SelfProxy, Self, SetAcls, GetAcls, Public, SaveAcls } from "./FieldSymbols";
import { ComputedField } from "./ScriptField";
import { CurrentUserUtils } from "../server/authentication/models/current_user_utils";
import { StrCast } from "./Types";
import { DocServer } from "../client/DocServer";
import { NoEmitOnErrorsPlugin } from "webpack";

function _readOnlySetter(): never {
    throw new Error("Documents can't be modified in read-only mode");
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

export class PermissionsError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export function HasAddPlus(doc: any, users: string[], key?: string) {
    return HasPermission(doc, users, Permissions.ADDONLY, key) || HasPermission(doc, users, Permissions.WRITE, key);
}

export function HasPermission(doc: any, users: string[], permission: Permissions, key?: string) {
    let acls = doc ? doc.acls : undefined;
    if (acls) {
        if (!key) {
            return users.some(user => (acls[user] && acls[user]["*"] === permission));
        }
        else {
            return true;
        }
    }
    return false;
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
    if (prop === "acls") {
        Object.entries(value).forEach((val: [string, any]) => {
            let permissions = val[1];
            let keys = Object.keys(permissions);
            keys.forEach(k => {
                target[SetAcls](val[0], val[1][k], [k]);
            });
        });
        return true;
    }
    let acls = receiver[GetAcls]();
    if (acls && CurrentUserUtils.id) {
        if (!acls[CurrentUserUtils.id] && acls[Public]["*"] === Permissions.NONE) {
            return true;
        }
        let permissions = acls[CurrentUserUtils.id]["*"];
        let keyPermission = acls[CurrentUserUtils.id][prop];
        if (permissions === Permissions.ADDONLY || keyPermission === Permissions.ADDONLY) {
            if (receiver[prop]) {
                return true;
            }
        }
        else if ((permissions !== Permissions.WRITE) && (keyPermission !== Permissions.WRITE)) {
            return true;
        }
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
        if (value[Parent] && value[Parent] !== receiver) {
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
    const sameAuthor = fromServer || (receiver.author === CurrentUserUtils.email);
    const writeToDoc = sameAuthor || (writeMode !== DocServer.WriteMode.LiveReadonly);
    const writeToServer = sameAuthor || (writeMode === DocServer.WriteMode.Default);
    if (writeToDoc) {
        if (value === undefined) {
            delete target.__fields[prop];
        } else {
            target.__fields[prop] = value;
        }
        if (typeof value === "object" && !(value instanceof ObjectField)) debugger;
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
    }
    return true;
});

let _setter: (target: any, prop: string | symbol | number, value: any, receiver: any) => boolean = _setterImpl;

export function makeReadOnly() {
    _setter = _readOnlySetter;
}

export function makeEditable() {
    _setter = _setterImpl;
}

export function setter(target: any, prop: string | symbol | number, value: any, receiver: any): boolean {
    return _setter(target, prop, value, receiver);
}

export function getter(target: any, prop: string | symbol | number, receiver: any): any {
    if (prop === "then") {//If we're being awaited
        return undefined;
    }
    if (typeof prop === "symbol") {
        return target.__fields[prop] || target[prop];
    }
    if (prop === "acls") {
        return target.acls;
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
        if (proto instanceof Doc) {
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