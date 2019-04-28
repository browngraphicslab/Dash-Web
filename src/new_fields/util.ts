import { UndoManager } from "../client/util/UndoManager";
import { Update, Doc, Field } from "./Doc";
import { SerializationHelper } from "../client/util/SerializationHelper";
import { ProxyField } from "./Proxy";
import { FieldValue } from "./Types";
import { RefField, Id } from "./RefField";
import { ObjectField, Parent, OnUpdate } from "./ObjectField";

export function setter(target: any, prop: string | symbol | number, value: any, receiver: any): boolean {
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
        value[OnUpdate] = (diff?: any) => {
            if (!diff) diff = SerializationHelper.Serialize(value);
            target[Update]({ [prop]: diff });
        };
    }
    if (curValue instanceof ObjectField) {
        delete curValue[Parent];
        delete curValue[OnUpdate];
    }
    target.__fields[prop] = value;
    target[Update]({ ["fields." + prop]: value instanceof ObjectField ? SerializationHelper.Serialize(value) : (value === undefined ? null : value) });
    UndoManager.AddEvent({
        redo: () => receiver[prop] = value,
        undo: () => receiver[prop] = curValue
    });
    return true;
}

export function getter(target: any, prop: string | symbol | number, receiver: any): any {
    if (typeof prop === "symbol") {
        return target.__fields[prop] || target[prop];
    }
    if (SerializationHelper.IsSerializing()) {
        return target[prop];
    }
    return getField(target, prop);
}

export function getField(target: any, prop: string | number, ignoreProto: boolean = false, callback?: (field: Field | undefined) => void): any {
    const field = target.__fields[prop];
    if (field instanceof ProxyField) {
        return field.value(callback);
    }
    if (field === undefined && !ignoreProto) {
        const proto = getField(target, "proto", true);
        if (proto instanceof Doc) {
            let field = proto[prop];
            if (field instanceof Promise) {
                callback && field.then(callback);
                return undefined;
            } else {
                callback && callback(field);
                return field;
            }
        }
    }
    callback && callback(field);
    return field;
}
