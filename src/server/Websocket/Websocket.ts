import { Utils } from "../../Utils";
import { MessageStore, Transferable, Types, Diff, YoutubeQueryInput, YoutubeQueryTypes } from "../Message";
import { Client } from "../Client";
import { Socket } from "socket.io";
import { Database } from "../database";
import { Search } from "../Search";
import * as io from 'socket.io';
import YoutubeApi from "../apis/youtube/youtubeApiSample";
import { GoogleCredentialsLoader } from "../credentials/CredentialsLoader";
import { ConsoleColors, logPort } from "../ActionUtilities";
import { timeMap } from "../ApiManagers/UserManager";

export namespace WebSocket {

    let clients: { [key: string]: Client } = {};
    export const socketMap = new Map<SocketIO.Socket, string>();

    export async function start(serverPort: number, isRelease: boolean) {
        await preliminaryFunctions();
        initialize(serverPort, isRelease);
    }

    async function preliminaryFunctions() {
    }

    export function initialize(socketPort: number, isRelease: boolean) {
        const endpoint = io();
        endpoint.on("connection", function (socket: Socket) {
            socket.use((_packet, next) => {
                let userEmail = socketMap.get(socket);
                if (userEmail) {
                    timeMap[userEmail] = Date.now();
                }
                next();
            });

            Utils.Emit(socket, MessageStore.Foo, "handshooken");

            Utils.AddServerHandler(socket, MessageStore.Bar, guid => barReceived(socket, guid));
            Utils.AddServerHandler(socket, MessageStore.SetField, (args) => setField(socket, args));
            Utils.AddServerHandlerCallback(socket, MessageStore.GetField, getField);
            Utils.AddServerHandlerCallback(socket, MessageStore.GetFields, getFields);
            if (isRelease) {
                Utils.AddServerHandler(socket, MessageStore.DeleteAll, deleteFields);
            }

            Utils.AddServerHandler(socket, MessageStore.CreateField, CreateField);
            Utils.AddServerHandlerCallback(socket, MessageStore.YoutubeApiQuery, HandleYoutubeQuery);
            Utils.AddServerHandler(socket, MessageStore.UpdateField, diff => UpdateField(socket, diff));
            Utils.AddServerHandler(socket, MessageStore.DeleteField, id => DeleteField(socket, id));
            Utils.AddServerHandler(socket, MessageStore.DeleteFields, ids => DeleteFields(socket, ids));
            Utils.AddServerHandlerCallback(socket, MessageStore.GetRefField, GetRefField);
            Utils.AddServerHandlerCallback(socket, MessageStore.GetRefFields, GetRefFields);
        });
        endpoint.listen(socketPort);
        logPort("websocket", socketPort);
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

    export async function deleteFields() {
        await Database.Instance.deleteAll();
        await Search.Instance.clear();
        await Database.Instance.deleteAll('newDocuments');
    }

    export async function deleteAll() {
        await Database.Instance.deleteAll();
        await Database.Instance.deleteAll('newDocuments');
        await Database.Instance.deleteAll('sessions');
        await Database.Instance.deleteAll('users');
        await Search.Instance.clear();
    }

    function barReceived(socket: SocketIO.Socket, userEmail: string) {
        clients[userEmail] = new Client(userEmail.toString());
        console.log(ConsoleColors.Green, `user ${userEmail} has connected to the web socket`);
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
            socket.broadcast.emit(MessageStore.SetField.Message, newValue));
        if (newValue.type === Types.Text) {
            Search.Instance.updateDocument({ id: newValue.id, data: (newValue as any).data });
            console.log("set field");
            console.log("checking in");
        }
    }

    function GetRefField([id, callback]: [string, (result?: Transferable) => void]) {
        Database.Instance.getDocument(id, callback, "newDocuments");
    }

    function GetRefFields([ids, callback]: [string[], (result?: Transferable[]) => void]) {
        Database.Instance.getDocuments(ids, callback, "newDocuments");
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

    function UpdateField(socket: Socket, diff: Diff) {
        Database.Instance.update(diff.id, diff.diff,
            () => socket.broadcast.emit(MessageStore.UpdateField.Message, diff), false, "newDocuments");
        const docfield = diff.diff.$set;
        if (!docfield) {
            return;
        }
        const update: any = { id: diff.id };
        let dynfield = false;
        for (let key in docfield) {
            if (!key.startsWith("fields.")) continue;
            dynfield = true;
            let val = docfield[key];
            key = key.substring(7);
            Object.values(suffixMap).forEach(suf => update[key + getSuffix(suf)] = { set: null });
            let term = ToSearchTerm(val);
            if (term !== undefined) {
                let { suffix, value } = term;
                update[key + suffix] = { set: value };
            }
        }
        if (dynfield) {
            Search.Instance.updateDocument(update);
        }
    }

    function DeleteField(socket: Socket, id: string) {
        Database.Instance.delete({ _id: id }, "newDocuments").then(() => {
            socket.broadcast.emit(MessageStore.DeleteField.Message, id);
        });

        Search.Instance.deleteDocuments([id]);
    }

    function DeleteFields(socket: Socket, ids: string[]) {
        Database.Instance.delete({ _id: { $in: ids } }, "newDocuments").then(() => {
            socket.broadcast.emit(MessageStore.DeleteFields.Message, ids);
        });

        Search.Instance.deleteDocuments(ids);

    }

    function CreateField(newValue: any) {
        Database.Instance.insert(newValue, "newDocuments");
    }

}

