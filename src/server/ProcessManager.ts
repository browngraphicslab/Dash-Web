import { existsSync, mkdirSync, createWriteStream } from "fs";
import { pathFromRoot, log_execution } from './ActionUtilities';
import { red, green } from "colors";
import rimraf = require("rimraf");
import { ChildProcess, spawn } from "child_process";
import { Stream } from "stream";

const daemonPath = pathFromRoot("./src/server/daemon/persistence_daemon.ts");

export namespace ProcessManager {

    export async function initialize() {
        const logPath = pathFromRoot("./logs");
        if (existsSync(logPath)) {
            if (!process.env.SPAWNED) {
                await new Promise<any>(resolve => rimraf(logPath, resolve));
            }
        }
        mkdirSync(logPath);
    }

    function generate_log_name(command: string, args?: readonly string[]) {
        return pathFromRoot(`./logs/${command}-${args?.length}-${new Date().toUTCString()}.log`);
    }

    export type Sink = "pipe" | "ipc" | "ignore" | "inherit" | Stream | number | null | undefined;

    export async function spawn_detached(command: string, args?: readonly string[], out?: Sink): Promise<ChildProcess> {
        if (!out) {
            const logStream = createWriteStream(generate_log_name(command, args));
            out = await new Promise<number>(resolve => logStream.on("open", resolve));
        }
        const child = spawn(command, args, { detached: true, stdio: ["ignore", out, out] });
        child.unref();
        return child;
    }

    let daemonInitialized = false;
    export async function trySpawnDaemon() {
        if (!process.env.SPAWNED && !daemonInitialized) {
            daemonInitialized = true;
            await log_execution({
                startMessage: "\ninitializing persistence daemon",
                endMessage: ({ result, error }) => {
                    const success = error === null && result !== undefined;
                    if (!success) {
                        console.log(red("failed to initialize the persistance daemon"));
                        console.log(error);
                        process.exit(0);
                    }
                    return "failsafe daemon process successfully spawned";
                },
                action: () => spawn_detached('npx', ['ts-node', daemonPath], process.stdout),
                color: green
            });
            console.log();
        }
    }

}