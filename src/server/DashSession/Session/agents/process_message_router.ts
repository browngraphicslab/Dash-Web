import { MessageHandler, PromisifiedIPCManager, HandlerMap } from "./promisified_ipc_manager";

export default abstract class IPCMessageReceiver {

    protected static IPCManager: PromisifiedIPCManager;
    protected handlers: HandlerMap = {};

    protected abstract configureInternalHandlers: () => void;

    /**
     * Add a listener at this message. When the monitor process
     * receives a message, it will invoke all registered functions.
     */
    public on = (name: string, handler: MessageHandler) => {
        const handlers = this.handlers[name];
        if (!handlers) {
            this.handlers[name] = [handler];
        } else {
            handlers.push(handler);
        }
    }

    /**
     * Unregister a given listener at this message.
     */
    public off = (name: string, handler: MessageHandler) => {
        const handlers = this.handlers[name];
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
    public clearMessageListeners = (...names: string[]) => names.map(name => delete this.handlers[name]);

}