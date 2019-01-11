import { FieldController } from "./FieldController"
import { KeyController } from "./KeyController"
import { TypedEvent, Listener, Disposable } from "../util/TypedEvent";
import { DocumentUpdatedArgs, FieldUpdatedAction } from "./FieldUpdatedArgs";

export class DocumentController extends FieldController {
    private fields: { [key: string]: { key: KeyController, field: FieldController, disposer: Disposable } } = {};
    private fieldUpdateHandlers: { [key: string]: TypedEvent<DocumentUpdatedArgs> }

    GetField(key: KeyController): FieldController {
        if (key.Id in this.fields) {
            return this.fields[key.Id].field;
        }
        return null;
    }

    SetField(key: KeyController, field: FieldController): void {
        let oldField: FieldController = null;
        if (key.Id in this.fields) {
            let old = this.fields[key.Id];
            oldField = old.field;
            old.disposer.dispose();
        }

        if (oldField === field) {
            return;
        }

        if (field === null) {
            delete this.fields[key.Id];
        } else {
            this.fields[key.Id] = {
                key: key,
                field: field,
                disposer: field.FieldUpdated.on((args) => this.DocumentFieldUpdated({
                    action: FieldUpdatedAction.Update,
                    oldValue: null,
                    newValue: field,
                    field: this,
                    fieldArgs: args,
                    key: key
                }))
            }
        }

        let action = oldField === null ? FieldUpdatedAction.Add :
            (field === null ? FieldUpdatedAction.Remove :
                FieldUpdatedAction.Replace);

        this.DocumentFieldUpdated({
            field: this,
            key: key,
            oldValue: oldField,
            newValue: field,
            fieldArgs: null,
            action: action
        })
    }

    SetFieldValue<T extends FieldController>(key:KeyController, value:any, ctor: {new():T}) : boolean {
        let field = this.GetField(key);
        if(field !== null) {
            return field.TrySetValue(value);
        } else {
            field = new ctor();
            if(field.TrySetValue(value)) {
                this.SetField(key, field);
                return true;
            } else {
                return false;
            }
        }
    }

    private DocumentFieldUpdated(args: DocumentUpdatedArgs) {
        if (args.key.Id in this.fieldUpdateHandlers) {
            this.fieldUpdateHandlers[args.key.Id].emit(args);
        }
        this.FieldUpdated.emit(args);
    }

    AddFieldUpdatedHandler(key: KeyController, listener: Listener<DocumentUpdatedArgs>): Disposable {
        if (!(key.Id in this.fieldUpdateHandlers)) {
            this.fieldUpdateHandlers[key.Id] = new TypedEvent<DocumentUpdatedArgs>();
        }

        return this.fieldUpdateHandlers[key.Id].on(listener);
    }

    RemoveFieldUpdatedHandler(key: KeyController, listener: Listener<DocumentUpdatedArgs>) {
        if (key.Id in this.fieldUpdateHandlers) {
            this.fieldUpdateHandlers[key.Id].off(listener);
        }
    }

    TrySetValue(value: any): boolean {
        throw new Error("Method not implemented.");
    }
    GetValue() {
        throw new Error("Method not implemented.");
    }
    Copy(): FieldController {
        throw new Error("Method not implemented.");
    }


}