import { isMaster } from "cluster";
import { Utils } from "../../../Utils";

export namespace IPC {

    export const suffix = isMaster ? Utils.GenerateGuid() : process.env.ipc_suffix;
    const ipc_id = `ipc_id_${suffix}`;
    const response_expected = `response_expected_${suffix}`;
    const is_response = `is_response_${suffix}`;

    export async function dispatchMessage(target: NodeJS.EventEmitter & { send?: Function }, message: any, expectResponse = false): Promise<Error | undefined> {
        if (!target.send) {
            return new Error("Cannot dispatch when send is undefined.");
        }
        message[response_expected] = expectResponse;
        if (expectResponse) {
            return new Promise(resolve => {
                const messageId = Utils.GenerateGuid();
                message[ipc_id] = messageId;
                const responseHandler: (args: any) => void = response => {
                    const { error } = response;
                    if (response[is_response] && response[ipc_id] === messageId) {
                        target.removeListener("message", responseHandler);
                        resolve(error);
                    }
                };
                target.addListener("message", responseHandler);
                target.send!(message);
            });
        } else {
            target.send(message);
        }
    }

    export function addMessagesHandler(target: NodeJS.EventEmitter & { send?: Function }, handler: (message: any) => void | Promise<void>): void {
        target.addListener("message", async incoming => {
            let error: Error | undefined;
            try {
                await handler(incoming);
            } catch (e) {
                error = e;
            }
            if (incoming[response_expected] && target.send) {
                const response: any = { error };
                response[ipc_id] = incoming[ipc_id];
                response[is_response] = true;
                target.send(response);
            }
        });
    }

}