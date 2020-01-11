import { ExitHandler } from "./applied_session_agent";
import { Configuration, configurationSchema, defaultConfig, Identifiers, colorMapping } from "../utilities/session_config";
import Repl, { ReplAction } from "../utilities/repl";
import { isWorker, setupMaster, on, Worker, fork } from "cluster";
import { PromisifiedIPCManager, suffix, IPC, MessageHandler, Message } from "../utilities/ipc";
import { red, cyan, white, yellow, blue } from "colors";
import { exec, ExecOptions } from "child_process";
import { validate, ValidationError } from "jsonschema";
import { Utilities } from "../utilities/utilities";
import { readFileSync } from "fs";
import MessageRouter from "./message_router";

/**
 * Validates and reads the configuration file, accordingly builds a child process factory
 * and spawns off an initial process that will respawn as predecessors die.
 */
export class Monitor extends MessageRouter {
    private static IPCManager: PromisifiedIPCManager;
    private static count = 0;
    private finalized = false;
    private exitHandlers: ExitHandler[] = [];
    private readonly config: Configuration;
    private activeWorker: Worker | undefined;
    private key: string | undefined;
    private repl: Repl;

    public static Create(sessionKey: string) {
        if (isWorker) {
            IPC(process).emit("kill", {
                reason: "cannot create a monitor on the worker process.",
                graceful: false,
                errorCode: 1
            });
            process.exit(1);
        } else if (++Monitor.count > 1) {
            console.error(red("cannot create more than one monitor."));
            process.exit(1);
        } else {
            return new Monitor(sessionKey);
        }
    }

    public onCrashDetected = (listener: MessageHandler) => this.addMessageListener(Monitor.IntrinsicEvents.CrashDetected, listener);
    public onServerRunning = (listener: MessageHandler) => this.addMessageListener(Monitor.IntrinsicEvents.ServerRunning, listener);

    /**
     * Kill this session and its active child
     * server process, either gracefully (may wait
     * indefinitely, but at least allows active networking
     * requests to complete) or immediately.
     */
    public killSession = async (reason: string, graceful = true, errorCode = 0) => {
        this.mainLog(cyan(`exiting session ${graceful ? "clean" : "immediate"}ly`));
        this.mainLog(`session exit reason: ${(red(reason))}`);
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

    private constructor(sessionKey: string) {
        super();
        console.log(this.timestamp(), cyan("initializing session..."));
        this.key = sessionKey;
        this.config = this.loadAndValidateConfiguration();

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
        Monitor.IPCManager.setRouter(this.route);
    }

    public finalize = (): void => {
        if (this.finalized) {
            throw new Error("Session monitor is already finalized");
        }
        this.finalized = true;
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
            config = Utilities.preciseAssign({}, defaultConfig, config);
        } catch (error) {
            if (error instanceof ValidationError) {
                console.log(red("\nSession configuration failed."));
                console.log("The given session.config.json configuration file is invalid.");
                console.log(`${error.instance}: ${error.stack}`);
                process.exit(0);
            } else if (error.code === "ENOENT" && error.path === "./session.config.json") {
                console.log(cyan("Loading default session parameters..."));
                console.log("Consider including a session.config.json configuration file in your project root for customization.");
                config = Utilities.preciseAssign({}, defaultConfig);
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
        repl.registerCommand("set", [/polling/, number, boolean], async args => {
            const newPollingIntervalSeconds = Math.floor(Number(args[1]));
            if (newPollingIntervalSeconds < 0) {
                this.mainLog(red("the polling interval must be a non-negative integer"));
            } else {
                if (newPollingIntervalSeconds !== this.config.polling.intervalSeconds) {
                    this.config.polling.intervalSeconds = newPollingIntervalSeconds;
                    if (args[2] === "true") {
                        return Monitor.IPCManager.emit("updatePollingInterval", { newPollingIntervalSeconds }, true);
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
                Monitor.IPCManager.emit("manualExit", { isSessionEnd });
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
            session_key: this.key,
            ipc_suffix: suffix
        });
        Monitor.IPCManager = IPC(this.activeWorker);
        this.mainLog(cyan(`spawned new server worker with process id ${this.activeWorker?.process.pid}`));

        this.addMessageListener("kill", ({ args: { reason, graceful, errorCode } }) => this.killSession(reason, graceful, errorCode), true);
        this.addMessageListener("lifecycle", ({ args: { event } }) => console.log(this.timestamp(), `${this.config.identifiers.worker.text} lifecycle phase (${event})`), true);
    }

}

export namespace Monitor {

    export enum IntrinsicEvents {
        KeyGenerated = "key_generated",
        CrashDetected = "crash_detected",
        ServerRunning = "server_running"
    }

}