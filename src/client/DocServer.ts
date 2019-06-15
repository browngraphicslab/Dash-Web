import * as OpenSocket from 'socket.io-client';
import { MessageStore } from "./../server/Message";
import { Opt } from '../new_fields/Doc';
import { Utils, emptyFunction } from '../Utils';
import { SerializationHelper } from './util/SerializationHelper';
import { RefField } from '../new_fields/RefField';
import { Id, HandleUpdate } from '../new_fields/FieldSymbols';

export namespace DocServer {
    const _cache: { [id: string]: RefField | Promise<Opt<RefField>> } = {};
    const _socket = OpenSocket(`${window.location.protocol}//${window.location.hostname}:4321`);
    const GUID: string = Utils.GenerateGuid();

    export function makeReadOnly() {
        _CreateField = emptyFunction;
        _UpdateField = emptyFunction;
        _respondToUpdate = emptyFunction;
    }

    export function prepend(extension: string): string {
        return window.location.origin + extension;
    }

    export function DeleteDatabase() {
        Utils.Emit(_socket, MessageStore.DeleteAll, {});
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

    /**
     * Given a list of Doc GUIDs, this utility function will asynchronously attempt to fetch each document
     * associated with a given input id, first looking in the RefField cache and then communicating with
     * the server if the document was not found there.
     * 
     * @param ids the ids that map to the reqested documents
     */
    export async function GetRefFields(ids: string[]): Promise<{ [id: string]: Opt<RefField> }> {
        const requestedIds: string[] = [];
        const waitingIds: string[] = [];
        const promises: Promise<Opt<RefField>>[] = [];
        const map: { [id: string]: Opt<RefField> } = {};

        // 1) An initial pass through the cache to determine which documents need to be fetched,
        // which are already in the process of being fetched and which already exist in the
        // cache
        for (const id of ids) {
            const cached = _cache[id];

            if (cached === undefined) {
                // NOT CACHED => we'll have to send a request to the server
                requestedIds.push(id);
            } else if (cached instanceof Promise) {
                // BEING CACHED => someone else previously (likely recently) called GetRefFields,
                // and requested one of the documents I'm looking for. Shouldn't fetch again, just
                // wait until this promise is resolved (see the second to last line of the function)
                promises.push(cached);
                waitingIds.push(id);
            } else {
                // CACHED => great, let's just add it to the field map
                map[id] = cached;
            }
        }

        // 2) Synchronously, we emit a single callback to the server requesting the documents for the given ids.
        // This returns a promise, which, when resolved, indicates that all the JSON serialized versions of
        // the fields have been returned from the server
        const fieldsReceived: Promise<any> = Utils.EmitCallback(_socket, MessageStore.GetRefFields, requestedIds);

        // 3) When the serialized RefFields have been received, go head and begin deserializing them into objects.
        // Here, once deserialized, we also invoke .proto to 'load' the documents' prototypes, which ensures that all
        // future .proto calls won't have to go farther than the cache to get their actual value.
        const fieldsDeserialized = fieldsReceived.then(async fields => {
            const fieldMap: { [id: string]: RefField } = {};
            const deserializedFields: any = [];
            for (const field of fields) {
                if (field !== undefined) {
                    // deserialize
                    let deserialized: any = SerializationHelper.Deserialize(field);
                    fieldMap[field.id] = deserialized;
                    deserializedFields.push(deserialized.proto);
                }
            }
            // this actually handles the loeading of prototypes
            await Promise.all(deserializedFields);
            return fieldMap;
        });

        // 4) Here, for each of the documents we've requested *ourselves* (i.e. weren't promises or found in the cache)
        // we set the value at the field's id to a promise that will resolve to the field. 
        // When we find that promises exist at keys in the cache, THIS is where they were set, just by some other caller (method).
        requestedIds.forEach(id => _cache[id] = fieldsDeserialized.then(fields => fields[id]));

        // 5) At this point, all fields have a) been returned from the server and b) been deserialized into actual Field objects whose
        // prototype documents, if any, have also been fetched and cached.
        const fields = await fieldsDeserialized;

        // 6) With this confidence, we can now go through and update the cache at the ids of the fields that
        // we explicitly had to fetch. To finish it off, we add whatever value we've come up with for a given
        // id to the soon to be returned field mapping.
        requestedIds.forEach(id => {
            const field = fields[id];
            // either way, overwrite or delete any promises that we inserted as flags
            // to indicate that the field was in the process of being fetched. Now everything
            // should be an actual value within or entirely absent from the cache.
            if (field !== undefined) {
                _cache[id] = field;
            } else {
                delete _cache[id];
            }
            map[id] = field;
        });

        // 7) Those promises we encountered in the else if of 1), which represent
        // other callers having already submitted a request to the server for (a) document(s)
        // in which we're interested, must still be awaited so that we can return the proper
        // values for those as well. 
        //
        // Fortunately, those other callers will also hit their own version of 6) and clean up
        // the shared cache when these promises resolve, so all we have to do is...
        const otherCallersFetching = await Promise.all(promises);
        // ...extract the RefFields returned from the resolution of those promises and add them to our
        // own map.
        waitingIds.forEach((id, index) => map[id] = otherCallersFetching[index]);

        // Now, we return our completed mapping from all of the ids that were passed into the method
        // to their actual RefField | undefined values. This return value either becomes the input
        // argument to the caller's promise (i.e. GetRefFields.then(map => //do something with map...))
        // or it is the direct return result if the promise is awaited.
        return map;
    }

    let _UpdateField = (id: string, diff: any) => {
        if (id === updatingId) {
            return;
        }
        Utils.Emit(_socket, MessageStore.UpdateField, { id, diff });
    };

    export function UpdateField(id: string, diff: any) {
        _UpdateField(id, diff);
    }

    let _CreateField = (field: RefField) => {
        _cache[field[Id]] = field;
        const initialState = SerializationHelper.Serialize(field);
        Utils.Emit(_socket, MessageStore.CreateField, initialState);
    };

    export function CreateField(field: RefField) {
        _CreateField(field);
    }

    let updatingId: string | undefined;
    let _respondToUpdate = (diff: any) => {
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
    };
    function respondToUpdate(diff: any) {
        _respondToUpdate(diff);
    }

    function connected() {
        _socket.emit(MessageStore.Bar.Message, GUID);
    }

    Utils.AddServerHandler(_socket, MessageStore.Foo, connected);
    Utils.AddServerHandler(_socket, MessageStore.UpdateField, respondToUpdate);
}