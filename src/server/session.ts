import { yellow, red, cyan, magenta, green } from "colors";
import { isMaster, on, fork, setupMaster, Worker } from "cluster";
import { identifier } from "./session_manager/config";
import InputManager from "./session_manager/input_manager";
import { execSync } from "child_process";
import { CrashEmail } from "./session_manager/crash_email";
import { get } from "request-promise";
import { WebSocket } from "./Websocket/Websocket";
import { Utils } from "../Utils";
import { MessageStore } from "./Message";

const onWindows = process.platform === "win32";
const heartbeat = `http://localhost:1050/serverHeartbeat`;
const admin = ["samuel_wilkins@brown.edu"];

export namespace Session {

    const masterIdentifier = yellow("__master__");
    const workerIdentifier = magenta("__worker__");

    export async function initialize(work: Function) {
        let listening = false;
        let active: Worker;
        if (isMaster) {
            process.on("uncaughtException", error => {
                if (error.message !== "Channel closed") {
                    console.log(`${masterIdentifier}: ${red(error.message)}`);
                    if (error.stack) {
                        console.log(`${masterIdentifier}:\n${red(error.stack)}`);
                    }
                }
            });
            setupMaster({ silent: true });
            const spawn = () => {
                if (active && !active.isDead()) {
                    active.process.kill();
                }
                active = fork();
                active.on("message", ({ update }) => {
                    if (update) {
                        console.log(`${workerIdentifier}: ${update}`);
                    }
                });
            };
            spawn();
            on("exit", ({ process: { pid } }, code, signal) => {
                const prompt = `Server worker with process id ${pid} has exited with code ${code}${signal === null ? "" : `, having encountered signal ${signal}`}.`;
                console.log(`${masterIdentifier}: ${cyan(prompt)}`);
                spawn();
            });
            const restart = () => {
                listening = false;
                const prompt = `Server worker with process id ${active.process.pid} has been manually killed.`;
                console.log(`${masterIdentifier}: ${cyan(prompt)}`);
                spawn();
            };
            const { registerCommand } = new InputManager({ identifier });
            registerCommand("exit", [], () => execSync(onWindows ? "taskkill /f /im node.exe" : "killall -9 node"));
            registerCommand("restart", [], restart);
        } else {
            const notifyMaster = (update: string) => process.send?.({ update });
            notifyMaster(green("initializing..."));
            const gracefulExit = async (error: Error) => {
                if (!listening) {
                    return;
                }
                listening = false;
                await CrashEmail.dispatch(error, admin);
                const { _socket } = WebSocket;
                if (_socket) {
                    Utils.Emit(_socket, MessageStore.ConnectionTerminated, "Manual");
                }
                notifyMaster(red(`Crash event detected @ ${new Date().toUTCString()}`));
                notifyMaster(red(error.message));
                process.exit(1);
            };
            process.on('uncaughtException', gracefulExit);
            const checkHeartbeat = async () => {
                await new Promise<void>(resolve => {
                    setTimeout(async () => {
                        try {
                            await get(heartbeat);
                            if (!listening) {
                                notifyMaster(green("server is now successfully listening..."));
                            }
                            listening = true;
                        } catch (error) {
                            await gracefulExit(error);
                        } finally {
                            resolve();
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