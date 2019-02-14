import v4 = require('uuid/v4');
import v5 = require("uuid/v5");
import { Socket } from 'socket.io';
import { Message, Types } from './server/Message';
import { Field } from './fields/Field';
import { TextField } from './fields/TextField';
import { NumberField } from './fields/NumberField';
import { RichTextField } from './fields/RichTextField';
import { Key } from './fields/Key';
import { ImageField } from './fields/ImageField';
import { ListField } from './fields/ListField';
import { Document } from './fields/Document';
import { Server } from './client/Server';

export class Utils {

    public static GenerateGuid(): string {
        return v4()
    }

    public static GenerateDeterministicGuid(seed: string): string {
        return v5(seed, v5.URL)
    }

    public static GetScreenTransform(ele: HTMLElement): { scale: number, translateX: number, translateY: number } {
        const rect = ele.getBoundingClientRect();
        const scale = ele.offsetWidth == 0 && rect.width == 0 ? 1 : rect.width / ele.offsetWidth;
        const translateX = rect.left;
        const translateY = rect.top;

        return { scale, translateX, translateY };
    }

    public static Emit<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T) {
        socket.emit(message.Message, args);
    }

    public static EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T, fn: (args: any) => any) {
        socket.emit(message.Message, args, fn);
    }

    public static AddServerHandler<T>(socket: Socket, message: Message<T>, handler: (args: T) => any) {
        socket.on(message.Message, handler);
    }

    public static AddServerHandlerCallback<T>(socket: Socket, message: Message<T>, handler: (args: [T, (res: any) => any]) => any) {
        socket.on(message.Message, (arg: T, fn: (res: any) => any) => handler([arg, fn]));
    }
}