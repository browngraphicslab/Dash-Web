import { isMaster } from "cluster";
import { Utils } from "../../../Utils";

export type IPCTarget = NodeJS.EventEmitter & { send?: Function };
export type Router = (message: Message) => void | Promise<void>;

export const suffix = isMaster ? Utils.GenerateGuid() : process.env.ipc_suffix;

export interface Message {
    name: string;
    args: any;
}

export type MessageHandler = (message: Message) => any | Promise<any>;

export class PromisifiedIPCManager {
    private onMessage: { [message: string]: MessageHandler[] | undefined } = {};
    private readonly target: IPCTarget;
    private readonly ipc_id = `ipc_id_${suffix}`;
    private readonly response_expected = `response_expected_${suffix}`;
    private readonly is_response = `is_response_${suffix}`;

    constructor(target: IPCTarget) {
        this.target = target;

        this.target.addListener("message", async ({ name, args }: Message) => {
            let error: Error | undefined;
            try {
                const handlers = this.onMessage[name];
                if (handlers) {
                    await Promise.all(handlers.map(handler => handler({ name, args })));
                }
            } catch (e) {
                error = e;
            }
            if (args[this.response_expected] && this.target.send) {
                const response: any = { error };
                response[this.ipc_id] = args[this.ipc_id];
                response[this.is_response] = true;
                this.target.send(response);
            }
        });
    }

    /**
         * Add a listener at this message. When the monitor process
         * receives a message, it will invoke all registered functions.
         */
    public addMessageListener = (name: string, handler: MessageHandler) => {
        const handlers = this.onMessage[name];
        if (handlers) {
            handlers.push(handler);
        } else {
            this.onMessage[name] = [handler];
        }
    }

    /**
     * Unregister a given listener at this message.
     */
    public removeMessageListener = (name: string, handler: MessageHandler) => {
        const handlers = this.onMessage[name];
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Unregister all listeners at this message.
     */
    public clearMessageListeners = (message: string) => this.onMessage[message] = undefined;

    public emit = async (name: string, args: any, expectResponse = false): Promise<Error | undefined> => {
        if (!this.target.send) {
            return new Error("Cannot dispatch when send is undefined.");
        }
        args[this.response_expected] = expectResponse;
        if (expectResponse) {
            return new Promise(resolve => {
                const messageId = Utils.GenerateGuid();
                args[this.ipc_id] = messageId;
                const responseHandler: (args: any) => void = response => {
                    const { error } = response;
                    if (response[this.is_response] && response[this.ipc_id] === messageId) {
                        this.target.removeListener("message", responseHandler);
                        resolve(error);
                    }
                };
                this.target.addListener("message", responseHandler);
                this.target.send!({ name, args });
            });
        } else {
            this.target.send({ name, args });
        }
    }

}

export function IPC(target: IPCTarget) {
    return new PromisifiedIPCManager(target);
}