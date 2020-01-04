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

    export async function email(recipients: string[], subject: string, content: string) {
        return Promise.all(recipients.map((recipient: string) => Email.dispatch(recipient, subject, content)));
    }

    function tryKillActiveWorker() {
        if (activeWorker && !activeWorker.isDead()) {
            activeWorker.process.kill();
            return true;
        }
        return false;
    }

    async function activeExit(error: Error) {
        if (!listening) {
            return;
        }
        listening = false;
        process.send?.({
            action: {
                message: "notify_crash",
                args: { error }
            }
        });
        const { _socket } = WebSocket;
        if (_socket) {
            Utils.Emit(_socket, MessageStore.ConnectionTerminated, "Manual");
        }
        process.send?.({ lifecycle: red(`Crash event detected @ ${new Date().toUTCString()}`) });
        process.send?.({ lifecycle: red(error.message) });
        process.exit(1);
    }

    export async function initialize(work: Function) {
        if (isMaster) {
            const {
                masterIdentifier,
                workerIdentifier,
                recipients,
                signature,
                heartbeat,
                silentChildren
            } = loadConfiguration();
            await (async function distributeKey() {
                key = Utils.GenerateGuid();
                const timestamp = new Date().toUTCString();
                const content = `The key for this session (started @ ${timestamp}) is ${key}.\n\n${signature}`;
                return email(recipients, "Server Termination Key", content);
            })();
            console.log(masterIdentifier, "distributed session key to recipients");
            process.on("uncaughtException", ({ message, stack }) => {
                if (message !== "Channel closed") {
                    console.log(masterIdentifier, red(message));
                    if (stack) {
                        console.log(masterIdentifier, `\n${red(stack)}`);
                    }
                }
            });
            setupMaster({ silent: silentChildren });
            const spawn = () => {
                tryKillActiveWorker();
                activeWorker = fork({ heartbeat, session_key: key });
                console.log(masterIdentifier, `spawned new server worker with process id ${activeWorker.process.pid}`);
                activeWorker.on("message", ({ lifecycle, action }) => {
                    if (action) {
                        const { message, args } = action;
                        console.log(`${workerIdentifier} action requested (${cyan(message)})`);
                        switch (message) {
                            case "kill":
                                console.log(masterIdentifier, red("An authorized user has ended the server session from the /kill route"));
                                tryKillActiveWorker();
                                process.exit(0);
                            case "notify_crash":
                                const { error: { name, message, stack } } = args;
                                email(recipients, "Dash Web Server Crash", [
                                    "You, as a Dash Administrator, are being notified of a server crash event. Here's what we know:",
                                    `name:\n${name}`,
                                    `message:\n${message}`,
                                    `stack:\n${stack}`,
                                    "The server is already restarting itself, but if you're concerned, use the Remote Desktop Connection to monitor progress.",
                                    signature
                                ].join("\n\n"));
                        }
                    } else if (lifecycle) {
                        console.log(`${workerIdentifier} lifecycle phase (${lifecycle})`);
                    }
                });
            };
            spawn();
            on("exit", ({ process: { pid } }, code, signal) => {
                const prompt = `Server worker with process id ${pid} has exited with code ${code}${signal === null ? "" : `, having encountered signal ${signal}`}.`;
                console.log(masterIdentifier, cyan(prompt));
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
            process.send?.({ lifecycle: green("initializing...") });
            process.on('uncaughtException', activeExit);
            const checkHeartbeat = async () => {
                await new Promise<void>(resolve => {
                    setTimeout(async () => {
                        try {
                            await get(process.env.heartbeat!);
                            if (!listening) {
                                process.send?.({ lifecycle: green("listening...") });
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