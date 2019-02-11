import { Utils } from "../Utils";
import { FIELD_ID, Field } from "../fields/Field";

export class Message<T> {
    private name: string;
    private guid: string;
    readonly ArgsCtor: new (...args: any) => T;

    get Name(): string {
        return this.name;
    }

    get Message(): string {
        return this.guid
    }

    constructor(name: string, ctor: new (...args: any) => T) {
        this.name = name;
        this.guid = Utils.GenerateDeterministicGuid(name)
        this.ArgsCtor = ctor;
    }

    GetValue() {
        return this.Name;
    }
}

class TestMessageArgs {
    hello: string = "";
}

export class SetFieldArgs {
    field: string;
    value: any;

    constructor(f: string, v: any) {
        this.field = f
        this.value = v
    }
}

export class GetFieldArgs {
    field: string;

    constructor(f: string) {
        this.field = f
    }
}

export namespace MessageStore {
    export const Foo = new Message("Foo", String);
    export const Bar = new Message("Bar", String);
    export const AddDocument = new Message("Add Document", TestMessageArgs);
    export const SetField = new Message("Set Field", SetFieldArgs)
    export const GetField = new Message("Get Field", GetFieldArgs)
}