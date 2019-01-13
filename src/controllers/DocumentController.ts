import { FieldController, Cast, Opt } from "./FieldController"
import { KeyController, KeyStore } from "./KeyController"
import { TypedEvent, Listener, Disposable } from "../util/TypedEvent";
import { DocumentUpdatedArgs, FieldUpdatedAction } from "./FieldUpdatedArgs";

export class DocumentController extends FieldController {
    private fields: { [key: string]: { key: KeyController, field: FieldController, disposer: Disposable } } = {};
    private fieldUpdateHandlers: { [key: string]: TypedEvent<DocumentUpdatedArgs> } = {};

    GetField(key: KeyController, ignoreProto?: boolean): Opt<FieldController> {
        let field: Opt<FieldController>;
        if (ignoreProto) {
            if (key.Id in this.fields) {
                field = this.fields[key.Id].field;
            }
        } else {
            let doc: Opt<DocumentController> = this;
            while (doc && !(key.Id in doc.fields)) {
                doc = doc.GetPrototype();
            }

            if (doc) {
                field = doc.fields[key.Id].field;
            }
        }

        return field;
    }

    GetFieldT<T extends FieldController = FieldController>(key: KeyController, ctor: { new(): T }, ignoreProto?: boolean): Opt<T> {
        return Cast(this.GetField(key, ignoreProto), ctor);
    }

    SetField(key: KeyController, field: Opt<FieldController>): void {
        let oldField: Opt<FieldController>;
        if (key.Id in this.fields) {
            let old = this.fields[key.Id];
            oldField = old.field;
            old.disposer.dispose();
        }

        if (oldField === field) {
            return;
        }

        if (field == null) {
            delete this.fields[key.Id];
        } else {
            this.fields[key.Id] = {
                key: key,
                field: field,
                disposer: field.FieldUpdated.on((args) => this.DocumentFieldUpdated({
                    action: FieldUpdatedAction.Update,
                    oldValue: undefined,
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
            action: action
        })
    }

    SetFieldValue<T extends FieldController>(key: KeyController, value: any, ctor: { new(): T }): boolean {
        let field = this.GetField(key);
        if (field != null) {
            return field.TrySetValue(value);
        } else {
            field = new ctor();
            if (field.TrySetValue(value)) {
                this.SetField(key, field);
                return true;
            } else {
                return false;
            }
        }
    }

    GetPrototype(): Opt<DocumentController> {
        return this.GetFieldT(KeyStore.Prototype, DocumentController, true);
    }

    GetAllPrototypes(): DocumentController[] {
        let protos: DocumentController[] = [];
        let doc: Opt<DocumentController> = this;
        while (doc != null) {
            protos.push(doc);
            doc = doc.GetPrototype();
        }
        return protos;
    }

    MakeDelegate(): DocumentController {
        let delegate = new DocumentController();

        delegate.SetField(KeyStore.Prototype, this);

        return delegate;
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