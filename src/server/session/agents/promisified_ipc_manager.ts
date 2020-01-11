import { Utils } from "../../../Utils";
import { isMaster } from "cluster";

/**
 * Convenience constructor
 * @param target the process / worker to which to attach the specialized listeners 
 */
export function IPC_Promisify(target: IPCTarget, router: Router) {
    return new PromisifiedIPCManager(target, router);
}

/**
 * Essentially, a node process or node cluster worker
 */
export type IPCTarget = NodeJS.EventEmitter & { send?: Function };

/**
 * Some external code that maps the name of  incoming messages to registered handlers, if any
 * when this returns, the message is assumed to have been handled in its entirety by the process, so
 * await any asynchronous code inside this router.
 */
export type Router = (message: Message) => void | Promise<void>;

/**
 * Specifies a general message format for this API 
 */
export type Message<T = any> = { name: string; args: T; };
export type MessageHandler<T = any> = (args: T) => any | Promise<any>;

/**
 * When a message is emitted, it 
 */
type InternalMessage = Message & { metadata: any };
type InternalMessageHandler = (message: InternalMessage) => any | Promise<any>;

/**
 * This is a wrapper utility class that allows the caller process
 * to emit an event and return a promise that resolves when it and all
 * other processes listening to its emission of this event have completed. 
 */
export class PromisifiedIPCManager {
    private readonly target: IPCTarget;

    constructor(target: IPCTarget, router: Router) {
        this.target = target;
        this.target.addListener("message", this.internalHandler(router));
    }

    /**
     * A convenience wrapper around the standard process emission.
     * Does not wait for a response. 
     */
    public emit = async (name: string, args?: any) => this.target.send?.({ name, args });

    /**
     * This routine uniquely identifies each message, then adds a general
     * message listener that waits for a response with the same id before resolving
     * the promise.
     */
    public emitPromise = async (name: string, args?: any) => {
        return new Promise(resolve => {
            const messageId = Utils.GenerateGuid();
            const responseHandler: InternalMessageHandler = ({ metadata: { id, isResponse }, args, name }) => {
                if (isResponse && id === messageId) {
                    this.target.removeListener("message", responseHandler);
                    resolve(args?.error as Error | undefined);
                }
            };
            this.target.addListener("message", responseHandler);
            const message = { name, args, metadata: { id: messageId } };
            this.target.send?.(message);
        });
    }

    /**
     * This routine receives a uniquely identified message. If the message is itself a response,
     * it is ignored to avoid infinite mutual responses. Otherwise, the routine awaits its completion using whatever
     * router the caller has installed, and then sends a response containing the original message id,
     * which will ultimately invoke the responseHandler of the original emission and resolve the
     * sender's promise.
     */
    private internalHandler = (router: Router) => async ({ name, args, metadata }: InternalMessage) => {
        if (name && (!metadata || !metadata.isResponse)) {
            let error: Error | undefined;
            try {
                await router({ name, args });
            } catch (e) {
                error = e;
            }
            if (metadata && this.target.send) {
                metadata.isResponse = true;
                this.target.send({ name, args: { error }, metadata });
            }
        }
    }

}