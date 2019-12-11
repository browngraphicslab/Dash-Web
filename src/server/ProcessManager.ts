import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { pathFromRoot, log_execution, spawn_detached_process } from './ActionUtilities';
import { resolve } from "path";
import { red, yellow } from "colors";

const daemonPath = pathFromRoot("./src/server/daemon/persistence_daemon.ts");

export namespace ProcessManager {

    export async function initialize() {
        const logPath = pathFromRoot("./logs");
        const filePath = resolve(logPath, "./server_pids.txt");
        const exists = existsSync(logPath);
        if (exists) {
            unlinkSync(filePath);
        } else {
            mkdirSync(logPath);
        }
        const { pid } = process;
        if (process.env.SPAWNED === "true") {
            writeFileSync(filePath, `${pid} created at ${new Date().toUTCString()}\n`);
        }
    }

    let daemonInitialized = false;
    export async function trySpawnDaemon() {
        if (!daemonInitialized) {
            daemonInitialized = true;
            await log_execution({
                startMessage: "\ninitializing persistence daemon",
                endMessage: ({ result, error }) => {
                    const success = error === null && result !== undefined;
                    if (!success) {
                        console.log(red("failed to initialize the persistance daemon"));
                        process.exit(0);
                    }
                    return "persistence daemon process closed";
                },
                action: () => spawn_detached_process("npx ts-node", [daemonPath]),
                color: yellow
            });
        }
    }

}