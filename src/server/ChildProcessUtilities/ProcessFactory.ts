import { existsSync, mkdirSync } from "fs";
import { pathFromRoot, log_execution, fileDescriptorFromStream } from '../ActionUtilities';
import { red, green } from "colors";
import rimraf = require("rimraf");
import { ChildProcess, spawn, StdioOptions } from "child_process";
import { Stream } from "stream";
import { resolve } from "path";

export namespace ProcessFactory {

    export type Sink = "pipe" | "ipc" | "ignore" | "inherit" | Stream | number | null | undefined;

    export async function createWorker(command: string, args?: readonly string[], stdio?: StdioOptions | "logfile", detached = true): Promise<ChildProcess> {
        if (stdio === "logfile") {
            const log_fd = await Logger.create(command, args);
            stdio = ["ignore", log_fd, log_fd];
        }
        const child = spawn(command, args, { detached, stdio });
        child.unref();
        return child;
    }

    export namespace NamedAgents {

        export async function persistenceDaemon() {
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
                action: () => createWorker('npx', ['ts-node', resolve(__dirname, "./daemon/persistence_daemon.ts")], ["ignore", "inherit", "inherit"]),
                color: green
            });
            console.log();
        }
    }

}

export namespace Logger {

    const logPath = pathFromRoot("./logs");

    export async function initialize() {
        if (existsSync(logPath)) {
            if (!process.env.SPAWNED) {
                await new Promise<any>(resolve => rimraf(logPath, resolve));
            }
        }
        mkdirSync(logPath);
    }

    export async function create(command: string, args?: readonly string[]): Promise<number> {
        return fileDescriptorFromStream(generate_log_path(command, args));
    }

    function generate_log_path(command: string, args?: readonly string[]) {
        return pathFromRoot(`./logs/${command}-${args?.length}-${new Date().toUTCString()}.log`);
    }

}