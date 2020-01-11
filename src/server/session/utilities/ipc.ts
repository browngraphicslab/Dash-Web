import { isMaster } from "cluster";
import { Utils } from "../../../Utils";

export type IPCTarget = NodeJS.EventEmitter & { send?: Function };
export type Router = (message: Message) => void | Promise<void>;

export const suffix = isMaster ? Utils.GenerateGuid() : process.env.ipc_suffix;

export interface Message<T = any> {
    name: string;
    args: T;
}
type InternalMessage<T = any> = Message<T> & { metadata: any };
export type MessageHandler<A = any, T extends Message<A> = Message<A>> = (message: T) => any | Promise<any>;

export class PromisifiedIPCManager {
    private readonly target: IPCTarget;
    private readonly ipc_id = `ipc_id_${suffix}`;
    private readonly is_response = `is_response_${suffix}`;

    constructor(target: IPCTarget) {
        this.target = target;
    }

    public emit = async (name: string, args?: any, awaitResponse = false): Promise<Error | undefined> => {
        if (!this.target.send) {
            return new Error("Cannot dispatch when send is undefined.");
        }
        if (awaitResponse) {
            return new Promise(resolve => {
                const messageId = Utils.GenerateGuid();
                const metadata: any = {};
                metadata[this.ipc_id] = messageId;
                const responseHandler: MessageHandler<any, InternalMessage> = ({ metadata, args }) => {
                    if (metadata[this.is_response] && metadata[this.ipc_id] === messageId) {
                        this.target.removeListener("message", responseHandler);
                        resolve(args?.error as Error | undefined);
                    }
                };
                this.target.addListener("message", responseHandler);
                this.target.send?.({ name, args, metadata });
            });
        } else {
            this.target.send?.({ name, args });
        }
    }

    public setRouter = (router: Router) => {
        this.target.addListener("message", async ({ name, args, metadata }: InternalMessage) => {
            if (name && (!metadata || !metadata[this.is_response])) {
                let error: Error | undefined;
                try {
                    await router({ name, args });
                } catch (e) {
                    error = e;
                }
                if (metadata && this.target.send) {
                    metadata[this.is_response] = true;
                    this.target.send({
                        name,
                        args: { error },
                        metadata
                    });
                }
            }
        });
    }

}

export function IPC(target: IPCTarget) {
    return new PromisifiedIPCManager(target);
}