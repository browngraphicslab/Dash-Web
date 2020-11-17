import { Utilities } from "../utilities/utilities";
import { ChildProcess } from "child_process";

/**
 * Convenience constructor
 * @param target the process / worker to which to attach the specialized listeners 
 */
export function manage(target: IPCTarget, handlers?: HandlerMap) {
    return new PromisifiedIPCManager(target, handlers);
}

/**
 * Captures the logic to execute upon receiving a message
 * of a certain name.
 */
export type HandlerMap = { [name: string]: MessageHandler[] };

/**
 * This will always literally be a child process. But, though setting
 * up a manager in the parent will indeed see the target as the ChildProcess,
 * setting up a manager in the child will just see itself as a regular NodeJS.Process. 
 */
export type IPCTarget = NodeJS.Process | ChildProcess;

/**
 * Specifies a general message format for this API 
 */
export type Message<T = any> = {
    name: string;
    args?: T;
};
export type MessageHandler<T = any> = (args: T) => (any | Promise<any>);

/**
 * When a message is emitted, it is embedded with private metadata
 * to facilitate the resolution of promises, etc.
 */
interface InternalMessage extends Message { metadata: Metadata; }
interface Metadata { isResponse: boolean; id: string; }
type InternalMessageHandler = (message: InternalMessage) => (any | Promise<any>);

/**
 * Allows for the transmission of the error's key features over IPC.
 */
export interface ErrorLike {
    name: string;
    message: string;
    stack?: string;
}

/**
 * The arguments returned in a message sent from the target upon completion.
 */
export interface Response<T = any> {
    results?: T[];
    error?: ErrorLike;
}

const destroyEvent = "__destroy__";

/**
 * This is a wrapper utility class that allows the caller process
 * to emit an event and return a promise that resolves when it and all
 * other processes listening to its emission of this event have completed. 
 */
export class PromisifiedIPCManager {
    private readonly target: IPCTarget;
    private pendingMessages: { [id: string]: string } = {};
    private isDestroyed = false;
    private get callerIsTarget() {
        return process.pid === this.target.pid;
    }

    constructor(target: IPCTarget, handlers?: HandlerMap) {
        this.target = target;
        if (handlers) {
            handlers[destroyEvent] = [this.destroyHelper];
            this.target.addListener("message", this.generateInternalHandler(handlers));
        }
    }

    /**
     * This routine uniquely identifies each message, then adds a general
     * message listener that waits for a response with the same id before resolving
     * the promise.
     */
    public emit = async <T = any>(name: string, args?: any): Promise<Response<T>> => {
        if (this.isDestroyed) {
            const error = { name: "FailedDispatch", message: "Cannot use a destroyed IPC manager to emit a message." };
            return { error };
        }
        return new Promise<Response<T>>(resolve => {
            const messageId = Utilities.guid();
            const responseHandler: InternalMessageHandler = ({ metadata: { id, isResponse }, args }) => {
                if (isResponse && id === messageId) {
                    this.target.removeListener("message", responseHandler);
                    resolve(args);
                }
            };
            this.target.addListener("message", responseHandler);
            const message = { name, args, metadata: { id: messageId, isResponse: false } };
            if (!(this.target.send && this.target.send(message))) {
                const error: ErrorLike = { name: "FailedDispatch", message: "Either the target's send method was undefined or the act of sending failed." };
                resolve({ error });
                this.target.removeListener("message", responseHandler);
            }
        });
    }

    /**
     * Invoked from either the parent or the child process, this allows
     * any unresolved promises to continue in the target process, but dispatches a dummy
     * completion response for each of the pending messages, allowing their
     * promises in the caller to resolve.
     */
    public destroy = () => {
        return new Promise<void>(async resolve => {
            if (this.callerIsTarget) {
                this.destroyHelper();
            } else {
                await this.emit(destroyEvent);
            }
            resolve();
        });
    }

    /**
     * Dispatches the dummy responses and sets the isDestroyed flag to true.
     */
    private destroyHelper = () => {
        const { pendingMessages } = this;
        this.isDestroyed = true;
        Object.keys(pendingMessages).forEach(id => {
            const error: ErrorLike = { name: "ManagerDestroyed", message: "The IPC manager was destroyed before the response could be returned." };
            const message: InternalMessage = { name: pendingMessages[id], args: { error }, metadata: { id, isResponse: true } };
            this.target.send?.(message);
        });
        this.pendingMessages = {};
    }

    /**
     * This routine receives a uniquely identified message. If the message is itself a response,
     * it is ignored to avoid infinite mutual responses. Otherwise, the routine awaits its completion using whatever
     * router the caller has installed, and then sends a response containing the original message id,
     * which will ultimately invoke the responseHandler of the original emission and resolve the
     * sender's promise.
     */
    private generateInternalHandler = (handlers: HandlerMap): MessageHandler => async (message: InternalMessage) => {
        const { name, args, metadata } = message;
        if (name && metadata && !metadata.isResponse) {
            const { id } = metadata;
            this.pendingMessages[id] = name;
            let error: Error | undefined;
            let results: any[] | undefined;
            try {
                const registered = handlers[name];
                if (registered) {
                    results = await Promise.all(registered.map(handler => handler(args)));
                }
            } catch (e) {
                error = e;
            }
            if (!this.isDestroyed && this.target.send) {
                const metadata = { id, isResponse: true };
                const response: Response = { results, error };
                const message = { name, args: response, metadata };
                delete this.pendingMessages[id];
                this.target.send(message);
            }
        }
    }

}