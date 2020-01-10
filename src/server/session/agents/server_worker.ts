import { ExitHandler } from "./applied_session_agent";
import { isMaster } from "cluster";
import { PromisifiedIPCManager } from "../utilities/ipc";
import { red, green, white, yellow } from "colors";
import { get } from "request-promise";
import { Monitor } from "./monitor";

/**
 * Effectively, each worker repairs the connection to the server by reintroducing a consistent state
 * if its predecessor has died. It itself also polls the server heartbeat, and exits with a notification
 * email if the server encounters an uncaught exception or if the server cannot be reached.
 */
export class ServerWorker {
    private static localIPCManager = new PromisifiedIPCManager(process);
    private static count = 0;
    private shouldServerBeResponsive = false;
    private exitHandlers: ExitHandler[] = [];
    private pollingFailureCount = 0;
    private pollingIntervalSeconds: number;
    private pollingFailureTolerance: number;
    private pollTarget: string;
    private serverPort: number;
    private isInitialized = false;

    public static Create(work: Function) {
        if (isMaster) {
            console.error(red("cannot create a worker on the monitor process."));
            process.exit(1);
        } else if (++ServerWorker.count > 1) {
            ServerWorker.localIPCManager.emit({
                action: {
                    message: "kill", args: {
                        reason: "cannot create more than one worker on a given worker process.",
                        graceful: false,
                        errorCode: 1
                    }
                }
            });
            process.exit(1);
        } else {
            return new ServerWorker(work);
        }
    }

    /**
     * Allows developers to invoke application specific logic
     * by hooking into the exiting of the server process.
     */
    public addExitHandler = (handler: ExitHandler) => this.exitHandlers.push(handler);

    /**
     * Kill the session monitor (parent process) from this
     * server worker (child process). This will also kill
     * this process (child process).
     */
    public killSession = (reason: string, graceful = true, errorCode = 0) => this.sendMonitorAction("kill", { reason, graceful, errorCode });

    /**
     * A convenience wrapper to tell the session monitor (parent process)
     * to carry out the action with the specified message and arguments.
     */
    public sendMonitorAction = (message: string, args?: any, expectResponse = false) => ServerWorker.localIPCManager.emit({ action: { message, args } }, expectResponse);

    private constructor(work: Function) {
        this.lifecycleNotification(green(`initializing process... ${white(`[${process.execPath} ${process.execArgv.join(" ")}]`)}`));

        const { pollingRoute, serverPort, pollingIntervalSeconds, pollingFailureTolerance } = process.env;
        this.serverPort = Number(serverPort);
        this.pollingIntervalSeconds = Number(pollingIntervalSeconds);
        this.pollingFailureTolerance = Number(pollingFailureTolerance);
        this.pollTarget = `http://localhost:${serverPort}${pollingRoute}`;

        this.configureProcess();
        work();
        this.pollServer();
    }

    /**
     * Set up message and uncaught exception handlers for this
     * server process.
     */
    private configureProcess = () => {
        // updates the local values of variables to the those sent from master
        ServerWorker.localIPCManager.addMessagesHandler(async ({ newPollingIntervalSeconds, manualExit }) => {
            if (newPollingIntervalSeconds !== undefined) {
                this.pollingIntervalSeconds = newPollingIntervalSeconds;
            }
            if (manualExit !== undefined) {
                const { isSessionEnd } = manualExit;
                await this.executeExitHandlers(isSessionEnd);
                process.exit(0);
            }
        });

        // one reason to exit, as the process might be in an inconsistent state after such an exception
        process.on('uncaughtException', this.proactiveUnplannedExit);
        process.on('unhandledRejection', reason => {
            const appropriateError = reason instanceof Error ? reason : new Error(`unhandled rejection: ${reason}`);
            this.proactiveUnplannedExit(appropriateError);
        });
    }

    /**
     * Execute the list of functions registered to be called
     * whenever the process exits.
     */
    private executeExitHandlers = async (reason: Error | boolean) => Promise.all(this.exitHandlers.map(handler => handler(reason)));

    /**
     * Notify master thread (which will log update in the console) of initialization via IPC.
     */
    public lifecycleNotification = (event: string) => ServerWorker.localIPCManager.emit({ lifecycle: event });

    /**
     * Called whenever the process has a reason to terminate, either through an uncaught exception
     * in the process (potentially inconsistent state) or the server cannot be reached.
     */
    private proactiveUnplannedExit = async (error: Error): Promise<void> => {
        this.shouldServerBeResponsive = false;
        // communicates via IPC to the master thread that it should dispatch a crash notification email
        this.sendMonitorAction(`notify_${Monitor.IntrinsicEvents.CrashDetected}`, { error });
        await this.executeExitHandlers(error);
        // notify master thread (which will log update in the console) of crash event via IPC
        this.lifecycleNotification(red(`crash event detected @ ${new Date().toUTCString()}`));
        this.lifecycleNotification(red(error.message));
        process.exit(1);
    }

    /**
     * This monitors the health of the server by submitting a get request to whatever port / route specified
     * by the configuration every n seconds, where n is also given by the configuration. 
     */
    private pollServer = async (): Promise<void> => {
        await new Promise<void>(resolve => {
            setTimeout(async () => {
                try {
                    await get(this.pollTarget);
                    if (!this.shouldServerBeResponsive) {
                        // notify monitor thread that the server is up and running
                        this.lifecycleNotification(green(`listening on ${this.serverPort}...`));
                        this.sendMonitorAction(`notify_${Monitor.IntrinsicEvents.ServerRunning}`, { firstTime: !this.isInitialized });
                        this.isInitialized = true;
                    }
                    this.shouldServerBeResponsive = true;
                } catch (error) {
                    // if we expect the server to be unavailable, i.e. during compilation,
                    // the listening variable is false, activeExit will return early and the child
                    // process will continue
                    if (this.shouldServerBeResponsive) {
                        if (++this.pollingFailureCount > this.pollingFailureTolerance) {
                            this.proactiveUnplannedExit(error);
                        } else {
                            this.lifecycleNotification(yellow(`the server has encountered ${this.pollingFailureCount} of ${this.pollingFailureTolerance} tolerable failures`));
                        }
                    }
                } finally {
                    resolve();
                }
            }, 1000 * this.pollingIntervalSeconds);
        });
        // controlled, asynchronous infinite recursion achieves a persistent poll that does not submit a new request until the previous has completed
        this.pollServer();
    }

}