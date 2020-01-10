import { isMaster } from "cluster";
import { Utils } from "../../../Utils";

export type IPCTarget = NodeJS.EventEmitter & { send?: Function };
export type Listener = (message: any) => void | Promise<void>;

export const suffix = isMaster ? Utils.GenerateGuid() : process.env.ipc_suffix;

export class PromisifiedIPCManager {
    private readonly target: IPCTarget;
    private readonly ipc_id = `ipc_id_${suffix}`;
    private readonly response_expected = `response_expected_${suffix}`;
    private readonly is_response = `is_response_${suffix}`;

    constructor(target: IPCTarget) {
        this.target = target;
    }

    public emit = async (message: any, expectResponse = false): Promise<Error | undefined> => {
        if (!this.target.send) {
            return new Error("Cannot dispatch when send is undefined.");
        }
        message[this.response_expected] = expectResponse;
        if (expectResponse) {
            return new Promise(resolve => {
                const messageId = Utils.GenerateGuid();
                message[this.ipc_id] = messageId;
                const responseHandler: (args: any) => void = response => {
                    const { error } = response;
                    if (response[this.is_response] && response[this.ipc_id] === messageId) {
                        this.target.removeListener("message", responseHandler);
                        resolve(error);
                    }
                };
                this.target.addListener("message", responseHandler);
                this.target.send!(message);
            });
        } else {
            this.target.send(message);
        }
    }

    public addMessagesHandler = (handler: Listener): void => {
        this.target.addListener("message", async incoming => {
            let error: Error | undefined;
            try {
                await handler(incoming);
            } catch (e) {
                error = e;
            }
            if (incoming[this.response_expected] && this.target.send) {
                const response: any = { error };
                response[this.ipc_id] = incoming[this.ipc_id];
                response[this.is_response] = true;
                this.target.send(response);
            }
        });
    }

}