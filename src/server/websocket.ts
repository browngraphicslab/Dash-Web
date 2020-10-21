import * as express from "express";
import { blue, green } from "colors";
import { createServer, Server } from "https";
import { networkInterfaces } from "os";
import * as sio from 'socket.io';
import { Socket } from "socket.io";
import executeImport from "../scraping/buxton/final/BuxtonImporter";
import { Utils } from "../Utils";
import { logPort } from './ActionUtilities';
import { timeMap } from "./ApiManagers/UserManager";
import { GoogleCredentialsLoader, SSL } from "./apis/google/CredentialsLoader";
import YoutubeApi from "./apis/youtube/youtubeApiSample";
import { Client } from "./Client";
import { Database } from "./database";
import { DocumentsCollection } from "./IDatabase";
import { Diff, GestureContent, MessageStore, MobileDocumentUploadContent, MobileInkOverlayContent, Transferable, Types, UpdateMobileInkOverlayPositionContent, YoutubeQueryInput, YoutubeQueryTypes } from "./Message";
import { Search } from "./Search";
import { resolvedPorts } from './server_Initialization';
import { Opt } from "../fields/Doc";

export namespace WebSocket {

    export let _socket: Socket;
    const clients: { [key: string]: Client } = {};
    export const socketMap = new Map<SocketIO.Socket, string>();
    export let disconnect: Function;

    export async function initialize(isRelease: boolean, app: express.Express) {
        let io: sio.Server;
        if (isRelease) {
            const { socketPort } = process.env;
            if (socketPort) {
                resolvedPorts.socket = Number(socketPort);
            }
            let socketEndpoint: Opt<Server>;
            await new Promise<void>(resolve => socketEndpoint = createServer(SSL.Credentials, app).listen(resolvedPorts.socket, resolve));
            io = sio(socketEndpoint!, SSL.Credentials as any);
        } else {
            io = sio().listen(resolvedPorts.socket);
        }
        logPort("websocket", resolvedPorts.socket);

        io.on("connection", function (socket: Socket) {
            _socket = socket;
            socket.use((_packet, next) => {
                const userEmail = socketMap.get(socket);
                if (userEmail) {
                    timeMap[userEmail] = Date.now();
                }
                next();
            });

            // convenience function to log server messages on the client
            function log(message?: any, ...optionalParams: any[]) {
                socket.emit('log', ['Message from server:', message, ...optionalParams]);
            }

            socket.on('message', function (message, room) {
                console.log('Client said: ', message);
                socket.in(room).emit('message', message);
            });

            socket.on('create or join', function (room) {
                console.log('Received request to create or join room ' + room);

                const clientsInRoom = socket.adapter.rooms[room];
                const numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
                console.log('Room ' + room + ' now has ' + numClients + ' client(s)');

                if (numClients === 0) {
                    socket.join(room);
                    console.log('Client ID ' + socket.id + ' created room ' + room);
                    socket.emit('created', room, socket.id);

                } else if (numClients === 1) {
                    console.log('Client ID ' + socket.id + ' joined room ' + room);
                    socket.in(room).emit('join', room);
                    socket.join(room);
                    socket.emit('joined', room, socket.id);
                    socket.in(room).emit('ready');
                } else { // max two clients
                    socket.emit('full', room);
                }
            });

            socket.on('ipaddr', function () {
                const ifaces = networkInterfaces();
                for (const dev in ifaces) {
                    ifaces[dev].forEach(function (details) {
                        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                            socket.emit('ipaddr', details.address);
                        }
                    });
                }
            });

            socket.on('bye', function () {
                console.log('received bye');
            });

            Utils.Emit(socket, MessageStore.Foo, "handshooken");

            Utils.AddServerHandler(socket, MessageStore.Bar, guid => barReceived(socket, guid));
            Utils.AddServerHandler(socket, MessageStore.SetField, (args) => setField(socket, args));
            Utils.AddServerHandlerCallback(socket, MessageStore.GetField, getField);
            Utils.AddServerHandlerCallback(socket, MessageStore.GetFields, getFields);
            if (isRelease) {
                Utils.AddServerHandler(socket, MessageStore.DeleteAll, () => doDelete(false));
            }

            Utils.AddServerHandler(socket, MessageStore.CreateField, CreateField);
            Utils.AddServerHandlerCallback(socket, MessageStore.YoutubeApiQuery, HandleYoutubeQuery);
            Utils.AddServerHandler(socket, MessageStore.UpdateField, diff => UpdateField(socket, diff));
            Utils.AddServerHandler(socket, MessageStore.DeleteField, id => DeleteField(socket, id));
            Utils.AddServerHandler(socket, MessageStore.DeleteFields, ids => DeleteFields(socket, ids));
            Utils.AddServerHandler(socket, MessageStore.GesturePoints, content => processGesturePoints(socket, content));
            Utils.AddServerHandler(socket, MessageStore.MobileInkOverlayTrigger, content => processOverlayTrigger(socket, content));
            Utils.AddServerHandler(socket, MessageStore.UpdateMobileInkOverlayPosition, content => processUpdateOverlayPosition(socket, content));
            Utils.AddServerHandler(socket, MessageStore.MobileDocumentUpload, content => processMobileDocumentUpload(socket, content));
            Utils.AddServerHandlerCallback(socket, MessageStore.GetRefField, GetRefField);
            Utils.AddServerHandlerCallback(socket, MessageStore.GetRefFields, GetRefFields);

            /**
             * Whenever we receive the go-ahead, invoke the import script and pass in
             * as an emitter and a terminator the functions that simply broadcast a result
             * or indicate termination to the client via the web socket
             */
            Utils.AddServerHandler(socket, MessageStore.BeginBuxtonImport, () => {
                executeImport(
                    deviceOrError => Utils.Emit(socket, MessageStore.BuxtonDocumentResult, deviceOrError),
                    results => Utils.Emit(socket, MessageStore.BuxtonImportComplete, results)
                );
            });

            disconnect = () => {
                socket.broadcast.emit("connection_terminated", Date.now());
                socket.disconnect(true);
            };
        });
    }

    function processGesturePoints(socket: Socket, content: GestureContent) {
        socket.broadcast.emit("receiveGesturePoints", content);
    }

    function processOverlayTrigger(socket: Socket, content: MobileInkOverlayContent) {
        socket.broadcast.emit("receiveOverlayTrigger", content);
    }

    function processUpdateOverlayPosition(socket: Socket, content: UpdateMobileInkOverlayPositionContent) {
        socket.broadcast.emit("receiveUpdateOverlayPosition", content);
    }

    function processMobileDocumentUpload(socket: Socket, content: MobileDocumentUploadContent) {
        socket.broadcast.emit("receiveMobileDocumentUpload", content);
    }

    function HandleYoutubeQuery([query, callback]: [YoutubeQueryInput, (result?: any[]) => void]) {
        const { ProjectCredentials } = GoogleCredentialsLoader;
        switch (query.type) {
            case YoutubeQueryTypes.Channels:
                YoutubeApi.authorizedGetChannel(ProjectCredentials);
                break;
            case YoutubeQueryTypes.SearchVideo:
                YoutubeApi.authorizedGetVideos(ProjectCredentials, query.userInput, callback);
            case YoutubeQueryTypes.VideoDetails:
                YoutubeApi.authorizedGetVideoDetails(ProjectCredentials, query.videoIds, callback);
        }
    }

    export async function doDelete(onlyFields = true) {
        const target: string[] = [];
        onlyFields && target.push(DocumentsCollection);
        await Database.Instance.dropSchema(...target);
        if (process.env.DISABLE_SEARCH !== "true") {
            await Search.clear();
        }
    }

    function barReceived(socket: SocketIO.Socket, userEmail: string) {
        clients[userEmail] = new Client(userEmail.toString());
        const currentdate = new Date();
        const datetime = currentdate.getDate() + "/"
            + (currentdate.getMonth() + 1) + "/"
            + currentdate.getFullYear() + " @ "
            + currentdate.getHours() + ":"
            + currentdate.getMinutes() + ":"
            + currentdate.getSeconds();
        console.log(blue(`user ${userEmail} has connected to the web socket at: ${datetime}`));
        socketMap.set(socket, userEmail);
    }

    function getField([id, callback]: [string, (result?: Transferable) => void]) {
        Database.Instance.getDocument(id, (result?: Transferable) =>
            callback(result ? result : undefined));
    }

    function getFields([ids, callback]: [string[], (result: Transferable[]) => void]) {
        Database.Instance.getDocuments(ids, callback);
    }

    function setField(socket: Socket, newValue: Transferable) {
        Database.Instance.update(newValue.id, newValue, () =>
            socket.broadcast.emit(MessageStore.SetField.Message, newValue));  // broadcast set value to all other clients
        if (newValue.type === Types.Text) {  // if the newValue has sring type, then it's suitable for searching -- pass it to SOLR
            Search.updateDocument({ id: newValue.id, data: { set: (newValue as any).data } });
        }
    }

    function GetRefFieldLocal([id, callback]: [string, (result?: Transferable) => void]) {
        return Database.Instance.getDocument(id, callback);
    }
    function GetRefField([id, callback]: [string, (result?: Transferable) => void]) {
        process.stdout.write(`.`);
        GetRefFieldLocal([id, callback]);
    }

    function GetRefFields([ids, callback]: [string[], (result?: Transferable[]) => void]) {
        process.stdout.write(`${ids.length}…`);
        Database.Instance.getDocuments(ids, callback);
    }

    const suffixMap: { [type: string]: (string | [string, string | ((json: any) => any)]) } = {
        "number": "_n",
        "string": "_t",
        "boolean": "_b",
        "image": ["_t", "url"],
        "video": ["_t", "url"],
        "pdf": ["_t", "url"],
        "audio": ["_t", "url"],
        "web": ["_t", "url"],
        "script": ["_t", value => value.script.originalScript],
        "RichTextField": ["_t", value => value.Text],
        "date": ["_d", value => new Date(value.date).toISOString()],
        "proxy": ["_i", "fieldId"],
        "list": ["_l", list => {
            const results = [];
            for (const value of list.fields) {
                const term = ToSearchTerm(value);
                if (term) {
                    results.push(term.value);
                }
            }
            return results.length ? results : null;
        }]
    };

    function ToSearchTerm(val: any): { suffix: string, value: any } | undefined {

        if (val === null || val === undefined) {
            return;
        }
        const type = val.__type || typeof val;

        let suffix = suffixMap[type];
        if (!suffix) {
            return;
        }
        if (Array.isArray(suffix)) {
            const accessor = suffix[1];
            if (typeof accessor === "function") {
                val = accessor(val);
            } else {
                val = val[accessor];

            }
            suffix = suffix[0];

        }
        return { suffix, value: val };
    }

    function getSuffix(value: string | [string, any]): string {
        return typeof value === "string" ? value : value[0];
    }

    function addToListField(socket: Socket, diff: Diff, curListItems?: Transferable): void {
        diff.diff.$set = diff.diff.$addToSet; delete diff.diff.$addToSet;// convert add to set to a query of the current fields, and then a set of the composition of the new fields with the old ones
        const updatefield = Array.from(Object.keys(diff.diff.$set))[0];
        const newListItems = diff.diff.$set[updatefield].fields;
        const curList = (curListItems as any)?.fields?.[updatefield.replace("fields.", "")]?.fields.filter((item: any) => item !== undefined) || [];
        diff.diff.$set[updatefield].fields = [...curList, ...newListItems.filter((newItem: any) => newItem && !curList.some((curItem: any) => curItem.fieldId ? curItem.fieldId === newItem.fieldId : curItem.heading ? curItem.heading === newItem.heading : curItem === newItem))];
        const sendBack = diff.diff.length !== diff.diff.$set[updatefield].fields.length;
        delete diff.diff.length;
        Database.Instance.update(diff.id, diff.diff,
            () => {
                if (sendBack) {
                    console.log("RET BACK");
                    const id = socket.id;
                    socket.id = "";
                    socket.broadcast.emit(MessageStore.UpdateField.Message, diff);
                    socket.id = id;
                } else socket.broadcast.emit(MessageStore.UpdateField.Message, diff);
                dispatchNextOp(diff.id);
            }, false);
    }

    function remFromListField(socket: Socket, diff: Diff, curListItems?: Transferable): void {
        diff.diff.$set = diff.diff.$remFromSet; delete diff.diff.$remFromSet;
        const updatefield = Array.from(Object.keys(diff.diff.$set))[0];
        const remListItems = diff.diff.$set[updatefield].fields;
        const curList = (curListItems as any)?.fields?.[updatefield.replace("fields.", "")]?.fields || [];
        diff.diff.$set[updatefield].fields = curList?.filter((curItem: any) => !remListItems.some((remItem: any) => remItem.fieldId ? remItem.fieldId === curItem.fieldId : remItem.heading ? remItem.heading === curItem.heading : remItem === curItem));
        const sendBack = diff.diff.length !== diff.diff.$set[updatefield].fields.length;
        delete diff.diff.length;
        Database.Instance.update(diff.id, diff.diff,
            () => {
                if (sendBack) {
                    console.log("SEND BACK");
                    const id = socket.id;
                    socket.id = "";
                    socket.broadcast.emit(MessageStore.UpdateField.Message, diff);
                    socket.id = id;
                } else socket.broadcast.emit(MessageStore.UpdateField.Message, diff);
                dispatchNextOp(diff.id);
            }, false);
    }

    const pendingOps = new Map<string, { diff: Diff, socket: Socket }[]>();

    function dispatchNextOp(id: string) {
        const next = pendingOps.get(id)!.shift();
        if (next) {
            const { diff, socket } = next;
            if (diff.diff.$addToSet) {
                return GetRefFieldLocal([diff.id, (result?: Transferable) => addToListField(socket, diff, result)]); // would prefer to have Mongo handle list additions direclty, but for now handle it on our own
            }
            if (diff.diff.$remFromSet) {
                return GetRefFieldLocal([diff.id, (result?: Transferable) => remFromListField(socket, diff, result)]); // would prefer to have Mongo handle list additions direclty, but for now handle it on our own
            }
            return GetRefFieldLocal([diff.id, (result?: Transferable) => SetField(socket, diff, result)]);
        }
        if (!pendingOps.get(id)!.length) pendingOps.delete(id);
    }

    function UpdateField(socket: Socket, diff: Diff) {
        if (pendingOps.has(diff.id)) {
            pendingOps.get(diff.id)!.push({ diff, socket });
            return true;
        }
        pendingOps.set(diff.id, [{ diff, socket }]);
        if (diff.diff.$addToSet) {
            return GetRefFieldLocal([diff.id, (result?: Transferable) => addToListField(socket, diff, result)]); // would prefer to have Mongo handle list additions direclty, but for now handle it on our own
        }
        if (diff.diff.$remFromSet) {
            return GetRefFieldLocal([diff.id, (result?: Transferable) => remFromListField(socket, diff, result)]); // would prefer to have Mongo handle list additions direclty, but for now handle it on our own
        }
        return GetRefFieldLocal([diff.id, (result?: Transferable) => SetField(socket, diff, result)]);
    }
    function SetField(socket: Socket, diff: Diff, curListItems?: Transferable) {
        Database.Instance.update(diff.id, diff.diff,
            () => socket.broadcast.emit(MessageStore.UpdateField.Message, diff), false);
        const docfield = diff.diff.$set || diff.diff.$unset;
        if (docfield) {
            const update: any = { id: diff.id };
            let dynfield = false;
            for (let key in docfield) {
                if (!key.startsWith("fields.")) continue;
                dynfield = true;
                const val = docfield[key];
                key = key.substring(7);
                Object.values(suffixMap).forEach(suf => { update[key + getSuffix(suf)] = { set: null }; });
                const term = ToSearchTerm(val);
                if (term !== undefined) {
                    const { suffix, value } = term;
                    update[key + suffix] = { set: value };
                    if (key.endsWith('lastModified')) {
                        update["lastModified" + suffix] = value;
                    }
                }
            }
            if (dynfield) {
                Search.updateDocument(update);
            }
        }
        dispatchNextOp(diff.id);
    }

    function DeleteField(socket: Socket, id: string) {
        Database.Instance.delete({ _id: id }).then(() => {
            socket.broadcast.emit(MessageStore.DeleteField.Message, id);
        });

        Search.deleteDocuments([id]);
    }

    function DeleteFields(socket: Socket, ids: string[]) {
        Database.Instance.delete({ _id: { $in: ids } }).then(() => {
            socket.broadcast.emit(MessageStore.DeleteFields.Message, ids);
        });
        Search.deleteDocuments(ids);
    }

    function CreateField(newValue: any) {
        Database.Instance.insert(newValue);
    }

}

