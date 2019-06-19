import * as OpenSocket from 'socket.io-client';
import { MessageStore, Diff } from "./../server/Message";
import { Opt } from '../new_fields/Doc';
import { Utils, emptyFunction } from '../Utils';
import { SerializationHelper } from './util/SerializationHelper';
import { RefField } from '../new_fields/RefField';
import { Id, HandleUpdate } from '../new_fields/FieldSymbols';

/**
 * This class encapsulates the transfer and cross-client synchronization of
 * data stored only in documents (RefFields). In the process, it also
 * creates and maintains a cache of documents so that they can be accessed
 * more efficiently. Currently, there is no cache eviction scheme in place.
 * 
 * NOTE: while this class is technically abstracted to work with any [RefField], because
 * [Doc] instances are the only [RefField] we need / have implemented at the moment, the documentation
 * will treat all data used here as [Doc]s
 * 
 * Any time we want to write a new field to the database (via the server)
 * or update ourselves based on the server's update message, that occurs here
 */
export namespace DocServer {
    // a document cache for efficient document retrieval
    const _cache: { [id: string]: RefField | Promise<Opt<RefField>> } = {};
    // the handle / client side endpoint of the web socket (https://bit.ly/2TeALea for more info) connection established with the server 
    const _socket = OpenSocket(`${window.location.protocol}//${window.location.hostname}:4321`);
    // this client's distinct GUID created at initialization
    const GUID: string = Utils.GenerateGuid();
    // indicates whether or not a document is currently being udpated, and, if so, its id
    let updatingId: string | undefined;

    export namespace Util {

        /**
         * Whenever the server sends us its handshake message on our
         * websocket, we use the above function to return the handshake.
         */
        Utils.addServerHandler(_socket, MessageStore.Foo, onConnection);

        /**
         * This function emits a message (with this client's
         * unique GUID) to the server
         * indicating that this client has connected
         */
        function onConnection() {
            _socket.emit(MessageStore.Bar.Message, GUID);
        }

        /**
         * A convenience method. Prepends the full path (i.e. http://localhost:1050) to the
         * requested extension
         * @param extension the specified sub-path to append to the window origin
         */
        export function prepend(extension: string): string {
            return window.location.origin + extension;
        }

        /**
         * Emits a message to the server that wipes
         * all documents in the database.
         */
        export function deleteDatabase() {
            Utils.emit(_socket, MessageStore.DeleteAll, {});
        }

        /**
         * This disables this client's ability to write new fields,
         * update existing fields, and update and reflect the changes if
         * other clients update shared fields. Thus, the client can only read
         * a static snapshot of their workspaces
         * 
         * Currently this is conditionally called in MainView.tsx when analyzing
         * the document's url.
         */
        export function makeReadOnly() {
            // replaces default functionality with no-ops
            _createField = emptyFunction;
            _emitFieldUpdate = emptyFunction;
            _respondToUpdate = emptyFunction;
        }

    }

    // RETRIEVE DOCS FROM SERVER

    /**
     * Given a single Doc GUID, this utility function will asynchronously attempt to fetch the id's associated
     * field, first looking in the RefField cache and then communicating with
     * the server if the document has not been cached.
     * @param id the id of the requested document
     */
    export async function getRefField(id: string): Promise<Opt<RefField>> {
        // an initial pass through the cache to determine whether the document needs to be fetched,
        // is already in the process of being fetched or already exists in the
        // cache
        let cached = _cache[id];
        if (cached === undefined) {
            // NOT CACHED => we'll have to send a request to the server

            // synchronously, we emit a single callback to the server requesting the serialized (i.e. represented by a string)
            // field for the given ids. This returns a promise, which, when resolved, indicates the the JSON serialized version of
            // the field has been returned from the server
            const getSerializedField = Utils.emitCallback(_socket, MessageStore.GetRefField, id);

            // when the serialized RefField has been received, go head and begin deserializing it into an object.
            // Here, once deserialized, we also invoke .proto to 'load' the document's prototype, which ensures that all
            // future .proto calls on the Doc won't have to go farther than the cache to get their actual value.
            const deserializeField = getSerializedField.then(async fieldJson => {
                // deserialize
                const field = SerializationHelper.Deserialize(fieldJson);
                // either way, overwrite or delete any promises cached at this id (that we inserted as flags
                // to indicate that the field was in the process of being fetched). Now everything
                // should be an actual value within or entirely absent from the cache.
                if (field !== undefined) {
                    await field.proto;
                    _cache[id] = field;
                } else {
                    delete _cache[id];
                }
                return field;
            });
            // here, indicate that the document associated with this id is currently
            // being retrieved and cached
            _cache[id] = deserializeField;
            return deserializeField;
        } else if (cached instanceof Promise) {
            // BEING RETRIEVED AND CACHED => some other caller previously (likely recently) called GetRefField(s),
            // and requested the document I'm looking for. Shouldn't fetch again, just
            // return this promise which will resolve to the field itself (see 7)
            return cached;
        } else {
            // CACHED => great, let's just return the cached field we have
            return cached;
        }
    }

    /**
     * Given a list of Doc GUIDs, this utility function will asynchronously attempt to each id's associated
     * field, first looking in the RefField cache and then communicating with
     * the server if the document has not been cached.
     * @param ids the ids that map to the reqested documents
     */
    export async function getRefFields(ids: string[]): Promise<{ [id: string]: Opt<RefField> }> {
        const requestedIds: string[] = [];
        const waitingIds: string[] = [];
        const promises: Promise<Opt<RefField>>[] = [];
        const map: { [id: string]: Opt<RefField> } = {};

        // 1) an initial pass through the cache to determine which documents need to be fetched,
        // which are already in the process of being fetched and which already exist in the
        // cache
        for (const id of ids) {
            const cached = _cache[id];
            if (cached === undefined) {
                // NOT CACHED => we'll have to send a request to the server
                requestedIds.push(id);
            } else if (cached instanceof Promise) {
                // BEING RETRIEVED AND CACHED => some other caller previously (likely recently) called GetRefField(s),
                // and requested one of the documents I'm looking for. Shouldn't fetch again, just
                // wait until this promise is resolved (see 7)
                promises.push(cached);
                waitingIds.push(id);
            } else {
                // CACHED => great, let's just add it to the field map
                map[id] = cached;
            }
        }

        // 2) synchronously, we emit a single callback to the server requesting the serialized (i.e. represented by a string)
        // fields for the given ids. This returns a promise, which, when resolved, indicates that all the JSON serialized versions of
        // the fields have been returned from the server
        const getSerializedFields: Promise<any> = Utils.emitCallback(_socket, MessageStore.GetRefFields, requestedIds);

        // 3) when the serialized RefFields have been received, go head and begin deserializing them into objects.
        // Here, once deserialized, we also invoke .proto to 'load' the documents' prototypes, which ensures that all
        // future .proto calls on the Doc won't have to go farther than the cache to get their actual value.
        const deserializeFields = getSerializedFields.then(async fields => {
            const fieldMap: { [id: string]: RefField } = {};
            const protosToLoad: any = [];
            for (const field of fields) {
                if (field !== undefined) {
                    // deserialize
                    let deserialized: any = SerializationHelper.Deserialize(field);
                    fieldMap[field.id] = deserialized;
                    // adds to a list of promises that will be awaited asynchronously
                    protosToLoad.push(deserialized.proto);
                }
            }
            // this actually handles the loading of prototypes
            await Promise.all(protosToLoad);
            return fieldMap;
        });

        // 4) here, for each of the documents we've requested *ourselves* (i.e. weren't promises or found in the cache)
        // we set the value at the field's id to a promise that will resolve to the field. 
        // When we find that promises exist at keys in the cache, THIS is where they were set, just by some other caller (method).
        // The mapping in the .then call ensures that when other callers await these promises, they'll
        // get the resolved field
        requestedIds.forEach(id => _cache[id] = deserializeFields.then(fields => fields[id]));

        // 5) at this point, all fields have a) been returned from the server and b) been deserialized into actual Field objects whose
        // prototype documents, if any, have also been fetched and cached.
        const fields = await deserializeFields;

        // 6) with this confidence, we can now go through and update the cache at the ids of the fields that
        // we explicitly had to fetch. To finish it off, we add whatever value we've come up with for a given
        // id to the soon to be returned field mapping.
        requestedIds.forEach(id => {
            const field = fields[id];
            // either way, overwrite or delete any promises (that we inserted as flags
            // to indicate that the field was in the process of being fetched). Now everything
            // should be an actual value within or entirely absent from the cache.
            if (field !== undefined) {
                _cache[id] = field;
            } else {
                delete _cache[id];
            }
            map[id] = field;
        });

        // 7) those promises we encountered in the else if of 1), which represent
        // other callers having already submitted a request to the server for (a) document(s)
        // in which we're interested, must still be awaited so that we can return the proper
        // values for those as well. 
        //
        // fortunately, those other callers will also hit their own version of 6) and clean up
        // the shared cache when these promises resolve, so all we have to do is...
        const otherCallersFetching = await Promise.all(promises);
        // ...extract the RefFields returned from the resolution of those promises and add them to our
        // own map.
        waitingIds.forEach((id, index) => map[id] = otherCallersFetching[index]);

        // now, we return our completed mapping from all of the ids that were passed into the method
        // to their actual RefField | undefined values. This return value either becomes the input
        // argument to the caller's promise (i.e. GetRefFields.then(map => //do something with map...))
        // or it is the direct return result if the promise is awaited.
        return map;
    }

    // WRITE A NEW DOCUMENT TO THE SERVER

    /**
     * A wrapper around the function local variable _createField.
     * This allows us to swap in different executions while comfortably
     * calling the same function throughout the code base (such as in Util.makeReadonly())
     * @param field the [RefField] to be serialized and sent to the server to be stored in the database
     */
    export function createField(field: RefField) {
        _createField(field);
    }

    /**
     * The default behavior for field creation. This inserts the [Doc] instance
     * in the cache at its id, serializes the [Doc]'s initial state
     * and finally sends that seruialized data to the server.
     * @param field the [RefField] to be serialized and sent to the server to be stored in the database
     */
    let _createField = (field: RefField) => {
        _cache[field[Id]] = field;
        const initialState = SerializationHelper.Serialize(field);
        Utils.emit(_socket, MessageStore.CreateField, initialState);
    };

    // NOTIFY THE SERVER OF AN UPDATE TO A DOC'S STATE

    /**
     * A wrapper around the function local variable _emitFieldUpdate.
     * This allows us to swap in different executions while comfortably
     * calling the same function throughout the code base (such as in Util.makeReadonly())
     * @param id the id of the [Doc] whose state has been updated in our client
     * @param updatedState the new value of the document. At some point, this
     * should actually be a proper diff, to improve efficiency
     */
    export function emitFieldUpdate(id: string, updatedState: any) {
        _emitFieldUpdate(id, updatedState);
    }

    /**
     * The default behavior for indicating to the server that we've locally updated
     * a document.
     * @param id the id of the [Doc] whose state has been updated in our client
     * @param updatedState the new value of the document. At some point, this
     * should actually be a proper diff, to improve efficiency
     */
    let _emitFieldUpdate = (id: string, updatedState: any) => {
        // don't emit a duplicate message if the server is already
        // (asynchronously) still updating this document's state.
        if (id === updatingId) {
            return;
        }
        // creates the diff object to send to the server
        let diff: Diff = { id, diff: updatedState };
        // emit this diff to notify server
        Utils.emit(_socket, MessageStore.UpdateField, diff);
    };

    // RESPOND TO THE SERVER'S INDICATION THAT A DOC'S STATE HAS BEEN UPDATED

    /**
     * Whenever the client receives an update, execute the
     * current behavior.
     */
    Utils.addServerHandler(_socket, MessageStore.UpdateField, respondToUpdate);

    /**
     * A wrapper around the function local variable _respondToUpdate.
     * This allows us to swap in different executions while comfortably
     * calling the same function throughout the code base (such as in Util.makeReadonly())
     * @param diff kept as [any], but actually the [Diff] object sent from the server containing
     * the [Doc]'s id and its new state
     */
    function respondToUpdate(diff: any) {
        _respondToUpdate(diff);
    }

    /**
     * The default behavior for responding to another client's indication
     * that it has updated the state of a [Doc] that is also in use by
     * this client
     * @param diff kept as [any], but actually the [Diff] object sent from the server containing
     * the [Doc]'s id and its new state
     */
    let _respondToUpdate = (diff: any) => {
        const id = diff.id;
        // to be valid, the Diff object must reference
        // a document's id
        if (id === undefined) {
            return;
        }
        const update = (f: Opt<RefField>) => {
            // if the RefField is absent from the cache or
            // its promise in the cache resolves to undefined, there
            // can't be anything to update
            if (f === undefined) {
                return;
            }
            // extract this Doc's update handler
            const handler = f[HandleUpdate];
            if (handler) {
                // set the 'I'm currently updating this Doc' flag
                updatingId = id;
                handler.call(f, diff.diff);
                // reset to indicate no ongoing updates
                updatingId = undefined;
            }
        };
        // check the cache for the field
        const field = _cache[id];
        if (field instanceof Promise) {
            // if the field is still being retrieved, update when the promise is resolved
            field.then(update);
        } else {
            // otherwise, just execute the update
            update(field);
        }
    };

}