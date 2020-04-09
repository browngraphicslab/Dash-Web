import { isMaster } from "cluster";
import { Monitor } from "./monitor";
import { ServerWorker } from "./server_worker";
import { Utilities } from "../utilities/utilities";

export type ExitHandler = (reason: Error | boolean) => void | Promise<void>;

export abstract class AppliedSessionAgent {

    // the following two methods allow the developer to create a custom
    // session and use the built in customization options for each thread
    protected abstract async initializeMonitor(monitor: Monitor): Promise<string>;
    protected abstract async initializeServerWorker(): Promise<ServerWorker>;

    private launched = false;

    public killSession = (reason: string, graceful = true, errorCode = 0) => {
        const target = isMaster ? this.sessionMonitor : this.serverWorker;
        target.killSession(reason, graceful, errorCode);
    }

    private sessionMonitorRef: Monitor | undefined;
    public get sessionMonitor(): Monitor {
        if (!isMaster) {
            this.serverWorker.emit("kill", {
                graceful: false,
                reason: "Cannot access the session monitor directly from the server worker thread.",
                errorCode: 1
            });
            throw new Error();
        }
        return this.sessionMonitorRef!;
    }

    private serverWorkerRef: ServerWorker | undefined;
    public get serverWorker(): ServerWorker {
        if (isMaster) {
            throw new Error("Cannot access the server worker directly from the session monitor thread");
        }
        return this.serverWorkerRef!;
    }

    public async launch(): Promise<void> {
        if (!this.launched) {
            this.launched = true;
            if (isMaster) {
                this.sessionMonitorRef = Monitor.Create();
                const sessionKey = await this.initializeMonitor(this.sessionMonitorRef);
                this.sessionMonitorRef.finalize(sessionKey);
            } else {
                this.serverWorkerRef = await this.initializeServerWorker();
            }
        } else {
            throw new Error("Cannot launch a session thread more than once per process.");
        }
    }

}