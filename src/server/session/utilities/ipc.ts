import { isMaster } from "cluster";
import { Utils } from "../../../Utils";

export type IPCTarget = NodeJS.EventEmitter & { send?: Function };
export type Router = (message: Message) => void | Promise<void>;

export const suffix = isMaster ? Utils.GenerateGuid() : process.env.ipc_suffix;

export interface Message {
    name: string;
    args?: any;
}
type InternalMessage = Message & { metadata: any };

export type MessageHandler<T extends Message = Message> = (message: T) => any | Promise<any>;

export class PromisifiedIPCManager {
    private readonly target: IPCTarget;
    private readonly ipc_id = `ipc_id_${suffix}`;
    private readonly is_response = `is_response_${suffix}`;

    constructor(target: IPCTarget) {
        this.target = target;
    }

    public emit = async (name: string, args?: any, expectResponse = false): Promise<Error | undefined> => {
        if (!this.target.send) {
            return new Error("Cannot dispatch when send is undefined.");
        }
        if (expectResponse) {
            return new Promise(resolve => {
                const messageId = Utils.GenerateGuid();
                const metadata: any = {};
                metadata[this.ipc_id] = messageId;
                const responseHandler: MessageHandler<InternalMessage> = ({ args, metadata }) => {
                    if (metadata[this.is_response] && metadata[this.ipc_id] === messageId) {
                        const { error } = args;
                        this.target.removeListener("message", responseHandler);
                        resolve(error);
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