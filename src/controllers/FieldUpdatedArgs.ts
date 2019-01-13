import { FieldController, Opt } from "./FieldController";
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

    oldValue: Opt<FieldController>;
    newValue: Opt<FieldController>;

    fieldArgs?: FieldUpdatedArgs;

    action: FieldUpdatedAction;
}
