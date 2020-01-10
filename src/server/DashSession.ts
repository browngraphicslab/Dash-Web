import { Session } from "./Session/session";
import { Email, pathFromRoot } from "./ActionUtilities";
import { red, yellow, green, cyan } from "colors";
import { get } from "request-promise";
import { Utils } from "../Utils";
import { WebSocket } from "./Websocket/Websocket";
import { MessageStore } from "./Message";
import { launchServer, onWindows } from ".";
import { existsSync, mkdirSync, readdirSync, statSync, createWriteStream, readFileSync } from "fs";
import * as Archiver from "archiver";
import { resolve } from "path";

/**
 * If we're the monitor (master) thread, we should launch the monitor logic for the session.
 * Otherwise, we must be on a worker thread that was spawned *by* the monitor (master) thread, and thus
 * our job should be to run the server.
 */
export class DashSessionAgent extends Session.AppliedSessionAgent {

    private readonly notificationRecipients = ["samuel_wilkins@brown.edu"];
    private readonly signature = "-Dash Server Session Manager";
    private readonly releaseDesktop = pathFromRoot("../../Desktop");

    protected async launchMonitor() {
        const monitor = Session.Monitor.Create(this.notifiers);
        monitor.addReplCommand("pull", [], () => monitor.exec("git pull"));
        monitor.addReplCommand("solr", [/start|stop|index/], this.executeSolrCommand);
        monitor.addReplCommand("backup", [], this.backup);
        monitor.addReplCommand("debug", [/active|passive/, /\S+\@\S+/], async ([mode, recipient]) => this.dispatchZippedDebugBackup(mode, recipient));
        monitor.addServerMessageListener("backup", this.backup);
        monitor.addServerMessageListener("debug", ({ args: { mode, recipient } }) => this.dispatchZippedDebugBackup(mode, recipient));
        return monitor;
    }

    protected async launchServerWorker() {
        const worker = Session.ServerWorker.Create(launchServer); // server initialization delegated to worker
        worker.addExitHandler(this.notifyClient);
        return worker;
    }

    private readonly notifiers: Session.Monitor.NotifierHooks = {
        key: async key => {
            // this sends a pseudorandomly generated guid to the configuration's recipients, allowing them alone
            // to kill the server via the /kill/:key route
            const content = `The key for this session (started @ ${new Date().toUTCString()}) is ${key}.\n\n${this.signature}`;
            const failures = await Email.dispatchAll(this.notificationRecipients, "Dash Release Session Admin Authentication Key", content);
            if (failures) {
                failures.map(({ recipient, error: { message } }) => this.sessionMonitor.mainLog(red(`dispatch failure @ ${recipient} (${yellow(message)})`)));
                return false;
            }
            return true;
        },
        crash: async ({ name, message, stack }) => {
            const body = [
                "You, as a Dash Administrator, are being notified of a server crash event. Here's what we know:",
                `name:\n${name}`,
                `message:\n${message}`,
                `stack:\n${stack}`,
                "The server is already restarting itself, but if you're concerned, use the Remote Desktop Connection to monitor progress.",
            ].join("\n\n");
            const content = `${body}\n\n${this.signature}`;
            const failures = await Email.dispatchAll(this.notificationRecipients, "Dash Web Server Crash", content);
            if (failures) {
                failures.map(({ recipient, error: { message } }) => this.sessionMonitor.mainLog(red(`dispatch failure @ ${recipient} (${yellow(message)})`)));
                return false;
            }
            return true;
        }
    };

    private executeSolrCommand = async (args: string[]) => {
        const { exec, mainLog } = this.sessionMonitor;
        const action = args[0];
        if (action === "index") {
            exec("npx ts-node ./updateSearch.ts", { cwd: pathFromRoot("./src/server") });
        } else {
            const command = `${onWindows ? "solr.cmd" : "solr"} ${args[0] === "start" ? "start" : "stop -p 8983"}`;
            await exec(command, { cwd: "./solr-8.3.1/bin" });
            try {
                await get("http://localhost:8983");
                mainLog(green("successfully connected to 8983 after running solr initialization"));
            } catch {
                mainLog(red("unable to connect at 8983 after running solr initialization"));
            }
        }
    }

    private notifyClient: Session.ExitHandler = reason => {
        const { _socket } = WebSocket;
        if (_socket) {
            const message = typeof reason === "boolean" ? (reason ? "exit" : "temporary") : "crash";
            Utils.Emit(_socket, MessageStore.ConnectionTerminated, message);
        }
    }

    private backup = async () => this.sessionMonitor.exec("backup.bat", { cwd: this.releaseDesktop });

    private async dispatchZippedDebugBackup(mode: string, recipient: string) {
        const { mainLog } = this.sessionMonitor;
        try {
            if (mode === "active") {
                await this.backup();
            }
            mainLog("backup complete");
            const backupsDirectory = `${this.releaseDesktop}/backups`;
            const compressedDirectory = `${this.releaseDesktop}/compressed`;
            if (!existsSync(compressedDirectory)) {
                mkdirSync(compressedDirectory);
            }
            const target = readdirSync(backupsDirectory).map(filename => ({
                modifiedTime: statSync(`${backupsDirectory}/${filename}`).mtimeMs,
                filename
            })).sort((a, b) => b.modifiedTime - a.modifiedTime)[0].filename;
            mainLog(`targeting ${target}...`);
            const zipName = `${target}.zip`;
            const zipPath = `${compressedDirectory}/${zipName}`;
            const output = createWriteStream(zipPath);
            const zip = Archiver('zip');
            zip.pipe(output);
            zip.directory(`${backupsDirectory}/${target}/Dash`, false);
            await zip.finalize();
            mainLog(`zip finalized with size ${statSync(zipPath).size} bytes, saved to ${zipPath}`);
            let instructions = readFileSync(resolve(__dirname, "./remote_debug_instructions.txt"), { encoding: "utf8" });
            instructions = instructions.replace(/__zipname__/, zipName).replace(/__target__/, target).replace(/__signature__/, this.signature);
            const error = await Email.dispatch(recipient, `Compressed backup of ${target}...`, instructions, [
                {
                    filename: zipName,
                    path: zipPath
                }
            ]);
            mainLog(`${error === null ? green("successfully dispatched") : red("failed to dispatch")} ${zipName} to ${cyan(recipient)}`);
            error && mainLog(red(error.message));
        } catch (error) {
            mainLog(red("unable to dispatch zipped backup..."));
            mainLog(red(error.message));
        }
    }

}