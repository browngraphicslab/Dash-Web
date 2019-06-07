import { UndoManager } from "../client/util/UndoManager";
import { Doc, Field } from "./Doc";
import { SerializationHelper } from "../client/util/SerializationHelper";
import { ProxyField } from "./Proxy";
import { FieldValue } from "./Types";
import { RefField } from "./RefField";
import { ObjectField } from "./ObjectField";
import { action } from "mobx";
import { Parent, OnUpdate, Update, Id } from "./FieldSymbols";
import { ComputedField } from "../fields/ScriptField";

export const setter = action(function (target: any, prop: string | symbol | number, value: any, receiver: any): boolean {
    if (SerializationHelper.IsSerializing()) {
        target[prop] = value;
        return true;
    }
    if (typeof prop === "symbol") {
        target[prop] = value;
        return true;
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
        //TODO Instead of target, maybe use target[Self]
        if (value[Parent] && value[Parent] !== target) {
            throw new Error("Can't put the same object in multiple documents at the same time");
        }
        value[Parent] = target;
        value[OnUpdate] = updateFunction(target, prop, value, receiver);
    }
    if (curValue instanceof ObjectField) {
        delete curValue[Parent];
        delete curValue[OnUpdate];
    }
    if (value === undefined) {
        delete target.__fields[prop];
    } else {
        target.__fields[prop] = value;
    }
    target[Update]({ '$set': { ["fields." + prop]: value instanceof ObjectField ? SerializationHelper.Serialize(value) : (value === undefined ? null : value) } });
    UndoManager.AddEvent({
        redo: () => receiver[prop] = value,
        undo: () => receiver[prop] = curValue
    });
    return true;
});

export function getter(target: any, prop: string | symbol | number, receiver: any): any {
    if (typeof prop === "symbol") {
        return target.__fields[prop] || target[prop];
    }
    if (SerializationHelper.IsSerializing()) {
        return target[prop];
    }
    return getField(target, prop);
}

export function getField(target: any, prop: string | number, ignoreProto: boolean = false): any {
    const field = target.__fields[prop];
    if (field instanceof ProxyField) {
        return field.value();
    }
    if (field instanceof ComputedField) {
        return field.value;
    }
    if (field === undefined && !ignoreProto && prop !== "proto") {
        const proto = getField(target, "proto", true);
        if (proto instanceof Doc) {
            return proto[prop];
        }
        return undefined;
    }
    return field;
}

export function deleteProperty(target: any, prop: string | number | symbol) {
    if (typeof prop === "symbol") {
        delete target[prop];
        return true;
    }
    target[prop] = undefined;
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