import { FieldController } from "./FieldController";
import { DocumentController } from "./DocumentController";
import { KeyController } from "./KeyController";

export enum FieldUpdatedAction {
    Add,
    Remove,
    Replace,
    Update
}

export interface FieldUpdatedArgs {
    field: FieldController;
    action: FieldUpdatedAction;
}

export interface DocumentUpdatedArgs {
    field: DocumentController;
    key: KeyController;

    oldValue: FieldController;
    newValue: FieldController;

    fieldArgs: FieldUpdatedArgs;

    action: FieldUpdatedAction;
}
