import { UndoManager } from "../client/util/UndoManager";
import { Doc, Field, FieldResult, UpdatingFromServer } from "./Doc";
import { SerializationHelper } from "../client/util/SerializationHelper";
import { ProxyField, PrefetchProxy } from "./Proxy";
import { RefField } from "./RefField";
import { ObjectField } from "./ObjectField";
import { action, trace } from "mobx";
import { Parent, OnUpdate, Update, Id, SelfProxy, Self } from "./FieldSymbols";
import { DocServer } from "../client/DocServer";
import { props } from "bluebird";

function _readOnlySetter(): never {
    throw new Error("Documents can't be modified in read-only mode");
}

export function TraceMobx() {
    // trace();
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

let layoutProps = ["panX", "panY", "width", "height", "nativeWidth", "nativeHeight", "fitWidth", "fitToBox",
    "LODdisable", "chromeStatus", "viewType", "gridGap", "xMargin", "yMargin", "autoHeight"];
export function setter(target: any, in_prop: string | symbol | number, value: any, receiver: any): boolean {
    let prop = in_prop;
    if (typeof prop === "string" && prop !== "__id" && prop !== "__fields" &&
        ((prop as string).startsWith("_") || layoutProps.includes(prop))) {
        if (!prop.startsWith("_")) {
            console.log(prop + " is deprecated - switch to _" + prop);
            prop = "_" + prop;
        }
        const resolvedLayout = getFieldImpl(target, getFieldImpl(target, "layoutKey", receiver), receiver);
        if (resolvedLayout instanceof Doc) {
            let x = resolvedLayout[Id];
            let layout = (resolvedLayout.layout as string).split("'")[1];
            let expanded = getFieldImpl(target, layout + "-layout[" + x + "]", receiver);
            expanded && (expanded[prop] = value);
            // resolvedLayout[prop] = value;
            return true;
        }
    }
    return _setter(target, prop, value, receiver);
}

export function getter(target: any, in_prop: string | symbol | number, receiver: any): any {
    let prop = in_prop;
    if (typeof prop === "string" && prop !== "__id" && prop !== "__fields" &&
        ((prop as string).startsWith("_") || layoutProps.includes(prop))) {
        if (!prop.startsWith("_")) {
            console.log(prop + " is deprecated - switch to _" + prop);
            prop = "_" + prop;
        }
        const resolvedLayout = getFieldImpl(target, getFieldImpl(target, "layoutKey", receiver), receiver);
        if (resolvedLayout instanceof Doc) {
            let x = resolvedLayout[Id];
            let layout = (resolvedLayout.layout as string).split("'")[1];
            let expanded = getFieldImpl(target, layout + "-layout[" + x + "]", receiver);
            return (expanded || resolvedLayout)?.[prop];
            //return resolvedLayout[prop];
        }
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