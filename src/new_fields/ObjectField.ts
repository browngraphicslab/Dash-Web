import { RefField } from "./RefField";
import { OnUpdate, Parent, Copy, ToScriptString, ToString } from "./FieldSymbols";
import { Scripting } from "../client/util/Scripting";

export abstract class ObjectField {
    protected [OnUpdate](diff?: any) { }
    private [Parent]?: RefField | ObjectField;
    abstract [Copy](): ObjectField;

    abstract [ToScriptString](): string;
    abstract [ToString](): string;
}

export namespace ObjectField {
    export function MakeCopy<T extends ObjectField>(field: T) {
        return field?.[Copy]();
    }
}

Scripting.addGlobal(ObjectField);