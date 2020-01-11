import { MessageHandler, PromisifiedIPCManager } from "./promisified_ipc_manager";

export default abstract class ProcessMessageRouter {

    protected static IPCManager: PromisifiedIPCManager;
    private onMessage: { [name: string]: MessageHandler[] | undefined } = {};

    /**
     * Add a listener at this message. When the monitor process
     * receives a message, it will invoke all registered functions.
     */
    public on = (name: string, handler: MessageHandler, exclusive = false) => {
        const handlers = this.onMessage[name];
        if (exclusive || !handlers) {
            this.onMessage[name] = [handler];
        } else {
            handlers.push(handler);
        }
    }

    /**
     * Unregister a given listener at this message.
     */
    public off = (name: string, handler: MessageHandler) => {
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
    public clearMessageListeners = (...names: string[]) => names.map(name => this.onMessage[name] = undefined);

    protected route: MessageHandler = async ({ name, args }) => {
        const handlers = this.onMessage[name];
        if (handlers) {
            await Promise.all(handlers.map(handler => handler(args)));
        }
    }

}