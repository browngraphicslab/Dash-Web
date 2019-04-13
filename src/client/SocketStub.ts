import { Key } from "../fields/Key";
import { Field, FieldId, Opt } from "../fields/Field";
import { ObservableMap } from "mobx";
import { Document } from "../fields/Document";
import { MessageStore, Transferable } from "../server/Message";
import { Utils } from "../Utils";
import { Server } from "./Server";
import { ServerUtils } from "../server/ServerUtil";


export interface FieldMap {
    [id: string]: Opt<Field>;
}

//TODO tfs: I think it might be cleaner to not have SocketStub deal with turning what the server gives it into Fields (in other words not call ServerUtils.FromJson), and leave that for the Server class.
export class SocketStub {

    static FieldStore: ObservableMap<FieldId, Field> = new ObservableMap();

    public static SEND_FIELD_REQUEST(fieldid: FieldId): Promise<Opt<Field>>;
    public static SEND_FIELD_REQUEST(fieldid: FieldId, callback: (field: Opt<Field>) => void): void;
    public static SEND_FIELD_REQUEST(fieldid: FieldId, callback?: (field: Opt<Field>) => void): Promise<Opt<Field>> | void {
        let fn = function (cb: (field: Opt<Field>) => void) {
            Utils.EmitCallback(Server.Socket, MessageStore.GetField, fieldid, (field: Transferable) => {
                if (field) {
                    ServerUtils.FromJson(field).init(cb);
                } else {
                    cb(undefined);
                }
            });
        };
        if (callback) {
            fn(callback);
        } else {
            return new Promise(fn);
        }
    }

    public static SEND_FIELDS_REQUEST(fieldIds: FieldId[], callback: (fields: FieldMap) => any) {
        Utils.EmitCallback(Server.Socket, MessageStore.GetFields, fieldIds, (fields: Transferable[]) => {
            let fieldMap: FieldMap = {};
            fields.map(field => fieldMap[field.id] = ServerUtils.FromJson(field));
            let proms = Object.values(fieldMap).map(val =>
                new Promise(resolve => val!.init(resolve)));
            Promise.all(proms).then(() => callback(fieldMap));
        });
    }

    public static SEND_DELETE_DOCUMENT_FIELD(doc: Document, key: Key) {
        // Send a request to delete the field stored under the specified key from the document

        // ...SOCKET(DELETE_DOCUMENT_FIELD, document id, key id)

        // Server removes the field id from the document's list of field proxies
        var document = this.FieldStore.get(doc.Id) as Document;
        if (document) {
            document._proxies.delete(key.Id);
        }
    }

    public static SEND_SET_FIELD(field: Field) {
        // Send a request to set the value of a field

        // ...SOCKET(SET_FIELD, field id, serialized field value)

        // Server updates the value of the field in its fieldstore
        Utils.Emit(Server.Socket, MessageStore.SetField, field.ToJson());
    }
}
