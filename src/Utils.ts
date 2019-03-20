import v4 = require('uuid/v4');
import v5 = require("uuid/v5");
import { Socket } from 'socket.io';
import { Message, Types } from './server/Message';

export class Utils {

    public static GenerateGuid(): string {
        return v4()
    }

    public static GenerateDeterministicGuid(seed: string): string {
        return v5(seed, v5.URL)
    }

    public static GetScreenTransform(ele: HTMLElement): { scale: number, translateX: number, translateY: number } {
        if (!ele) {
            return { scale: 1, translateX: 1, translateY: 1 }
        }
        const rect = ele.getBoundingClientRect();
        const scale = ele.offsetWidth == 0 && rect.width == 0 ? 1 : rect.width / ele.offsetWidth;
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

    public static Emit<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T) {
        socket.emit(message.Message, args);
    }

    public static EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T): Promise<any>;
    public static EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T, fn: (args: any) => any): void;
    public static EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T, fn?: (args: any) => any): void | Promise<any> {
        if (fn) {
            socket.emit(message.Message, args, fn);
        } else {
            return new Promise<any>(res => {
                socket.emit(message.Message, args, res);
            })
        }
    }

    public static AddServerHandler<T>(socket: Socket, message: Message<T>, handler: (args: T) => any) {
        socket.on(message.Message, handler);
    }

    public static AddServerHandlerCallback<T>(socket: Socket, message: Message<T>, handler: (args: [T, (res: any) => any]) => any) {
        socket.on(message.Message, (arg: T, fn: (res: any) => any) => handler([arg, fn]));
    }
}

export type Without<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;