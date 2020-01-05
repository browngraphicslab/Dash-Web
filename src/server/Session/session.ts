import { red, cyan, green, yellow, magenta } from "colors";
import { on, fork, setupMaster, Worker } from "cluster";
import { execSync } from "child_process";
import { get } from "request-promise";
import { Utils } from "../../Utils";
import { Email } from "../ActionUtilities";
import Repl, { ReplAction } from "../repl";
import { readFileSync } from "fs";
import { validate, ValidationError } from "jsonschema";
import { configurationSchema } from "./session_config_schema";

const onWindows = process.platform === "win32";

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

    interface MasterCustomizer {
        addReplCommand: (basename: string, argPatterns: (RegExp | string)[], action: ReplAction) => void;
        addChildMessageHandler: (message: string, handler: ActionHandler) => void;
    }

    export interface SessionAction {
        message: string;
        args: any;
    }

    export type ExitHandler = (error: Error) => void | Promise<void>;
    export type ActionHandler = (action: SessionAction) => void | Promise<void>;
    export interface EmailTemplate {
        subject: string;
        body: string;
    }
    export type CrashEmailGenerator = (error: Error) => EmailTemplate | Promise<EmailTemplate>;

    /**
     * Validates and reads the configuration file, accordingly builds a child process factory
     * and spawns off an initial process that will respawn as predecessors die.
     */
    export async function initializeMonitorThread(crashEmailGenerator?: CrashEmailGenerator): Promise<MasterCustomizer> {
        let activeWorker: Worker;
        const childMessageHandlers: { [message: string]: (action: SessionAction, args: any) => void } = {};

        // read in configuration .json file only once, in the master thread
        // pass down any variables the pertinent to the child processes as environment variables
        const configuration = function loadConfiguration(): any {
            try {
                const configuration = JSON.parse(readFileSync('./session.config.json', 'utf8'));
                const options = {
                    throwError: true,
                    allowUnknownAttributes: false
                };
                // ensure all necessary and no excess information is specified by the configuration file
                validate(configuration, configurationSchema, options);
                configuration.masterIdentifier = yellow(configuration.masterIdentifier + ":");
                configuration.workerIdentifier = magenta(configuration.workerIdentifier + ":");
                return configuration;
            } catch (error) {
                console.log(red("\nSession configuration failed."));
                if (error instanceof ValidationError) {
                    console.log("The given session.config.json configuration file is invalid.");
                    console.log(`${error.instance}: ${error.stack}`);
                } else if (error.code === "ENOENT" && error.path === "./session.config.json") {
                    console.log("Please include a session.config.json configuration file in your project root.");
                } else {
                    console.log("The following unknown error occurred during configuration.");
                    console.log(error.stack);
                }
                console.log();
                process.exit(0);
            }
        }();

        const {
            masterIdentifier,
            workerIdentifier,
            recipients,
            ports,
            signature,
            heartbeatRoute,
            showServerOutput,
            pollingIntervalSeconds
        } = configuration;

        // this sends a pseudorandomly generated guid to the configuration's recipients, allowing them alone
        // to kill the server via the /kill/:key route
        const key = Utils.GenerateGuid();
        const timestamp = new Date().toUTCString();
        const content = `The key for this session (started @ ${timestamp}) is ${key}.\n\n${signature}`;
        const results = await Email.dispatchAll(recipients, "Server Termination Key", content);
        if (results.some(success => !success)) {
            console.log(masterIdentifier, red("distribution of session key failed"));
        } else {
            console.log(masterIdentifier, green("distributed session key to recipients"));
        }

        // handle exceptions in the master thread - there shouldn't be many of these
        // the IPC (inter process communication) channel closed exception can't seem
        // to be caught in a try catch, and is inconsequential, so it is ignored
        process.on("uncaughtException", ({ message, stack }) => {
            if (message !== "Channel closed") {
                console.log(masterIdentifier, red(message));
                if (stack) {
                    console.log(masterIdentifier, `uncaught exception\n${red(stack)}`);
                }
            }
        });

        // determines whether or not we see the compilation / initialization / runtime output of each child server process
        setupMaster({ silent: !showServerOutput });

        // attempts to kills the active worker ungracefully
        const tryKillActiveWorker = (strict = true): boolean => {
            if (activeWorker && !activeWorker.isDead()) {
                if (strict) {
                    activeWorker.process.kill();
                } else {
                    activeWorker.kill();
                }
                return true;
            }
            return false;
        };

        const restart = () => {
            // indicate to the worker that we are 'expecting' this restart
            activeWorker.send({ setListening: false });
            tryKillActiveWorker();
        };

        const setPort = (port: string, value: number, immediateRestart: boolean) => {
            ports[port] = value;
            if (immediateRestart) {
                restart();
            }
        };

        // kills the current active worker and proceeds to spawn a new worker,
        // feeding in configuration information as environment variables
        const spawn = (): void => {
            tryKillActiveWorker();
            activeWorker = fork({
                heartbeatRoute,
                serverPort: ports.server,
                socketPort: ports.socket,
                pollingIntervalSeconds,
                session_key: key
            });
            console.log(masterIdentifier, `spawned new server worker with process id ${activeWorker.process.pid}`);
            // an IPC message handler that executes actions on the master thread when prompted by the active worker
            activeWorker.on("message", async ({ lifecycle, action }) => {
                if (action) {
                    const { message, args } = action as SessionAction;
                    console.log(`${workerIdentifier} action requested (${cyan(message)})`);
                    switch (message) {
                        case "kill":
                            console.log(masterIdentifier, red("An authorized user has manually ended the server session"));
                            tryKillActiveWorker(false);
                            process.exit(0);
                        case "notify_crash":
                            if (crashEmailGenerator) {
                                const { error } = args;
                                const { subject, body } = await crashEmailGenerator(error);
                                const content = `${body}\n\n${signature}`;
                                Email.dispatchAll(recipients, subject, content);
                            }
                        case "set_port":
                            const { port, value, immediateRestart } = args;
                            setPort(port, value, immediateRestart);
                        default:
                            const handler = childMessageHandlers[message];
                            if (handler) {
                                handler(action, args);
                            }
                    }
                } else if (lifecycle) {
                    console.log(`${workerIdentifier} lifecycle phase (${lifecycle})`);
                }
            });
        };

        // a helpful cluster event called on the master thread each time a child process exits
        on("exit", ({ process: { pid } }, code, signal) => {
            const prompt = `server worker with process id ${pid} has exited with code ${code}${signal === null ? "" : `, having encountered signal ${signal}`}.`;
            console.log(masterIdentifier, cyan(prompt));
            // to make this a robust, continuous session, every time a child process dies, we immediately spawn a new one
            spawn();
        });

        // builds the repl that allows the following commands to be typed into stdin of the master thread
        const repl = new Repl({ identifier: masterIdentifier });
        repl.registerCommand("exit", [], () => execSync(onWindows ? "taskkill /f /im node.exe" : "killall -9 node"));
        repl.registerCommand("restart", [], restart);
        repl.registerCommand("set", [/[a-zA-Z]+/g, "port", /\d+/g, /true|false/g], args => {
            setPort(args[0], Number(args[2]), args[3] === "true");
        });
        // finally, set things in motion by spawning off the first child (server) process
        spawn();

        // returned to allow the caller to add custom commands
        return {
            addReplCommand: repl.registerCommand,
            addChildMessageHandler: (message: string, handler: ActionHandler) => { childMessageHandlers[message] = handler; }
        };
    }

    /**
     * Effectively, each worker repairs the connection to the server by reintroducing a consistent state
     * if its predecessor has died. It itself also polls the server heartbeat, and exits with a notification
     * email if the server encounters an uncaught exception or if the server cannot be reached.
     * @param work the function specifying the work to be done by each worker thread
     */
    export async function initializeWorkerThread(work: Function): Promise<(handler: ExitHandler) => void> {
        let listening = false;
        const exitHandlers: ExitHandler[] = [];

        // notify master thread (which will log update in the console) of initialization via IPC
        process.send?.({ lifecycle: green("initializing...") });

        // updates the local value of listening to the value sent from master
        process.on("message", ({ setListening }) => listening = setListening);

        // called whenever the process has a reason to terminate, either through an uncaught exception
        // in the process (potentially inconsistent state) or the server cannot be reached
        const activeExit = async (error: Error): Promise<void> => {
            if (!listening) {
                return;
            }
            listening = false;
            // communicates via IPC to the master thread that it should dispatch a crash notification email
            process.send?.({
                action: {
                    message: "notify_crash",
                    args: { error }
                }
            });
            await Promise.all(exitHandlers.map(handler => handler(error)));
            // notify master thread (which will log update in the console) of crash event via IPC
            process.send?.({ lifecycle: red(`Crash event detected @ ${new Date().toUTCString()}`) });
            process.send?.({ lifecycle: red(error.message) });
            process.exit(1);
        };

        // one reason to exit, as the process might be in an inconsistent state after such an exception
        process.on('uncaughtException', activeExit);

        const {
            pollingIntervalSeconds,
            heartbeatRoute,
            serverPort
        } = process.env;
        // this monitors the health of the server by submitting a get request to whatever port / route specified
        // by the configuration every n seconds, where n is also given by the configuration. 
        const heartbeat = `http://localhost:${serverPort}${heartbeatRoute}`;
        const checkHeartbeat = async (): Promise<void> => {
            await new Promise<void>(resolve => {
                setTimeout(async () => {
                    try {
                        await get(heartbeat);
                        if (!listening) {
                            // notify master thread (which will log update in the console) via IPC that the server is up and running
                            process.send?.({ lifecycle: green(`listening on ${serverPort}...`) });
                        }
                        listening = true;
                        resolve();
                    } catch (error) {
                        // if we expect the server to be unavailable, i.e. during compilation,
                        // the listening variable is false, activeExit will return early and the child
                        // process will continue
                        activeExit(error);
                    }
                }, 1000 * Number(pollingIntervalSeconds));
            });
            // controlled, asynchronous infinite recursion achieves a persistent poll that does not submit a new request until the previous has completed
            checkHeartbeat();
        };

        work();
        checkHeartbeat(); // begin polling

        return (handler: ExitHandler) => exitHandlers.push(handler);
    }

}