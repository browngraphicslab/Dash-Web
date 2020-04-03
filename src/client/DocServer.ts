import * as OpenSocket from 'socket.io-client';
import { MessageStore, YoutubeQueryTypes, GestureContent, MobileInkOverlayContent, UpdateMobileInkOverlayPositionContent, MobileDocumentUploadContent } from "./../server/Message";
import { Opt, Doc } from '../new_fields/Doc';
import { Utils, emptyFunction } from '../Utils';
import { SerializationHelper } from './util/SerializationHelper';
import { RefField } from '../new_fields/RefField';
import { Id, HandleUpdate } from '../new_fields/FieldSymbols';
import GestureOverlay from './views/GestureOverlay';
import MobileInkOverlay from '../mobile/MobileInkOverlay';

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
    let _cache: { [id: string]: RefField | Promise<Opt<RefField>> } = {};
    export let _socket: SocketIOClient.Socket;
    // this client's distinct GUID created at initialization
    let GUID: string;
    // indicates whether or not a document is currently being udpated, and, if so, its id

    export enum WriteMode {
        Default = 0, //Anything goes
        Playground = 1,
        LiveReadonly = 2,
        LivePlayground = 3,
    }

    export let AclsMode = WriteMode.Default;

    const fieldWriteModes: { [field: string]: WriteMode } = {};
    const docsWithUpdates: { [field: string]: Set<Doc> } = {};

    export function setFieldWriteMode(field: string, writeMode: WriteMode) {
        fieldWriteModes[field] = writeMode;
        if (writeMode !== WriteMode.Playground) {
            const docs = docsWithUpdates[field];
            if (docs) {
                docs.forEach(doc => Doc.RunCachedUpdate(doc, field));
                delete docsWithUpdates[field];
            }
        }
    }

    export function getFieldWriteMode(field: string) {
        return fieldWriteModes[field] || WriteMode.Default;
    }

    export function registerDocWithCachedUpdate(doc: Doc, field: string, oldValue: any) {
        let list = docsWithUpdates[field];
        if (!list) {
            list = docsWithUpdates[field] = new Set;
        }
        if (!list.has(doc)) {
            Doc.AddCachedUpdate(doc, field, oldValue);
            list.add(doc);
        }
    }

    export namespace Mobile {

        export function dispatchGesturePoints(content: GestureContent) {
            Utils.Emit(_socket, MessageStore.GesturePoints, content);
        }

        export function dispatchOverlayTrigger(content: MobileInkOverlayContent) {
            // _socket.emit("dispatchBoxTrigger");
            Utils.Emit(_socket, MessageStore.MobileInkOverlayTrigger, content);
        }

        export function dispatchOverlayPositionUpdate(content: UpdateMobileInkOverlayPositionContent) {
            Utils.Emit(_socket, MessageStore.UpdateMobileInkOverlayPosition, content);
        }

        export function dispatchMobileDocumentUpload(content: MobileDocumentUploadContent) {
            Utils.Emit(_socket, MessageStore.MobileDocumentUpload, content);
        }
    }

    const instructions = "This page will automatically refresh after this alert is closed. Expect to reconnect after about 30 seconds.";
    function alertUser(connectionTerminationReason: string) {
        switch (connectionTerminationReason) {
            case "crash":
                alert(`Dash has temporarily crashed. Administrators have been notified and the server is restarting itself. ${instructions}`);
                break;
            case "temporary":
                alert(`An administrator has chosen to restart the server. ${instructions}`);
                break;
            case "exit":
                alert("An administrator has chosen to kill the server. Do not expect to reconnect until administrators start the server.");
                break;
            default:
                console.log(`Received an unknown ConnectionTerminated message: ${connectionTerminationReason}`);
        }
        window.location.reload();
    }

    export function init(protocol: string, hostname: string, port: number, identifier: string) {
        _cache = {};
        GUID = identifier;
        _socket = OpenSocket(`${protocol}//${hostname}:${port}`);

        _GetRefField = _GetRefFieldImpl;
        _GetRefFields = _GetRefFieldsImpl;
        _CreateField = _CreateFieldImpl;
        _UpdateField = _UpdateFieldImpl;

        /**
         * Whenever the server sends us its handshake message on our
         * websocket, we use the above function to return the handshake.
         */
        Utils.AddServerHandler(_socket, MessageStore.Foo, onConnection);
        Utils.AddServerHandler(_socket, MessageStore.UpdateField, respondToUpdate);
        Utils.AddServerHandler(_socket, MessageStore.DeleteField, respondToDelete);
        Utils.AddServerHandler(_socket, MessageStore.DeleteFields, respondToDelete);
        Utils.AddServerHandler(_socket, MessageStore.ConnectionTerminated, alertUser);

        // mobile ink overlay socket events to communicate between mobile view and desktop view
        _socket.addEventListener("receiveGesturePoints", (content: GestureContent) => {
            MobileInkOverlay.Instance.drawStroke(content);
        });
        _socket.addEventListener("receiveOverlayTrigger", (content: MobileInkOverlayContent) => {
            GestureOverlay.Instance.enableMobileInkOverlay(content);
            MobileInkOverlay.Instance.initMobileInkOverlay(content);
        });
        _socket.addEventListener("receiveUpdateOverlayPosition", (content: UpdateMobileInkOverlayPositionContent) => {
            MobileInkOverlay.Instance.updatePosition(content);
        });
        _socket.addEventListener("receiveMobileDocumentUpload", (content: MobileDocumentUploadContent) => {
            MobileInkOverlay.Instance.uploadDocument(content);
        });
    }

    function errorFunc(): never {
        throw new Error("Can't use DocServer without calling init first");
    }

    export namespace Control {

        let _isReadOnly = false;
        export function makeReadOnly() {
            if (_isReadOnly) return;
            _isReadOnly = true;
            _CreateField = field => {
                _cache[field[Id]] = field;
            };
            _UpdateField = emptyFunction;
            _RespondToUpdate = emptyFunction;
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

        export function isReadOnly() { return _isReadOnly; }

    }

    /**
     * This function emits a message (with this client's
     * unique GUID) to the server
     * indicating that this client has connected
     */
    function onConnection() {
        _socket.emit(MessageStore.Bar.Message, GUID);
    }

    export namespace Util {

        /**
         * Emits a message to the server that wipes
         * all documents in the database.
         */
        export function deleteDatabase() {
            Utils.Emit(_socket, MessageStore.DeleteAll, {});
        }

    }

    // RETRIEVE DOCS FROM SERVER

    /**
     * Given a single Doc GUID, this utility function will asynchronously attempt to fetch the id's associated
     * field, first looking in the RefField cache and then communicating with
     * the server if the document has not been cached.
     * @param id the id of the requested document
     */
    const _GetRefFieldImpl = (id: string): Promise<Opt<RefField>> => {
        // an initial pass through the cache to determine whether the document needs to be fetched,
        // is already in the process of being fetched or already exists in the
        // cache
        const cached = _cache[id];
        if (cached === undefined) {
            // NOT CACHED => we'll have to send a request to the server

            // synchronously, we emit a single callback to the server requesting the serialized (i.e. represented by a string)
            // field for the given ids. This returns a promise, which, when resolved, indicates the the JSON serialized version of
            // the field has been returned from the server
            const getSerializedField = Utils.EmitCallback(_socket, MessageStore.GetRefField, id);

            // when the serialized RefField has been received, go head and begin deserializing it into an object.
            // Here, once deserialized, we also invoke .proto to 'load' the document's prototype, which ensures that all
            // future .proto calls on the Doc won't have to go farther than the cache to get their actual value.
            const deserializeField = getSerializedField.then(async fieldJson => {
                // deserialize
                const field = await SerializationHelper.Deserialize(fieldJson);
                if (field !== undefined) {
                    _cache[id] = field;
                } else {
                    delete _cache[id];
                }
                return field;
                // either way, overwrite or delete any promises cached at this id (that we inserted as flags
                // to indicate that the field was in the process of being fetched). Now everything
                // should be an actual value within or entirely absent from the cache.
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
            return Promise.resolve(cached);
        }
    };

    let _GetRefField: (id: string) => Promise<Opt<RefField>> = errorFunc;

    export function GetRefField(id: string): Promise<Opt<RefField>> {
        return _GetRefField(id);
    }

    export async function getYoutubeChannels() {
        const apiKey = await Utils.EmitCallback(_socket, MessageStore.YoutubeApiQuery, { type: YoutubeQueryTypes.Channels });
        return apiKey;
    }

    export function getYoutubeVideos(videoTitle: string, callBack: (videos: any[]) => void) {
        Utils.EmitCallback(_socket, MessageStore.YoutubeApiQuery, { type: YoutubeQueryTypes.SearchVideo, userInput: videoTitle }, callBack);
    }

    export function getYoutubeVideoDetails(videoIds: string, callBack: (videoDetails: any[]) => void) {
        Utils.EmitCallback(_socket, MessageStore.YoutubeApiQuery, { type: YoutubeQueryTypes.VideoDetails, videoIds: videoIds }, callBack);
    }


    /**
     * Given a list of Doc GUIDs, this utility function will asynchronously attempt to each id's associated
     * field, first looking in the RefField cache and then communicating with
     * the server if the document has not been cached.
     * @param ids the ids that map to the reqested documents
     */
    const _GetRefFieldsImpl = async (ids: string[]): Promise<{ [id: string]: Opt<RefField> }> => {
        const requestedIds: string[] = [];
        const waitingIds: string[] = [];
        const promises: Promise<Opt<RefField>>[] = [];
        const map: { [id: string]: Opt<RefField> } = {};

        // 1) an initial pass through the cache to determine
        // i) which documents need to be fetched
        // ii) which are already in the process of being fetched
        // iii) which already exist in the cache
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
        const getSerializedFields: Promise<any> = Utils.EmitCallback(_socket, MessageStore.GetRefFields, requestedIds);

        // 3) when the serialized RefFields have been received, go head and begin deserializing them into objects.
        // Here, once deserialized, we also invoke .proto to 'load' the documents' prototypes, which ensures that all
        // future .proto calls on the Doc won't have to go farther than the cache to get their actual value.
        const deserializeFields = getSerializedFields.then(async fields => {
            const fieldMap: { [id: string]: RefField } = {};
            const proms: Promise<void>[] = [];
            for (const field of fields) {
                if (field !== undefined && field !== null) {
                    // deserialize
                    const prom = SerializationHelper.Deserialize(field).then(deserialized => {
                        fieldMap[field.id] = deserialized;

                        //overwrite or delete any promises (that we inserted as flags
                        // to indicate that the field was in the process of being fetched). Now everything
                        // should be an actual value within or entirely absent from the cache.
                        if (deserialized !== undefined) {
                            _cache[field.id] = deserialized;
                        } else {
                            delete _cache[field.id];
                        }
                        return deserialized;
                    });
                    // 4) here, for each of the documents we've requested *ourselves* (i.e. weren't promises or found in the cache)
                    // we set the value at the field's id to a promise that will resolve to the field. 
                    // When we find that promises exist at keys in the cache, THIS is where they were set, just by some other caller (method).
                    // The mapping in the .then call ensures that when other callers await these promises, they'll
                    // get the resolved field
                    _cache[field.id] = prom;
                    // adds to a list of promises that will be awaited asynchronously
                    proms.push(prom);
                }
            }
            await Promise.all(proms);
            return fieldMap;
        });

        // 5) at this point, all fields have a) been returned from the server and b) been deserialized into actual Field objects whose
        // prototype documents, if any, have also been fetched and cached.
        const fields = await deserializeFields;

        // 6) with this confidence, we can now go through and update the cache at the ids of the fields that
        // we explicitly had to fetch. To finish it off, we add whatever value we've come up with for a given
        // id to the soon-to-be-returned field mapping.
        requestedIds.forEach(id => {
            const field = fields[id];
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
        // argument to the caller's promise (i.e. GetRefFields(["_id1_", "_id2_", "_id3_"]).then(map => //do something with map...))
        // or it is the direct return result if the promise is awaited (i.e. let fields = await GetRefFields(["_id1_", "_id2_", "_id3_"])).
        return map;
    };

    let _GetRefFields: (ids: string[]) => Promise<{ [id: string]: Opt<RefField> }> = errorFunc;

    export function GetRefFields(ids: string[]) {
        return _GetRefFields(ids);
    }

    // WRITE A NEW DOCUMENT TO THE SERVER

    /**
     * A wrapper around the function local variable _createField.
     * This allows us to swap in different executions while comfortably
     * calling the same function throughout the code base (such as in Util.makeReadonly())
     * @param field the [RefField] to be serialized and sent to the server to be stored in the database
     */
    export function CreateField(field: RefField) {
        _CreateField(field);
    }

    function _CreateFieldImpl(field: RefField) {
        _cache[field[Id]] = field;
        const initialState = SerializationHelper.Serialize(field);
        Utils.Emit(_socket, MessageStore.CreateField, initialState);
    }

    let _CreateField: (field: RefField) => void = errorFunc;

    // NOTIFY THE SERVER OF AN UPDATE TO A DOC'S STATE

    /**
     * A wrapper around the function local variable _emitFieldUpdate.
     * This allows us to swap in different executions while comfortably
     * calling the same function throughout the code base (such as in Util.makeReadonly())
     * @param id the id of the [Doc] whose state has been updated in our client
     * @param updatedState the new value of the document. At some point, this
     * should actually be a proper diff, to improve efficiency
     */
    export function UpdateField(id: string, updatedState: any) {
        _UpdateField(id, updatedState);
    }

    function _UpdateFieldImpl(id: string, diff: any) {
        Utils.Emit(_socket, MessageStore.UpdateField, { id, diff });
    }

    let _UpdateField: (id: string, diff: any) => void = errorFunc;

    function _respondToUpdateImpl(diff: any) {
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
                handler.call(f, diff.diff);
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
    }

    export function DeleteDocument(id: string) {
        Utils.Emit(_socket, MessageStore.DeleteField, id);
    }

    export function DeleteDocuments(ids: string[]) {
        Utils.Emit(_socket, MessageStore.DeleteFields, ids);
    }


    function _respondToDeleteImpl(ids: string | string[]) {
        function deleteId(id: string) {
            delete _cache[id];
        }
        if (typeof ids === "string") {
            deleteId(ids);
        } else if (Array.isArray(ids)) {
            ids.map(deleteId);
        }
    }

    let _RespondToUpdate = _respondToUpdateImpl;
    const _respondToDelete = _respondToDeleteImpl;

    function respondToUpdate(diff: any) {
        _RespondToUpdate(diff);
    }

    function respondToDelete(ids: string | string[]) {
        _respondToDelete(ids);
    }
}
