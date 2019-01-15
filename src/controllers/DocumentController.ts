import { FieldController, Cast, Opt } from "./FieldController"
import { KeyController, KeyStore } from "./KeyController"
import { TypedEvent, Listener, Disposable } from "../util/TypedEvent";
import { DocumentUpdatedArgs, FieldUpdatedAction } from "./FieldUpdatedArgs";
import { ObservableMap } from "mobx";

export class DocumentController extends FieldController {
    private fields: ObservableMap<KeyController, FieldController> = new ObservableMap();

    GetField(key: KeyController, ignoreProto?: boolean): Opt<FieldController> {
        let field: Opt<FieldController>;
        if (ignoreProto) {
            if (this.fields.has(key)) {
                field = this.fields.get(key);
            }
        } else {
            let doc: Opt<DocumentController> = this;
            while (doc && !(doc.fields.has(key))) {
                doc = doc.GetPrototype();
            }

            if (doc) {
                field = doc.fields.get(key);
            }
        }

        return field;
    }

    GetFieldT<T extends FieldController = FieldController>(key: KeyController, ctor: { new(): T }, ignoreProto?: boolean): Opt<T> {
        return Cast(this.GetField(key, ignoreProto), ctor);
    }

    SetField(key: KeyController, field: Opt<FieldController>): void {
        if (field) {
            this.fields.set(key, field);
        } else {
            this.fields.delete(key);
        }
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