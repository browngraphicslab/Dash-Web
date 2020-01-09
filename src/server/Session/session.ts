import { red, cyan, green, yellow, magenta, blue, white, Color, grey, gray, black } from "colors";
import { on, fork, setupMaster, Worker, isMaster, isWorker } from "cluster";
import { get } from "request-promise";
import { Utils } from "../../Utils";
import Repl, { ReplAction } from "../repl";
import { readFileSync } from "fs";
import { validate, ValidationError } from "jsonschema";
import { configurationSchema } from "./session_config_schema";
import { exec, ExecOptions } from "child_process";

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

    type ColorLabel = "yellow" | "red" | "cyan" | "green" | "blue" | "magenta" | "grey" | "gray" | "white" | "black";
    const colorMapping: Map<ColorLabel, Color> = new Map([
        ["yellow", yellow],
        ["red", red],
        ["cyan", cyan],
        ["green", green],
        ["blue", blue],
        ["magenta", magenta],
        ["grey", grey],
        ["gray", gray],
        ["white", white],
        ["black", black]
    ]);

    export abstract class AppliedSessionAgent {

        // the following two methods allow the developer to create a custom
        // session and use the built in customization options for each thread
        protected abstract async launchMonitor(): Promise<Session.Monitor>;
        protected abstract async launchServerWorker(): Promise<Session.ServerWorker>;

        private launched = false;

        public killSession = (reason: string, graceful = true, errorCode = 0) => {
            const target = isMaster ? this.sessionMonitor : this.serverWorker;
            target.killSession(reason, graceful, errorCode);
        }

        private sessionMonitorRef: Session.Monitor | undefined;
        public get sessionMonitor(): Session.Monitor {
            if (!isMaster) {
                this.serverWorker.sendMonitorAction("kill", {
                    graceful: false,
                    reason: "Cannot access the session monitor directly from the server worker thread.",
                    errorCode: 1
                });
                throw new Error();
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

    interface Identifier {
        text: string;
        color: ColorLabel;
    }

    interface Identifiers {
        master: Identifier;
        worker: Identifier;
        exec: Identifier;
    }

    interface Configuration {
        showServerOutput: boolean;
        identifiers: Identifiers;
        ports: { [description: string]: number };
        polling: {
            route: string;
            intervalSeconds: number;
            failureTolerance: number;
        };
    }

    const defaultConfig: Configuration = {
        showServerOutput: false,
        identifiers: {
            master: {
                text: "__monitor__",
                color: "yellow"
            },
            worker: {
                text: "__server__",
                color: "magenta"
            },
            exec: {
                text: "__exec__",
                color: "green"
            }
        },
        ports: { server: 3000 },
        polling: {
            route: "/",
            intervalSeconds: 30,
            failureTolerance: 0
        }
    };

    export type ExitHandler = (reason: Error | boolean) => void | Promise<void>;

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
        private readonly config: Configuration;
        private onMessage: { [message: string]: Monitor.ServerMessageHandler[] | undefined } = {};
        private activeWorker: Worker | undefined;
        private key: string | undefined;
        private repl: Repl;

        public static Create(notifiers?: Monitor.NotifierHooks) {
            if (isWorker) {
                process.send?.({
                    action: {
                        message: "kill",
                        args: {
                            reason: "cannot create a monitor on the worker process.",
                            graceful: false,
                            errorCode: 1
                        }
                    }
                });
                process.exit(1);
            } else if (++Monitor.count > 1) {
                console.error(red("cannot create more than one monitor."));
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
        public killSession = async (reason: string, graceful = true, errorCode = 0) => {
            this.mainLog(cyan(`exiting session ${graceful ? "clean" : "immediate"}ly`));
            this.mainLog(`reason: ${(red(reason))}`);
            await this.executeExitHandlers(true);
            this.killActiveWorker(graceful, true);
            process.exit(errorCode);
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

        public exec = (command: string, options?: ExecOptions) => {
            return new Promise<void>(resolve => {
                exec(command, { ...options, encoding: "utf8" }, (error, stdout, stderr) => {
                    if (error) {
                        this.execLog(red(`unable to execute ${white(command)}`));
                        error.message.split("\n").forEach(line => line.length && this.execLog(red(`(error) ${line}`)));
                    } else {
                        let outLines: string[], errorLines: string[];
                        if ((outLines = stdout.split("\n").filter(line => line.length)).length) {
                            outLines.forEach(line => line.length && this.execLog(cyan(`(stdout) ${line}`)));
                        }
                        if ((errorLines = stderr.split("\n").filter(line => line.length)).length) {
                            errorLines.forEach(line => line.length && this.execLog(yellow(`(stderr) ${line}`)));
                        }
                    }
                    resolve();
                });
            });
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

            this.config = this.loadAndValidateConfiguration();

            this.initializeSessionKey();
            // determines whether or not we see the compilation / initialization / runtime output of each child server process
            const output = this.config.showServerOutput ? "inherit" : "ignore";
            setupMaster({ stdio: ["ignore", output, output, "ipc"] });

            // handle exceptions in the master thread - there shouldn't be many of these
            // the IPC (inter process communication) channel closed exception can't seem
            // to be caught in a try catch, and is inconsequential, so it is ignored
            process.on("uncaughtException", ({ message, stack }): void => {
                if (message !== "Channel closed") {
                    this.mainLog(red(message));
                    if (stack) {
                        this.mainLog(`uncaught exception\n${red(stack)}`);
                    }
                }
            });

            // a helpful cluster event called on the master thread each time a child process exits
            on("exit", ({ process: { pid } }, code, signal) => {
                const prompt = `server worker with process id ${pid} has exited with code ${code}${signal === null ? "" : `, having encountered signal ${signal}`}.`;
                this.mainLog(cyan(prompt));
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
        public mainLog = (...optionalParams: any[]) => {
            console.log(this.timestamp(), this.config.identifiers.master.text, ...optionalParams);
        }

        /**
         * A formatted, identified and timestamped log in color for non-
         */
        private execLog = (...optionalParams: any[]) => {
            console.log(this.timestamp(), this.config.identifiers.exec.text, ...optionalParams);
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
                this.mainLog(statement);
            }
        }

        /**
         * At any arbitrary layer of nesting within the configuration objects, any single value that
         * is not specified by the configuration is given the default counterpart. If, within an object,
         * one peer is given by configuration and two are not, the one is preserved while the two are given
         * the default value.
         * @returns the composition of all of the assigned objects, much like Object.assign(), but with more
         * granularity in the overwriting of nested objects
         */
        private preciseAssign = (target: any, ...sources: any[]): any => {
            for (const source of sources) {
                this.preciseAssignHelper(target, source);
            }
            return target;
        }

        private preciseAssignHelper = (target: any, source: any) => {
            Array.from(new Set([...Object.keys(target), ...Object.keys(source)])).map(property => {
                let targetValue: any, sourceValue: any;
                if (sourceValue = source[property]) {
                    if (typeof sourceValue === "object" && typeof (targetValue = target[property]) === "object") {
                        this.preciseAssignHelper(targetValue, sourceValue);
                    } else {
                        target[property] = sourceValue;
                    }
                }
            });
        }

        /**
         * Reads in configuration .json file only once, in the master thread
         * and pass down any variables the pertinent to the child processes as environment variables.
         */
        private loadAndValidateConfiguration = (): Configuration => {
            let config: Configuration;
            try {
                console.log(this.timestamp(), cyan("validating configuration..."));
                config = JSON.parse(readFileSync('./session.config.json', 'utf8'));
                const options = {
                    throwError: true,
                    allowUnknownAttributes: false
                };
                // ensure all necessary and no excess information is specified by the configuration file
                validate(config, configurationSchema, options);
                config = this.preciseAssign({}, defaultConfig, config);
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.log(red("\nSession configuration failed."));
                    console.log("The given session.config.json configuration file is invalid.");
                    console.log(`${error.instance}: ${error.stack}`);
                    process.exit(0);
                } else if (error.code === "ENOENT" && error.path === "./session.config.json") {
                    console.log(cyan("Loading default session parameters..."));
                    console.log("Consider including a session.config.json configuration file in your project root for customization.");
                    config = this.preciseAssign({}, defaultConfig);
                } else {
                    console.log(red("\nSession configuration failed."));
                    console.log("The following unknown error occurred during configuration.");
                    console.log(error.stack);
                    process.exit(0);
                }
            } finally {
                const { identifiers } = config!;
                Object.keys(identifiers).forEach(key => {
                    const resolved = key as keyof Identifiers;
                    const { text, color } = identifiers[resolved];
                    identifiers[resolved].text = (colorMapping.get(color) || white)(`${text}:`);
                });
                return config!;
            }
        }

        /**
         * Builds the repl that allows the following commands to be typed into stdin of the master thread.
         */
        private initializeRepl = (): Repl => {
            const repl = new Repl({ identifier: () => `${this.timestamp()} ${this.config.identifiers.master.text}` });
            const boolean = /true|false/;
            const number = /\d+/;
            const letters = /[a-zA-Z]+/;
            repl.registerCommand("exit", [/clean|force/], args => this.killSession("manual exit requested by repl", args[0] === "clean", 0));
            repl.registerCommand("restart", [/clean|force/], args => this.killActiveWorker(args[0] === "clean"));
            repl.registerCommand("set", [letters, "port", number, boolean], args => this.setPort(args[0], Number(args[2]), args[3] === "true"));
            repl.registerCommand("set", [/polling/, number, boolean], args => {
                const newPollingIntervalSeconds = Math.floor(Number(args[2]));
                if (newPollingIntervalSeconds < 0) {
                    this.mainLog(red("the polling interval must be a non-negative integer"));
                } else {
                    if (newPollingIntervalSeconds !== this.config.polling.intervalSeconds) {
                        this.config.polling.intervalSeconds = newPollingIntervalSeconds;
                        if (args[3] === "true") {
                            this.activeWorker?.send({ newPollingIntervalSeconds });
                        }
                    }
                }
            });
            return repl;
        }

        private executeExitHandlers = async (reason: Error | boolean) => Promise.all(this.exitHandlers.map(handler => handler(reason)));

        /**
         * Attempts to kill the active worker gracefully, unless otherwise specified.
         */
        private killActiveWorker = (graceful = true, isSessionEnd = false): void => {
            if (this.activeWorker && !this.activeWorker.isDead()) {
                if (graceful) {
                    this.activeWorker.send({ manualExit: { isSessionEnd } });
                } else {
                    this.activeWorker.process.kill();
                }
            }
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
                this.config.ports[port] = value;
                if (immediateRestart) {
                    this.killActiveWorker();
                }
            } else {
                this.mainLog(red(`${port} is an invalid port number`));
            }
        }

        /**
         * Kills the current active worker and proceeds to spawn a new worker,
         * feeding in configuration information as environment variables.
         */
        private spawn = (): void => {
            const {
                polling: {
                    route,
                    failureTolerance,
                    intervalSeconds
                },
                ports
            } = this.config;
            this.killActiveWorker();
            this.activeWorker = fork({
                pollingRoute: route,
                pollingFailureTolerance: failureTolerance,
                serverPort: ports.server,
                socketPort: ports.socket,
                pollingIntervalSeconds: intervalSeconds,
                session_key: this.key
            });
            this.mainLog(cyan(`spawned new server worker with process id ${this.activeWorker.process.pid}`));
            // an IPC message handler that executes actions on the master thread when prompted by the active worker
            this.activeWorker.on("message", async ({ lifecycle, action }) => {
                if (action) {
                    const { message, args } = action as Monitor.Action;
                    console.log(this.timestamp(), `${this.config.identifiers.worker.text} action requested (${cyan(message)})`);
                    switch (message) {
                        case "kill":
                            const { reason, graceful, errorCode } = args;
                            this.killSession(reason, graceful, errorCode);
                            break;
                        case "notify_crash":
                            if (this.notifiers?.crash) {
                                const { error } = args;
                                const success = await this.notifiers.crash(error);
                                const statement = success ? green("distributed crash notification to recipients") : red("distribution of crash notification failed");
                                this.mainLog(statement);
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
                }
                if (lifecycle) {
                    console.log(this.timestamp(), `${this.config.identifiers.worker.text} lifecycle phase (${lifecycle})`);
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
                console.error(red("cannot create a worker on the monitor process."));
                process.exit(1);
            } else if (++ServerWorker.count > 1) {
                process.send?.({
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
        public sendMonitorAction = (message: string, args?: any) => process.send!({ action: { message, args } });

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
            process.on("message", async ({ newPollingIntervalSeconds, manualExit }) => {
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
        public lifecycleNotification = (event: string) => process.send?.({ lifecycle: event });

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

}