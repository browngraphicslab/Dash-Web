import { Field, Opt } from "./Field";
import { Document } from "./Document";
import { Key } from "./Key";

export enum FieldUpdatedAction {
    Add,
    Remove,
    Replace,
    Update
}

export interface FieldUpdatedArgs {
    field: Field;
    action: FieldUpdatedAction;
}

export interface DocumentUpdatedArgs {
    field: Document;
    key: Key;

    oldValue: Opt<Field>;
    newValue: Opt<Field>;

    fieldArgs?: FieldUpdatedArgs;

    action: FieldUpdatedAction;
}
