import { red, cyan, green, yellow, magenta } from "colors";
import { isMaster, on, fork, setupMaster, Worker } from "cluster";
import { execSync } from "child_process";
import { get } from "request-promise";
import { WebSocket } from "../Websocket/Websocket";
import { Utils } from "../../Utils";
import { MessageStore } from "../Message";
import { Email } from "../ActionUtilities";
import Repl from "../repl";
import { readFileSync } from "fs";
import { validate, ValidationError } from "jsonschema";
import { configurationSchema } from "./session_config_schema";

const onWindows = process.platform === "win32";

export namespace Session {

    const { masterIdentifier, workerIdentifier, recipients, signature, heartbeat, silentChildren } = loadConfiguration();
    export let key: string;
    let activeWorker: Worker;
    let listening = false;

    function loadConfiguration() {
        try {
            const raw = readFileSync('./session.config.json', 'utf8');
            const configuration = JSON.parse(raw);
            const options = {
                throwError: true,
                allowUnknownAttributes: false
            };
            validate(configuration, configurationSchema, options);
            configuration.masterIdentifier = `${yellow(configuration.masterIdentifier)}:`;
            configuration.workerIdentifier = `${magenta(configuration.workerIdentifier)}:`;
            return configuration;
        } catch (error) {
            console.log(red("\nSession configuration failed."));
            if (error instanceof ValidationError) {
                console.log("The given session.config.json configuration file is invalid.");
                console.log(`${error.instance}: ${error.stack}`);
            } else if (error.code === "ENOENT" && error.path === "./session.config.json") {
                console.log("Please include a session.config.json configuration file in your project root.");
            } else {
                console.log(error.stack);
            }
            console.log();
            process.exit(0);
        }
    }

    function log(message?: any, ...optionalParams: any[]) {
        const identifier = isMaster ? masterIdentifier : workerIdentifier;
        console.log(identifier, message, ...optionalParams);
    }

    export async function distributeKey() {
        key = Utils.GenerateGuid();
        const timestamp = new Date().toUTCString();
        const content = `The key for this session (started @ ${timestamp}) is ${key}.\n\n${signature}`;
        return Promise.all(recipients.map((recipient: string) => Email.dispatch(recipient, "Server Termination Key", content)));
    }

    function tryKillActiveWorker() {
        if (activeWorker && !activeWorker.isDead()) {
            activeWorker.process.kill();
            return true;
        }
        return false;
    }

    function logLifecycleEvent(lifecycle: string) {
        process.send?.({ lifecycle });
    }

    function messageHandler({ lifecycle, action }: any) {
        if (action) {
            console.log(`${workerIdentifier} action requested (${action})`);
            switch (action) {
                case "kill":
                    log(red("An authorized user has ended the server from the /kill route"));
                    tryKillActiveWorker();
                    process.exit(0);
            }
        } else if (lifecycle) {
            console.log(`${workerIdentifier} lifecycle phase (${lifecycle})`);
        }
    }

    async function activeExit(error: Error) {
        if (!listening) {
            return;
        }
        listening = false;
        await Promise.all(recipients.map((recipient: string) => Email.dispatch(recipient, "Dash Web Server Crash", crashReport(error))));
        const { _socket } = WebSocket;
        if (_socket) {
            Utils.Emit(_socket, MessageStore.ConnectionTerminated, "Manual");
        }
        logLifecycleEvent(red(`Crash event detected @ ${new Date().toUTCString()}`));
        logLifecycleEvent(red(error.message));
        process.exit(1);
    }

    function crashReport({ name, message, stack }: Error) {
        return [
            "You, as a Dash Administrator, are being notified of a server crash event. Here's what we know:",
            `name:\n${name}`,
            `message:\n${message}`,
            `stack:\n${stack}`,
            "The server is already restarting itself, but if you're concerned, use the Remote Desktop Connection to monitor progress.",
            signature
        ].join("\n\n");
    }

    export async function initialize(work: Function) {
        if (isMaster) {
            process.on("uncaughtException", error => {
                if (error.message !== "Channel closed") {
                    log(red(error.message));
                    if (error.stack) {
                        log(`\n${red(error.stack)}`);
                    }
                }
            });
            setupMaster({ silent: silentChildren });
            const spawn = () => {
                tryKillActiveWorker();
                activeWorker = fork();
                activeWorker.on("message", messageHandler);
            };
            spawn();
            on("exit", ({ process: { pid } }, code, signal) => {
                const prompt = `Server worker with process id ${pid} has exited with code ${code}${signal === null ? "" : `, having encountered signal ${signal}`}.`;
                log(cyan(prompt));
                spawn();
            });
            const { registerCommand } = new Repl({ identifier: masterIdentifier });
            registerCommand("exit", [], () => execSync(onWindows ? "taskkill /f /im node.exe" : "killall -9 node"));
            registerCommand("pull", [], () => execSync("git pull", { stdio: ["ignore", "inherit", "inherit"] }));
            registerCommand("restart", [], () => {
                listening = false;
                tryKillActiveWorker();
            });
        } else {
            logLifecycleEvent(green("initializing..."));
            process.on('uncaughtException', activeExit);
            const checkHeartbeat = async () => {
                await new Promise<void>(resolve => {
                    setTimeout(async () => {
                        try {
                            await get(heartbeat);
                            if (!listening) {
                                logLifecycleEvent(green("listening..."));
                            }
                            listening = true;
                            resolve();
                        } catch (error) {
                            await activeExit(error);
                        }
                    }, 1000 * 15);
                });
                checkHeartbeat();
            };
            work();
            checkHeartbeat();
        }
    }

}