import v4 = require('uuid/v4');
import v5 = require("uuid/v5");
import { Socket } from 'socket.io';
import { Message } from './server/Message';
import { RouteStore } from './server/RouteStore';

export class Utils {

    public static DRAG_THRESHOLD = 4;

    public static GenerateGuid(): string {
        return v4();
    }

    public static GenerateDeterministicGuid(seed: string): string {
        return v5(seed, v5.URL);
    }

    public static GetScreenTransform(ele?: HTMLElement): { scale: number, translateX: number, translateY: number } {
        if (!ele) {
            return { scale: 1, translateX: 1, translateY: 1 };
        }
        const rect = ele.getBoundingClientRect();
        const scale = ele.offsetWidth === 0 && rect.width === 0 ? 1 : rect.width / ele.offsetWidth;
        const translateX = rect.left;
        const translateY = rect.top;

        return { scale, translateX, translateY };
    }

    /**
     * A convenience method. Prepends the full path (i.e. http://localhost:1050) to the
     * requested extension
     * @param extension the specified sub-path to append to the window origin
     */
    public static prepend(extension: string): string {
        return window.location.origin + extension;
    }
    public static CorsProxy(url: string): string {
        return this.prepend(RouteStore.corsProxy + "/") + encodeURIComponent(url);
    }

    public static CopyText(text: string) {
        var textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try { document.execCommand('copy'); } catch (err) { }

        document.body.removeChild(textArea);
    }

    public static GetClipboardText(): string {
        var textArea = document.createElement("textarea");
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try { document.execCommand('paste'); } catch (err) { }

        const val = textArea.value;
        document.body.removeChild(textArea);
        return val;
    }

    public static loggingEnabled: Boolean = false;
    public static logFilter: number | undefined = undefined;
    private static log(prefix: string, messageName: string, message: any, receiving: boolean) {
        if (!this.loggingEnabled) {
            return;
        }
        message = message || {};
        if (this.logFilter !== undefined && this.logFilter !== message.type) {
            return;
        }
        let idString = (message.id || "").padStart(36, ' ');
        prefix = prefix.padEnd(16, ' ');
        console.log(`${prefix}: ${idString}, ${receiving ? 'receiving' : 'sending'} ${messageName} with data ${JSON.stringify(message)}`);
    }
    private static loggingCallback(prefix: string, func: (args: any) => any, messageName: string) {
        return (args: any) => {
            this.log(prefix, messageName, args, true);
            func(args);
        };
    }

    public static Emit<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T) {
        this.log("Emit", message.Name, args, false);
        socket.emit(message.Message, args);
    }

    public static EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T): Promise<any>;
    public static EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T, fn: (args: any) => any): void;
    public static EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T, fn?: (args: any) => any): void | Promise<any> {
        this.log("Emit", message.Name, args, false);
        if (fn) {
            socket.emit(message.Message, args, this.loggingCallback('Receiving', fn, message.Name));
        } else {
            return new Promise<any>(res => socket.emit(message.Message, args, this.loggingCallback('Receiving', res, message.Name)));
        }
    }

    public static AddServerHandler<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, handler: (args: T) => any) {
        socket.on(message.Message, this.loggingCallback('Incoming', handler, message.Name));
    }

    public static AddServerHandlerCallback<T>(socket: Socket, message: Message<T>, handler: (args: [T, (res: any) => any]) => any) {
        socket.on(message.Message, (arg: T, fn: (res: any) => any) => {
            this.log('S receiving', message.Name, arg, true);
            handler([arg, this.loggingCallback('S sending', fn, message.Name)]);
        });
    }
}

export function OmitKeys(obj: any, keys: string[], addKeyFunc?: (dup: any) => void): { omit: any, extract: any } {
    const omit: any = { ...obj };
    const extract: any = {};
    keys.forEach(key => {
        extract[key] = omit[key];
        delete omit[key];
    });
    addKeyFunc && addKeyFunc(omit);
    return { omit, extract };
}

export function WithKeys(obj: any, keys: string[], addKeyFunc?: (dup: any) => void) {
    var dup: any = {};
    keys.forEach(key => dup[key] = obj[key]);
    addKeyFunc && addKeyFunc(dup);
    return dup;
}

export function returnTrue() { return true; }

export function returnFalse() { return false; }

export function returnOne() { return 1; }

export function returnZero() { return 0; }

export function emptyFunction() { }

export type Without<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Predicate<K, V> = (entry: [K, V]) => boolean;

export function DeepCopy<K, V>(source: Map<K, V>, predicate?: Predicate<K, V>) {
    let deepCopy = new Map<K, V>();
    let entries = source.entries(), next = entries.next();
    while (!next.done) {
        let entry = next.value;
        if (!predicate || predicate(entry)) {
            deepCopy.set(entry[0], entry[1]);
        }
        next = entries.next();
    }
    return deepCopy;
}

export namespace JSONUtils {

    export function tryParse(source: string) {
        let results: any;
        try {
            results = JSON.parse(source);
        } catch (e) {
            results = source;
        }
        return results;
    }

}