import { yellow, red, cyan, magenta, green } from "colors";
import { isMaster, on, fork, setupMaster, Worker } from "cluster";
import InputManager from "./session_manager/input_manager";
import { execSync } from "child_process";
import { Email } from "./session_manager/email";
import { get } from "request-promise";
import { WebSocket } from "./Websocket/Websocket";
import { Utils } from "../Utils";
import { MessageStore } from "./Message";

const onWindows = process.platform === "win32";
const heartbeat = `http://localhost:1050/serverHeartbeat`;
const admin = ["samuel_wilkins@brown.edu"];

export namespace Session {

    export let key: string;
    export const signature = "Best,\nServer Session Manager";
    let activeWorker: Worker;
    let listening = false;
    const masterIdentifier = `${yellow("__master__")}:`;
    const workerIdentifier = `${magenta("__worker__")}:`;

    function log(message?: any, ...optionalParams: any[]) {
        const identifier = isMaster ? masterIdentifier : workerIdentifier;
        console.log(identifier, message, ...optionalParams);
    }

    export async function distributeKey() {
        key = Utils.GenerateGuid();
        const timestamp = new Date().toUTCString();
        const content = `The key for this session (started @ ${timestamp}) is ${key}.\n\n${signature}`;
        return Promise.all(admin.map(recipient => Email.dispatch(recipient, "Server Termination Key", content)));
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
        await Promise.all(admin.map(recipient => Email.dispatch(recipient, "Dash Web Server Crash", crashReport(error))));
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
            setupMaster({ silent: true });
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
            const { registerCommand } = new InputManager({ identifier: masterIdentifier });
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