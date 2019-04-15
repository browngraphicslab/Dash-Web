import v4 = require('uuid/v4');
import v5 = require("uuid/v5");
import { Socket } from 'socket.io';
import { Message, Types, Transferable } from './server/Message';
import { Document } from './fields/Document';

export class Utils {

    public static GenerateGuid(): string {
        return v4();
    }

    public static GenerateDeterministicGuid(seed: string): string {
        return v5(seed, v5.URL);
    }

    public static GetScreenTransform(ele: HTMLElement): { scale: number, translateX: number, translateY: number } {
        if (!ele) {
            return { scale: 1, translateX: 1, translateY: 1 };
        }
        const rect = ele.getBoundingClientRect();
        const scale = ele.offsetWidth === 0 && rect.width === 0 ? 1 : rect.width / ele.offsetWidth;
        const translateX = rect.left;
        const translateY = rect.top;

        return { scale, translateX, translateY };
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

export function returnTrue() { return true; }

export function returnFalse() { return false; }

export function emptyFunction() { }

export function emptyDocFunction(doc: Document) { }

export type Without<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;