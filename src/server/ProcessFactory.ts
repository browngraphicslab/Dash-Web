import { existsSync, mkdirSync } from "fs";
import { pathFromRoot, fileDescriptorFromStream } from './ActionUtilities';
import rimraf = require("rimraf");
import { ChildProcess, spawn, StdioOptions } from "child_process";
import { Stream } from "stream";

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