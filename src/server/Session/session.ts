import { red, cyan, green, yellow, magenta, blue } from "colors";
import { on, fork, setupMaster, Worker, isMaster } from "cluster";
import { get } from "request-promise";
import { Utils } from "../../Utils";
import Repl, { ReplAction } from "../repl";
import { readFileSync } from "fs";
import { validate, ValidationError } from "jsonschema";
import { configurationSchema } from "./session_config_schema";

/**
     * This namespace relies on NodeJS's cluster module, which allows a parent (master) process to share
     * code with its children (workers). A simple `isMaster` flag indicates who is trying to access
     * the code, and thus determines the functionality that actually gets invoked (checked by the caller, not internally).
     * 
     * Think of the master thread as a factory, and the workers as the helpers that actually run the server.
     * 
     * So, when we run `npm start`, given the appropriate check, initializeMaster() is called in the parent process
     * This will spawn off its own child process (by default, mirrors the execution path of its parent),
     * in which initializeWorker() is invoked.
     */
export namespace Session {

    export abstract class AppliedSessionAgent {

        private launched = false;

        protected sessionMonitorRef: Session.Monitor | undefined;
        public get sessionMonitor(): Session.Monitor {
            if (!isMaster) {
                throw new Error("Cannot access the session monitor directly from the server worker thread");
            }
            return this.sessionMonitorRef!;
        }
        public set sessionMonitor(monitor: Session.Monitor) {
            if (!isMaster) {
                throw new Error("Cannot set the session monitor directly from the server worker thread");
            }
            this.sessionMonitorRef = monitor;
        }

        protected serverWorkerRef: Session.ServerWorker | undefined;
        public get serverWorker(): Session.ServerWorker {
            if (isMaster) {
                throw new Error("Cannot access the server worker directly from the session monitor thread");
            }
            return this.serverWorkerRef!;
        }
        public set serverWorker(worker: Session.ServerWorker) {
            if (isMaster) {
                throw new Error("Cannot set the server worker directly from the session monitor thread");
            }
            this.serverWorkerRef = worker;
        }

        public async launch(): Promise<void> {
            if (!this.launched) {
                this.launched = true;
                await this.launchImplementation();
            } else {
                throw new Error("Cannot launch a session thread more than once per process.");
            }
        }

        protected abstract async launchImplementation(): Promise<void>;

    }

    interface Configuration {
        showServerOutput: boolean;
        masterIdentifier: string;
        workerIdentifier: string;
        ports: { [description: string]: number };
        pollingRoute: string;
        pollingIntervalSeconds: number;
        pollingFailureTolerance: number;
        [key: string]: any;
    }

    const defaultConfiguration: Configuration = {
        showServerOutput: false,
        masterIdentifier: yellow("__monitor__:"),
        workerIdentifier: magenta("__server__:"),
        ports: { server: 3000 },
        pollingRoute: "/",
        pollingIntervalSeconds: 30,
        pollingFailureTolerance: 1
    };

    export interface Monitor {
        log: (...optionalParams: any[]) => void;
        restartServer: () => void;
        setPort: (port: "server" | "socket" | string, value: number, immediateRestart: boolean) => void;
        killSession: (graceful?: boolean) => never;
        addReplCommand: (basename: string, argPatterns: (RegExp | string)[], action: ReplAction) => void;
        addChildMessageHandler: (message: string, handler: ActionHandler) => void;
    }

    export interface ServerWorker {
        killSession: () => void;
        addExitHandler: (handler: ExitHandler) => void;
    }

    export interface MonitorNotifierHooks {
        key?: (key: string, masterLog: (...optionalParams: any[]) => void) => boolean | Promise<boolean>;
        crash?: (error: Error, masterLog: (...optionalParams: any[]) => void) => boolean | Promise<boolean>;
    }

    export interface SessionAction {
        message: string;
        args: any;
    }

    export type ExitHandler = (reason: Error | null) => void | Promise<void>;
    export type ActionHandler = (action: SessionAction) => void | Promise<void>;
    export interface EmailTemplate {
        subject: string;
        body: string;
    }

    function loadAndValidateConfiguration(): Configuration {
        try {
            console.log(timestamp(), cyan("validating configuration..."));
            const configuration: Configuration = JSON.parse(readFileSync('./session.config.json', 'utf8'));
            const options = {
                throwError: true,
                allowUnknownAttributes: false
            };
            // ensure all necessary and no excess information is specified by the configuration file
            validate(configuration, configurationSchema, options);
            let formatMaster = true;
            let formatWorker = true;
            Object.keys(defaultConfiguration).forEach(property => {
                if (!configuration[property]) {
                    if (property === "masterIdentifier") {
                        formatMaster = false;
                    } else if (property === "workerIdentifier") {
                        formatWorker = false;
                    }
                    configuration[property] = defaultConfiguration[property];
                }
            });
            if (formatMaster) {
                configuration.masterIdentifier = yellow(configuration.masterIdentifier + ":");
            }
            if (formatWorker) {
                configuration.workerIdentifier = magenta(configuration.workerIdentifier + ":");
            }
            return configuration;
        } catch (error) {
            if (error instanceof ValidationError) {
                console.log(red("\nSession configuration failed."));
                console.log("The given session.config.json configuration file is invalid.");
                console.log(`${error.instance}: ${error.stack}`);
                process.exit(0);
            } else if (error.code === "ENOENT" && error.path === "./session.config.json") {
                console.log(cyan("Loading default session parameters..."));
                console.log("Consider including a session.config.json configuration file in your project root for customization.");
                return defaultConfiguration;
            } else {
                console.log(red("\nSession configuration failed."));
                console.log("The following unknown error occurred during configuration.");
                console.log(error.stack);
                process.exit(0);
            }
        }
    }

    function timestamp() {
        return blue(`[${new Date().toUTCString()}]`);
    }

    /**
     * Validates and reads the configuration file, accordingly builds a child process factory
     * and spawns off an initial process that will respawn as predecessors die.
     */
    export async function initializeMonitorThread(notifiers?: MonitorNotifierHooks): Promise<Monitor> {
        console.log(timestamp(), cyan("initializing session..."));
        let activeWorker: Worker;
        const childMessageHandlers: { [message: string]: ActionHandler } = {};

        // read in configuration .json file only once, in the master thread
        // pass down any variables the pertinent to the child processes as environment variables
        const configuration = loadAndValidateConfiguration();
        const {
            masterIdentifier,
            workerIdentifier,
            ports,
            pollingRoute,
            showServerOutput,
            pollingFailureTolerance
        } = configuration;
        let { pollingIntervalSeconds } = configuration;

        const log = (...optionalParams: any[]) => console.log(timestamp(), masterIdentifier, ...optionalParams);

        // this sends a pseudorandomly generated guid to the configuration's recipients, allowing them alone
        // to kill the server via the /kill/:key route
        let key: string | undefined;
        if (notifiers && notifiers.key) {
            key = Utils.GenerateGuid();
            const success = await notifiers.key(key, log);
            const statement = success ? green("distributed session key to recipients") : red("distribution of session key failed");
            log(statement);
        }

        // handle exceptions in the master thread - there shouldn't be many of these
        // the IPC (inter process communication) channel closed exception can't seem
        // to be caught in a try catch, and is inconsequential, so it is ignored
        process.on("uncaughtException", ({ message, stack }): void => {
            if (message !== "Channel closed") {
                log(red(message));
                if (stack) {
                    log(`uncaught exception\n${red(stack)}`);
                }
            }
        });

        // determines whether or not we see the compilation / initialization / runtime output of each child server process
        setupMaster({ silent: !showServerOutput });

        // attempts to kills the active worker ungracefully, unless otherwise specified
        const tryKillActiveWorker = (graceful = false): boolean => {
            if (activeWorker && !activeWorker.isDead()) {
                if (graceful) {
                    activeWorker.kill();
                } else {
                    activeWorker.process.kill();
                }
                return true;
            }
            return false;
        };

        const restartServer = (): void => {
            // indicate to the worker that we are 'expecting' this restart
            activeWorker.send({ setResponsiveness: false });
            tryKillActiveWorker(true);
        };

        const killSession = (graceful = true): never => {
            log(cyan(`exiting session ${graceful ? "clean" : "immediate"}ly`));
            tryKillActiveWorker(graceful);
            process.exit(0);
        };

        const setPort = (port: "server" | "socket" | string, value: number, immediateRestart: boolean): void => {
            if (value > 1023 && value < 65536) {
                ports[port] = value;
                if (immediateRestart) {
                    restartServer();
                }
            } else {
                log(red(`${port} is an invalid port number`));
            }
        };

        // kills the current active worker and proceeds to spawn a new worker,
        // feeding in configuration information as environment variables
        const spawn = (): void => {
            tryKillActiveWorker();
            activeWorker = fork({
                pollingRoute,
                pollingFailureTolerance,
                serverPort: ports.server,
                socketPort: ports.socket,
                pollingIntervalSeconds,
                session_key: key
            });
            log(cyan(`spawned new server worker with process id ${activeWorker.process.pid}`));
            // an IPC message handler that executes actions on the master thread when prompted by the active worker
            activeWorker.on("message", async ({ lifecycle, action }) => {
                if (action) {
                    const { message, args } = action as SessionAction;
                    console.log(timestamp(), `${workerIdentifier} action requested (${cyan(message)})`);
                    switch (message) {
                        case "kill":
                            log(red("an authorized user has manually ended the server session"));
                            killSession();
                        case "notify_crash":
                            if (notifiers && notifiers.crash) {
                                const { error } = args;
                                const success = await notifiers.crash(error, log);
                                const statement = success ? green("distributed crash notification to recipients") : red("distribution of crash notification failed");
                                log(statement);
                            }
                        case "set_port":
                            const { port, value, immediateRestart } = args;
                            setPort(port, value, immediateRestart);
                        default:
                            const handler = childMessageHandlers[message];
                            if (handler) {
                                handler({ message, args });
                            }
                    }
                } else if (lifecycle) {
                    console.log(timestamp(), `${workerIdentifier} lifecycle phase (${lifecycle})`);
                }
            });
        };

        // a helpful cluster event called on the master thread each time a child process exits
        on("exit", ({ process: { pid } }, code, signal) => {
            const prompt = `server worker with process id ${pid} has exited with code ${code}${signal === null ? "" : `, having encountered signal ${signal}`}.`;
            log(cyan(prompt));
            // to make this a robust, continuous session, every time a child process dies, we immediately spawn a new one
            spawn();
        });

        // builds the repl that allows the following commands to be typed into stdin of the master thread
        const repl = new Repl({ identifier: () => `${timestamp()} ${masterIdentifier}` });
        const boolean = /true|false/;
        const number = /\d+/;
        const letters = /[a-zA-Z]+/;
        repl.registerCommand("exit", [/clean|force/], args => killSession(args[0] === "clean"));
        repl.registerCommand("restart", [], restartServer);
        repl.registerCommand("set", [letters, "port", number, boolean], args => setPort(args[0], Number(args[2]), args[3] === "true"));
        repl.registerCommand("set", [/polling/, number, boolean], args => {
            const newPollingIntervalSeconds = Math.floor(Number(args[2]));
            if (newPollingIntervalSeconds < 0) {
                log(red("the polling interval must be a non-negative integer"));
            } else {
                if (newPollingIntervalSeconds !== pollingIntervalSeconds) {
                    pollingIntervalSeconds = newPollingIntervalSeconds;
                    if (args[3] === "true") {
                        activeWorker.send({ newPollingIntervalSeconds });
                    }
                }
            }
        });
        // finally, set things in motion by spawning off the first child (server) process
        spawn();

        // returned to allow the caller to add custom commands
        return {
            addReplCommand: repl.registerCommand,
            addChildMessageHandler: (message: string, handler: ActionHandler) => { childMessageHandlers[message] = handler; },
            restartServer,
            killSession,
            setPort,
            log
        };
    }

    /**
     * Effectively, each worker repairs the connection to the server by reintroducing a consistent state
     * if its predecessor has died. It itself also polls the server heartbeat, and exits with a notification
     * email if the server encounters an uncaught exception or if the server cannot be reached.
     * @param work the function specifying the work to be done by each worker thread
     */
    export async function initializeWorkerThread(work: Function): Promise<ServerWorker> {
        let shouldServerBeResponsive = false;
        const exitHandlers: ExitHandler[] = [];
        let pollingFailureCount = 0;

        const lifecycleNotification = (lifecycle: string) => process.send?.({ lifecycle });

        // notify master thread (which will log update in the console) of initialization via IPC
        lifecycleNotification(green("compiling and initializing..."));

        // updates the local value of listening to the value sent from master
        process.on("message", ({ setResponsiveness, newPollingIntervalSeconds }) => {
            if (setResponsiveness) {
                shouldServerBeResponsive = setResponsiveness;
            }
            if (newPollingIntervalSeconds) {
                pollingIntervalSeconds = newPollingIntervalSeconds;
            }
        });

        const executeExitHandlers = async (reason: Error | null) => Promise.all(exitHandlers.map(handler => handler(reason)));

        // called whenever the process has a reason to terminate, either through an uncaught exception
        // in the process (potentially inconsistent state) or the server cannot be reached
        const activeExit = async (error: Error): Promise<void> => {
            shouldServerBeResponsive = false;
            // communicates via IPC to the master thread that it should dispatch a crash notification email
            process.send?.({
                action: {
                    message: "notify_crash",
                    args: { error }
                }
            });
            await executeExitHandlers(error);
            // notify master thread (which will log update in the console) of crash event via IPC
            lifecycleNotification(red(`crash event detected @ ${new Date().toUTCString()}`));
            lifecycleNotification(red(error.message));
            process.exit(1);
        };

        // one reason to exit, as the process might be in an inconsistent state after such an exception
        process.on('uncaughtException', activeExit);

        const { env } = process;
        const { pollingRoute, serverPort } = env;
        let pollingIntervalSeconds = Number(env.pollingIntervalSeconds);
        const pollingFailureTolerance = Number(env.pollingFailureTolerance);
        // this monitors the health of the server by submitting a get request to whatever port / route specified
        // by the configuration every n seconds, where n is also given by the configuration. 
        const pollTarget = `http://localhost:${serverPort}${pollingRoute}`;
        const pollServer = async (): Promise<void> => {
            await new Promise<void>(resolve => {
                setTimeout(async () => {
                    try {
                        await get(pollTarget);
                        if (!shouldServerBeResponsive) {
                            // notify master thread (which will log update in the console) via IPC that the server is up and running
                            process.send?.({ lifecycle: green(`listening on ${serverPort}...`) });
                        }
                        shouldServerBeResponsive = true;
                        resolve();
                    } catch (error) {
                        // if we expect the server to be unavailable, i.e. during compilation,
                        // the listening variable is false, activeExit will return early and the child
                        // process will continue
                        if (shouldServerBeResponsive) {
                            if (++pollingFailureCount > pollingFailureTolerance) {
                                activeExit(error);
                            } else {
                                lifecycleNotification(yellow(`the server has encountered ${pollingFailureCount} of ${pollingFailureTolerance} tolerable failures`));
                            }
                        }
                    }
                }, 1000 * pollingIntervalSeconds);
            });
            // controlled, asynchronous infinite recursion achieves a persistent poll that does not submit a new request until the previous has completed
            pollServer();
        };

        work();
        pollServer(); // begin polling

        return {
            addExitHandler: (handler: ExitHandler) => exitHandlers.push(handler),
            killSession: () => process.send!({ action: { message: "kill" } })
        };
    }

}