import { red, cyan, green, yellow, magenta, blue, white } from "colors";
import { on, fork, setupMaster, Worker, isMaster, isWorker } from "cluster";
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

        // the following two methods allow the developer to create a custom
        // session and use the built in customization options for each thread
        protected abstract async launchMonitor(): Promise<Session.Monitor>;
        protected abstract async launchServerWorker(): Promise<Session.ServerWorker>;

        private launched = false;

        public killSession(graceful = true) {
            const target = isMaster ? this.sessionMonitor : this.serverWorker;
            target.killSession(graceful);
        }


        private sessionMonitorRef: Session.Monitor | undefined;
        public get sessionMonitor(): Session.Monitor {
            if (!isMaster) {
                throw new Error("Cannot access the session monitor directly from the server worker thread");
            }
            return this.sessionMonitorRef!;
        }

        private serverWorkerRef: Session.ServerWorker | undefined;
        public get serverWorker(): Session.ServerWorker {
            if (isMaster) {
                throw new Error("Cannot access the server worker directly from the session monitor thread");
            }
            return this.serverWorkerRef!;
        }

        public async launch(): Promise<void> {
            if (!this.launched) {
                this.launched = true;
                if (isMaster) {
                    this.sessionMonitorRef = await this.launchMonitor();
                } else {
                    this.serverWorkerRef = await this.launchServerWorker();
                }
            } else {
                throw new Error("Cannot launch a session thread more than once per process.");
            }
        }

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
        pollingFailureTolerance: 0
    };

    export type ExitHandler = (reason: Error | null) => void | Promise<void>;

    export namespace Monitor {

        export interface NotifierHooks {
            key?: (key: string) => (boolean | Promise<boolean>);
            crash?: (error: Error) => (boolean | Promise<boolean>);
        }

        export interface Action {
            message: string;
            args: any;
        }

        export type ServerMessageHandler = (action: Action) => void | Promise<void>;

    }

    /**
     * Validates and reads the configuration file, accordingly builds a child process factory
     * and spawns off an initial process that will respawn as predecessors die.
     */
    export class Monitor {

        private static count = 0;
        private exitHandlers: ExitHandler[] = [];
        private readonly notifiers: Monitor.NotifierHooks | undefined;
        private readonly configuration: Configuration;
        private onMessage: { [message: string]: Monitor.ServerMessageHandler[] | undefined } = {};
        private activeWorker: Worker | undefined;
        private key: string | undefined;
        private repl: Repl;

        public static Create(notifiers?: Monitor.NotifierHooks) {
            if (isWorker) {
                console.error(red("Monitor must be on the master process."));
                process.exit(1);
            } else if (++Monitor.count > 1) {
                console.error(("Cannot create more than one monitor."));
                process.exit(1);
            } else {
                return new Monitor(notifiers);
            }
        }

        /**
         * Kill this session and its active child
         * server process, either gracefully (may wait
         * indefinitely, but at least allows active networking
         * requests to complete) or immediately.
         */
        public killSession = async (graceful = true) => {
            this.log(cyan(`exiting session ${graceful ? "clean" : "immediate"}ly`));
            await this.executeExitHandlers(null);
            this.tryKillActiveWorker(graceful);
            process.exit(0);
        }

        /**
         * Execute the list of functions registered to be called
         * whenever the process exits.
         */
        public addExitHandler = (handler: ExitHandler) => this.exitHandlers.push(handler);

        /**
         * Extend the default repl by adding in custom commands
         * that can invoke application logic external to this module
         */
        public addReplCommand = (basename: string, argPatterns: (RegExp | string)[], action: ReplAction) => {
            this.repl.registerCommand(basename, argPatterns, action);
        }

        /**
         * Add a listener at this message. When the monitor process
         * receives a message, it will invoke all registered functions.
         */
        public addServerMessageListener = (message: string, handler: Monitor.ServerMessageHandler) => {
            const handlers = this.onMessage[message];
            if (handlers) {
                handlers.push(handler);
            } else {
                this.onMessage[message] = [handler];
            }
        }

        /**
         * Unregister a given listener at this message.
         */
        public removeServerMessageListener = (message: string, handler: Monitor.ServerMessageHandler) => {
            const handlers = this.onMessage[message];
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
        public clearServerMessageListeners = (message: string) => this.onMessage[message] = undefined;

        private constructor(notifiers?: Monitor.NotifierHooks) {
            this.notifiers = notifiers;

            console.log(this.timestamp(), cyan("initializing session..."));

            this.configuration = this.loadAndValidateConfiguration();
            this.initializeSessionKey();
            // determines whether or not we see the compilation / initialization / runtime output of each child server process
            setupMaster({ silent: !this.configuration.showServerOutput });

            // handle exceptions in the master thread - there shouldn't be many of these
            // the IPC (inter process communication) channel closed exception can't seem
            // to be caught in a try catch, and is inconsequential, so it is ignored
            process.on("uncaughtException", ({ message, stack }): void => {
                if (message !== "Channel closed") {
                    this.log(red(message));
                    if (stack) {
                        this.log(`uncaught exception\n${red(stack)}`);
                    }
                }
            });

            // a helpful cluster event called on the master thread each time a child process exits
            on("exit", ({ process: { pid } }, code, signal) => {
                const prompt = `server worker with process id ${pid} has exited with code ${code}${signal === null ? "" : `, having encountered signal ${signal}`}.`;
                this.log(cyan(prompt));
                // to make this a robust, continuous session, every time a child process dies, we immediately spawn a new one
                this.spawn();
            });

            this.repl = this.initializeRepl();
            this.spawn();
        }


        /**
         * Generates a blue UTC string associated with the time
         * of invocation.
         */
        private timestamp = () => blue(`[${new Date().toUTCString()}]`);

        /**
         * A formatted, identified and timestamped log in color
         */
        public log = (...optionalParams: any[]) => {
            console.log(this.timestamp(), this.configuration.masterIdentifier, ...optionalParams);
        }

        /**
         * If the caller has indicated an interest
         * in being notified of this feature, creates
         * a GUID for this session that can, for example,
         * be used as authentication for killing the server
         * (checked externally).
         */
        private initializeSessionKey = async (): Promise<void> => {
            if (this.notifiers?.key) {
                this.key = Utils.GenerateGuid();
                const success = await this.notifiers.key(this.key);
                const statement = success ? green("distributed session key to recipients") : red("distribution of session key failed");
                this.log(statement);
            }
        }

        /**
         * Builds the repl that allows the following commands to be typed into stdin of the master thread.
         */
        private initializeRepl = (): Repl => {
            const repl = new Repl({ identifier: () => `${this.timestamp()} ${this.configuration.masterIdentifier}` });
            const boolean = /true|false/;
            const number = /\d+/;
            const letters = /[a-zA-Z]+/;
            repl.registerCommand("exit", [/clean|force/], args => this.killSession(args[0] === "clean"));
            repl.registerCommand("restart", [/clean|force/], args => this.tryKillActiveWorker(args[0] === "clean"));
            repl.registerCommand("set", [letters, "port", number, boolean], args => this.setPort(args[0], Number(args[2]), args[3] === "true"));
            repl.registerCommand("set", [/polling/, number, boolean], args => {
                const newPollingIntervalSeconds = Math.floor(Number(args[2]));
                if (newPollingIntervalSeconds < 0) {
                    this.log(red("the polling interval must be a non-negative integer"));
                } else {
                    if (newPollingIntervalSeconds !== this.configuration.pollingIntervalSeconds) {
                        this.configuration.pollingIntervalSeconds = newPollingIntervalSeconds;
                        if (args[3] === "true") {
                            this.activeWorker?.send({ newPollingIntervalSeconds });
                        }
                    }
                }
            });
            return repl;
        }

        /**
         * Reads in configuration .json file only once, in the master thread
         * and pass down any variables the pertinent to the child processes as environment variables.
         */
        private loadAndValidateConfiguration = (): Configuration => {
            try {
                console.log(this.timestamp(), cyan("validating configuration..."));
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


        private executeExitHandlers = async (reason: Error | null) => Promise.all(this.exitHandlers.map(handler => handler(reason)));

        /**
         * Attempts to kill the active worker gracefully, unless otherwise specified.
         */
        private tryKillActiveWorker = (graceful = true): boolean => {
            if (!this.activeWorker?.isDead()) {
                if (graceful) {
                    this.activeWorker?.send({ manualExit: true });
                } else {
                    this.activeWorker?.process.kill();
                }
                return true;
            }
            return false;
        }

        /**
         * Allows the caller to set the port at which the target (be it the server,
         * the websocket, some other custom port) is listening. If an immediate restart
         * is specified, this monitor will kill the active child and re-launch the server
         * at the port. Otherwise, the updated port won't be used until / unless the child
         * dies on its own and triggers a restart.
         */
        private setPort = (port: "server" | "socket" | string, value: number, immediateRestart: boolean): void => {
            if (value > 1023 && value < 65536) {
                this.configuration.ports[port] = value;
                if (immediateRestart) {
                    this.tryKillActiveWorker();
                }
            } else {
                this.log(red(`${port} is an invalid port number`));
            }
        }

        /**
         * Kills the current active worker and proceeds to spawn a new worker,
         * feeding in configuration information as environment variables.
         */
        private spawn = (): void => {
            const {
                pollingRoute,
                pollingFailureTolerance,
                pollingIntervalSeconds,
                ports
            } = this.configuration;
            this.tryKillActiveWorker();
            this.activeWorker = fork({
                pollingRoute,
                pollingFailureTolerance,
                serverPort: ports.server,
                socketPort: ports.socket,
                pollingIntervalSeconds,
                session_key: this.key
            });
            this.log(cyan(`spawned new server worker with process id ${this.activeWorker.process.pid}`));
            // an IPC message handler that executes actions on the master thread when prompted by the active worker
            this.activeWorker.on("message", async ({ lifecycle, action }) => {
                if (action) {
                    const { message, args } = action as Monitor.Action;
                    console.log(this.timestamp(), `${this.configuration.workerIdentifier} action requested (${cyan(message)})`);
                    switch (message) {
                        case "kill":
                            this.log(red("an authorized user has manually ended the server session"));
                            this.killSession(args.graceful);
                            break;
                        case "notify_crash":
                            if (this.notifiers?.crash) {
                                const { error } = args;
                                const success = await this.notifiers.crash(error);
                                const statement = success ? green("distributed crash notification to recipients") : red("distribution of crash notification failed");
                                this.log(statement);
                            }
                            break;
                        case "set_port":
                            const { port, value, immediateRestart } = args;
                            this.setPort(port, value, immediateRestart);
                            break;
                    }
                    const handlers = this.onMessage[message];
                    if (handlers) {
                        handlers.forEach(handler => handler({ message, args }));
                    }
                } else if (lifecycle) {
                    console.log(this.timestamp(), `${this.configuration.workerIdentifier} lifecycle phase (${lifecycle})`);
                }
            });
        }

    }

    /**
     * Effectively, each worker repairs the connection to the server by reintroducing a consistent state
     * if its predecessor has died. It itself also polls the server heartbeat, and exits with a notification
     * email if the server encounters an uncaught exception or if the server cannot be reached.
     */
    export class ServerWorker {

        private static count = 0;
        private shouldServerBeResponsive = false;
        private exitHandlers: ExitHandler[] = [];
        private pollingFailureCount = 0;
        private pollingIntervalSeconds: number;
        private pollingFailureTolerance: number;
        private pollTarget: string;
        private serverPort: number;

        public static Create(work: Function) {
            if (isMaster) {
                throw new Error("Worker must be launched on a worker process.");
            } else if (++ServerWorker.count > 1 || isMaster) {
                process.send?.({ action: { message: "kill", args: { graceful: false } } });
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
        public killSession = (graceful = true) => this.sendMonitorAction("kill", { graceful });

        /**
         * A convenience wrapper to tell the session monitor (parent process)
         * to carry out the action with the specified message and arguments.
         */
        public sendMonitorAction = (message: string, args?: any) => process.send!({ action: { message, args } });

        private constructor(work: Function) {
            this.lifecycleNotification(green(`initializing process... (${white(`${process.execPath} ${process.execArgv.join(" ")}`)})`));

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
            process.on("message", async ({ newPollingIntervalSeconds, manualExit }) => {
                if (newPollingIntervalSeconds !== undefined) {
                    this.pollingIntervalSeconds = newPollingIntervalSeconds;
                }
                if (manualExit !== undefined) {
                    await this.executeExitHandlers(null);
                    process.exit(0);
                }
            });

            // one reason to exit, as the process might be in an inconsistent state after such an exception
            process.on('uncaughtException', this.proactiveUnplannedExit);
        }

        /**
         * Execute the list of functions registered to be called
         * whenever the process exits.
         */
        private executeExitHandlers = async (reason: Error | null) => Promise.all(this.exitHandlers.map(handler => handler(reason)));

        /**
         * Notify master thread (which will log update in the console) of initialization via IPC.
         */
        private lifecycleNotification = (event: string) => process.send?.({ lifecycle: event });

        /**
         * Called whenever the process has a reason to terminate, either through an uncaught exception
         * in the process (potentially inconsistent state) or the server cannot be reached.
         */
        private proactiveUnplannedExit = async (error: Error): Promise<void> => {
            this.shouldServerBeResponsive = false;
            // communicates via IPC to the master thread that it should dispatch a crash notification email
            this.sendMonitorAction("notify_crash", { error });
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
                        }
                        this.shouldServerBeResponsive = true;
                        resolve();
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
                    }
                }, 1000 * this.pollingIntervalSeconds);
            });
            // controlled, asynchronous infinite recursion achieves a persistent poll that does not submit a new request until the previous has completed
            this.pollServer();
        }

    }

}