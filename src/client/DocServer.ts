import * as OpenSocket from 'socket.io-client';
import { MessageStore } from "./../server/Message";
import { Opt } from '../new_fields/Doc';
import { Utils, emptyFunction } from '../Utils';
import { SerializationHelper } from './util/SerializationHelper';
import { RefField } from '../new_fields/RefField';
import { Id, HandleUpdate } from '../new_fields/FieldSymbols';

export namespace DocServer {
    let _cache: { [id: string]: RefField | Promise<Opt<RefField>> } = {};
    const _socket = OpenSocket(`${window.location.protocol}//${window.location.hostname}:4321`);
    const GUID: string = Utils.GenerateGuid();

    let _isReadOnly = false;
    export function makeReadOnly() {
        if (_isReadOnly) return;
        _isReadOnly = true;
        _CreateField = emptyFunction;
        _UpdateField = emptyFunction;
        _respondToUpdate = emptyFunction;
    }

    export function makeEditable() {
        if (!_isReadOnly) return;
        location.reload();
        // _isReadOnly = false;
        // _CreateField = _CreateFieldImpl;
        // _UpdateField = _UpdateFieldImpl;
        // _respondToUpdate = _respondToUpdateImpl;
        // _cache = {};
    }

    export function prepend(extension: string): string {
        return window.location.origin + extension;
    }

    export function DeleteDatabase() {
        Utils.Emit(_socket, MessageStore.DeleteAll, {});
    }

    export function DeleteDocument(id: string) {
        Utils.Emit(_socket, MessageStore.DeleteField, id);
    }

    export function DeleteDocuments(ids: string[]) {
        Utils.Emit(_socket, MessageStore.DeleteFields, ids);
    }

    export async function GetRefField(id: string): Promise<Opt<RefField>> {
        let cached = _cache[id];
        if (cached === undefined) {
            const prom = Utils.EmitCallback(_socket, MessageStore.GetRefField, id).then(async fieldJson => {
                const field = SerializationHelper.Deserialize(fieldJson);
                if (field !== undefined) {
                    await field.proto;
                    _cache[id] = field;
                } else {
                    delete _cache[id];
                }
                return field;
            });
            _cache[id] = prom;
            return prom;
        } else if (cached instanceof Promise) {
            return cached;
        } else {
            return cached;
        }
    }

    export async function GetRefFields(ids: string[]): Promise<{ [id: string]: Opt<RefField> }> {
        const requestedIds: string[] = [];
        const waitingIds: string[] = [];
        const promises: Promise<Opt<RefField>>[] = [];
        const map: { [id: string]: Opt<RefField> } = {};
        for (const id of ids) {
            const cached = _cache[id];
            if (cached === undefined) {
                requestedIds.push(id);
            } else if (cached instanceof Promise) {
                promises.push(cached);
                waitingIds.push(id);
            } else {
                map[id] = cached;
            }
        }
        const prom = Utils.EmitCallback(_socket, MessageStore.GetRefFields, requestedIds).then(fields => {
            const fieldMap: { [id: string]: RefField } = {};
            for (const field of fields) {
                if (field !== undefined) {
                    fieldMap[field.id] = SerializationHelper.Deserialize(field);
                }
            }

            return fieldMap;
        });
        requestedIds.forEach(id => _cache[id] = prom.then(fields => fields[id]));
        const fields = await prom;
        requestedIds.forEach(id => {
            const field = fields[id];
            if (field !== undefined) {
                _cache[id] = field;
            } else {
                delete _cache[id];
            }
            map[id] = field;
        });
        await Promise.all(requestedIds.map(async id => {
            const field = fields[id];
            if (field) {
                await (field as any).proto;
            }
        }));
        const otherFields = await Promise.all(promises);
        waitingIds.forEach((id, index) => map[id] = otherFields[index]);
        return map;
    }

    function _UpdateFieldImpl(id: string, diff: any) {
        if (id === updatingId) {
            return;
        }
        Utils.Emit(_socket, MessageStore.UpdateField, { id, diff });
    }

    let _UpdateField = _UpdateFieldImpl;

    export function UpdateField(id: string, diff: any) {
        _UpdateField(id, diff);
    }

    function _CreateFieldImpl(field: RefField) {
        _cache[field[Id]] = field;
        const initialState = SerializationHelper.Serialize(field);
        Utils.Emit(_socket, MessageStore.CreateField, initialState);
    }

    let _CreateField = _CreateFieldImpl;

    export function CreateField(field: RefField) {
        _CreateField(field);
    }

    let updatingId: string | undefined;
    function _respondToUpdateImpl(diff: any) {
        const id = diff.id;
        if (id === undefined) {
            return;
        }
        const field = _cache[id];
        const update = (f: Opt<RefField>) => {
            if (f === undefined) {
                return;
            }
            const handler = f[HandleUpdate];
            if (handler) {
                updatingId = id;
                handler.call(f, diff.diff);
                updatingId = undefined;
            }
        };
        if (field instanceof Promise) {
            field.then(update);
        } else {
            update(field);
        }
    }

    let _respondToUpdate = _respondToUpdateImpl;

    function respondToUpdate(diff: any) {
        _respondToUpdate(diff);
    }

    function connected() {
        _socket.emit(MessageStore.Bar.Message, GUID);
    }

    Utils.AddServerHandler(_socket, MessageStore.Foo, connected);
    Utils.AddServerHandler(_socket, MessageStore.UpdateField, respondToUpdate);
}