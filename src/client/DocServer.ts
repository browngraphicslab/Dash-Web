import * as OpenSocket from 'socket.io-client';
import { MessageStore } from "./../server/Message";
import { Opt } from '../new_fields/Doc';
import { Utils } from '../Utils';
import { SerializationHelper } from './util/SerializationHelper';
import { RefField, HandleUpdate } from '../new_fields/RefField';

export namespace DocServer {
    const _cache: { [id: string]: RefField | Promise<Opt<RefField>> } = {};
    const _socket = OpenSocket(`${window.location.protocol}//${window.location.hostname}:4321`);
    const GUID: string = Utils.GenerateGuid();

    export function prepend(extension: string): string {
        return window.location.origin + extension;
    }

    export function DeleteDatabase() {
        Utils.Emit(_socket, MessageStore.DeleteAll, {});
    }

    export async function GetRefField(id: string): Promise<Opt<RefField>> {
        let cached = _cache[id];
        if (cached === undefined) {
            const prom = Utils.EmitCallback(_socket, MessageStore.GetRefField, id).then(fieldJson => {
                const field = fieldJson === undefined ? fieldJson : SerializationHelper.Deserialize(fieldJson);
                if (field) {
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
                if (field) {
                    fieldMap[field.id] = SerializationHelper.Deserialize(field);
                }
            }
            return fieldMap;
        });
        requestedIds.forEach(id => _cache[id] = prom.then(fields => fields[id]));
        const fields = await prom;
        requestedIds.forEach(id => {
            const field = fields[id];
            if (field) {
                _cache[id] = field;
            } else {
                delete _cache[id];
            }
            map[id] = field;
        });
        const otherFields = await Promise.all(promises);
        waitingIds.forEach((id, index) => map[id] = otherFields[index]);
        return map;
    }

    export function UpdateField(id: string, diff: any) {
        Utils.Emit(_socket, MessageStore.UpdateField, { id, diff });
    }

    export function CreateField(initialState: any) {
        if (!("id" in initialState)) {
            throw new Error("Can't create a field on the server without an id");
        }
        Utils.Emit(_socket, MessageStore.CreateField, initialState);
    }

    function respondToUpdate(diff: any) {
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
                handler(diff);
            }
        };
        if (field instanceof Promise) {
            field.then(update);
        } else {
            update(field);
        }
    }

    function connected() {
        _socket.emit(MessageStore.Bar.Message, GUID);
    }

    Utils.AddServerHandler(_socket, MessageStore.Foo, connected);
    Utils.AddServerHandler(_socket, MessageStore.UpdateField, respondToUpdate);
}