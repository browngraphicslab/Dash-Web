import { Email, pathFromRoot } from "../ActionUtilities";
import { red, yellow, green, cyan } from "colors";
import { get } from "request-promise";
import { Utils } from "../../Utils";
import { WebSocket } from "../Websocket/Websocket";
import { MessageStore } from "../Message";
import { launchServer, onWindows } from "..";
import { readdirSync, statSync, createWriteStream, readFileSync, unlinkSync } from "fs";
import * as Archiver from "archiver";
import { resolve } from "path";
import { AppliedSessionAgent, MessageHandler, ExitHandler, Monitor, ServerWorker } from "resilient-server-session";
import rimraf = require("rimraf");

/**
 * If we're the monitor (master) thread, we should launch the monitor logic for the session.
 * Otherwise, we must be on a worker thread that was spawned *by* the monitor (master) thread, and thus
 * our job should be to run the server.
 */
export class DashSessionAgent extends AppliedSessionAgent {

    private readonly signature = "-Dash Server Session Manager";
    private readonly releaseDesktop = pathFromRoot("../../Desktop");

    /**
     * The core method invoked when the single master thread is initialized.
     * Installs event hooks, repl commands and additional IPC listeners.
     */
    // protected async initializeMonitor(monitor: Monitor, sessionKey: string): Promise<void> {
    protected async initializeMonitor(monitor: Monitor): Promise<void> {

        // await this.dispatchSessionPassword(sessionKey);
        // monitor.addReplCommand("pull", [], () => monitor.exec("git pull"));
        // monitor.addReplCommand("solr", [/start|stop|index/], this.executeSolrCommand);
        // monitor.addReplCommand("backup", [], this.backup);
        // monitor.addReplCommand("debug", [/\S+\@\S+/], async ([to]) => this.dispatchZippedDebugBackup(to));
        // monitor.on("backup", this.backup);
        // monitor.on("debug", async ({ to }) => this.dispatchZippedDebugBackup(to));
        // monitor.coreHooks.onCrashDetected(this.dispatchCrashReport);
        return;
    }

    /**
     * The core method invoked when a server worker thread is initialized.
     * Installs logic to be executed when the server worker dies.
     */
    protected async initializeServerWorker(): Promise<ServerWorker> {
        const worker = ServerWorker.Create(launchServer); // server initialization delegated to worker
        worker.addExitHandler(this.notifyClient);
        return worker;
    }

    /**
     * Prepares the body of the email with instructions on restoring the transmitted remote database backup locally.
     */
    private _remoteDebugInstructions: string | undefined;
    private generateDebugInstructions = (zipName: string, target: string): string => {
        if (!this._remoteDebugInstructions) {
            this._remoteDebugInstructions = readFileSync(resolve(__dirname, "./templates/remote_debug_instructions.txt"), { encoding: "utf8" });
        }
        return this._remoteDebugInstructions
            .replace(/__zipname__/, zipName)
            .replace(/__target__/, target)
            .replace(/__signature__/, this.signature);
    }

    /**
     * Prepares the body of the email with information regarding a crash event.
     */
    private _crashInstructions: string | undefined;
    private generateCrashInstructions({ name, message, stack }: Error): string {
        if (!this._crashInstructions) {
            this._crashInstructions = readFileSync(resolve(__dirname, "./templates/crash_instructions.txt"), { encoding: "utf8" });
        }
        return this._crashInstructions
            .replace(/__name__/, name || "[no error name found]")
            .replace(/__message__/, message || "[no error message found]")
            .replace(/__stack__/, stack || "[no error stack found]")
            .replace(/__signature__/, this.signature);
    }

    /**
     * This sends a pseudorandomly generated guid to the configuration's recipients, allowing them alone
     * to kill the server via the /kill/:key route.
     */
    private dispatchSessionPassword = async (sessionKey: string): Promise<void> => {
        const { mainLog } = this.sessionMonitor;
        const { notificationRecipient } = DashSessionAgent;
        mainLog(green("dispatching session key..."));
        const error = await Email.dispatch({
            to: notificationRecipient,
            subject: "Dash Release Session Admin Authentication Key",
            content: [
                `Here's the key for this session (started @ ${new Date().toUTCString()}):`,
                sessionKey,
                this.signature
            ].join("\n\n")
        });
        if (error) {
            this.sessionMonitor.mainLog(red(`dispatch failure @ ${notificationRecipient} (${yellow(error.message)})`));
            mainLog(red("distribution of session key experienced errors"));
        } else {
            mainLog(green("successfully distributed session key to recipients"));
        }
    }

    /**
     * This sends an email with the generated crash report.
     */
    private dispatchCrashReport: MessageHandler<{ error: Error }> = async ({ error: crashCause }) => {
        const { mainLog } = this.sessionMonitor;
        const { notificationRecipient } = DashSessionAgent;
        const error = await Email.dispatch({
            to: notificationRecipient,
            subject: "Dash Web Server Crash",
            content: this.generateCrashInstructions(crashCause)
        });
        if (error) {
            this.sessionMonitor.mainLog(red(`dispatch failure @ ${notificationRecipient} ${yellow(`(${error.message})`)}`));
            mainLog(red("distribution of crash notification experienced errors"));
        } else {
            mainLog(green("successfully distributed crash notification to recipients"));
        }
    }

    /**
     * Logic for interfacing with Solr. Either starts it, 
     * stops it, or rebuilds its indicies.
     */
    private executeSolrCommand = async (args: string[]): Promise<void> => {
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

    /**
     * Broadcast to all clients that their connection
     * is no longer valid, and explain why / what to expect.
     */
    private notifyClient: ExitHandler = reason => {
        const { _socket } = WebSocket;
        if (_socket) {
            const message = typeof reason === "boolean" ? (reason ? "exit" : "temporary") : "crash";
            Utils.Emit(_socket, MessageStore.ConnectionTerminated, message);
        }
    }

    /**
     * Performs a backup of the database, saved to the desktop subdirectory.
     * This should work as is only on our specific release server.
     */
    private backup = async (): Promise<void> => this.sessionMonitor.exec("backup.bat", { cwd: this.releaseDesktop });

    /**
     * Compress either a brand new backup or the most recent backup and send it
     * as an attachment to an email, dispatched to the requested recipient.
     * @param mode specifies whether or not to make a new backup before exporting
     * @param to the recipient of the email
     */
    private async dispatchZippedDebugBackup(to: string): Promise<void> {
        const { mainLog } = this.sessionMonitor;
        try {
            // if desired, complete an immediate backup to send
            await this.backup();
            mainLog("backup complete");

            const backupsDirectory = `${this.releaseDesktop}/backups`;

            // sort all backups by their modified time, and choose the most recent one
            const target = readdirSync(backupsDirectory).map(filename => ({
                modifiedTime: statSync(`${backupsDirectory}/${filename}`).mtimeMs,
                filename
            })).sort((a, b) => b.modifiedTime - a.modifiedTime)[0].filename;
            mainLog(`targeting ${target}...`);

            // create a zip file and to it, write the contents of the backup directory
            const zipName = `${target}.zip`;
            const zipPath = `${this.releaseDesktop}/${zipName}`;
            const targetPath = `${backupsDirectory}/${target}`;
            const output = createWriteStream(zipPath);
            const zip = Archiver('zip');
            zip.pipe(output);
            zip.directory(`${targetPath}/Dash`, false);
            await zip.finalize();
            mainLog(`zip finalized with size ${statSync(zipPath).size} bytes, saved to ${zipPath}`);

            // dispatch the email to the recipient, containing the finalized zip file
            const error = await Email.dispatch({
                to,
                subject: `Remote debug: compressed backup of ${target}...`,
                content: this.generateDebugInstructions(zipName, target),
                attachments: [{ filename: zipName, path: zipPath }]
            });

            // since this is intended to be a zero-footprint operation, clean up 
            // by unlinking both the backup generated earlier in the function and the compressed zip file.
            // to generate a persistent backup, just run backup.
            unlinkSync(zipPath);
            rimraf.sync(targetPath);

            // indicate success or failure
            mainLog(`${error === null ? green("successfully dispatched") : red("failed to dispatch")} ${zipName} to ${cyan(to)}`);
            error && mainLog(red(error.message));
        } catch (error) {
            mainLog(red("unable to dispatch zipped backup..."));
            mainLog(red(error.message));
        }
    }

}

export namespace DashSessionAgent {

    export const notificationRecipient = "brownptcdash@gmail.com";

}