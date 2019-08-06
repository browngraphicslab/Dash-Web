import { scriptingGlobal } from "../client/util/Scripting";
import { Deserializable } from "../client/util/SerializationHelper";
import { primitive, serializable, map, createSimpleSchema, list, object } from "serializr";
import { ObjectField } from "./ObjectField";
import { OnUpdate, Copy, ToScriptString } from "./FieldSymbols";
import { Permissions } from "./Doc";

export class AccessControlLocks {
    permission: Map<string, number>;

    constructor(initData?: readonly (readonly [string, number])[] | Map<string, number>) {
        this.permission = (initData instanceof Map) ? initData : new Map<string, number>(initData);
    }

    set(id: string, permissions: Permissions) {
        this.permission.set(id, permissions);
    }

    get(id: string) {
        return this.permission.get(id);
    }

    write(id: string): boolean { return this.permission.get(id) === Permissions.WRITE; }
    read(id: string): boolean { return this.permission.get(id) === Permissions.READ; }
    addOnly(id: string): boolean { return this.permission.get(id) === Permissions.ADDONLY; }
}