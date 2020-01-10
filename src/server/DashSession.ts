import { Session } from "./Session/session";
import { Email, pathFromRoot } from "./ActionUtilities";
import { red, yellow, green, cyan } from "colors";
import { get } from "request-promise";
import { Utils } from "../Utils";
import { WebSocket } from "./Websocket/Websocket";
import { MessageStore } from "./Message";
import { launchServer, onWindows } from ".";
import { existsSync, mkdirSync, readdirSync, statSync, createWriteStream } from "fs";
import * as Archiver from "archiver";

/**
* If we're the monitor (master) thread, we should launch the monitor logic for the session.
* Otherwise, we must be on a worker thread that was spawned *by* the monitor (master) thread, and thus
* our job should be to run the server.
*/
export class DashSessionAgent extends Session.AppliedSessionAgent {

    private readonly notificationRecipients = ["samuel_wilkins@brown.edu"];
    private readonly signature = "-Dash Server Session Manager";

    protected async launchMonitor() {
        const monitor = Session.Monitor.Create({
            key: async key => {
                // this sends a pseudorandomly generated guid to the configuration's recipients, allowing them alone
                // to kill the server via the /kill/:key route
                const content = `The key for this session (started @ ${new Date().toUTCString()}) is ${key}.\n\n${this.signature}`;
                const failures = await Email.dispatchAll(this.notificationRecipients, "Server Termination Key", content);
                if (failures) {
                    failures.map(({ recipient, error: { message } }) => monitor.mainLog(red(`dispatch failure @ ${recipient} (${yellow(message)})`)));
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
                    failures.map(({ recipient, error: { message } }) => monitor.mainLog(red(`dispatch failure @ ${recipient} (${yellow(message)})`)));
                    return false;
                }
                return true;
            }
        });
        monitor.addReplCommand("pull", [], () => monitor.exec("git pull"));
        monitor.addReplCommand("solr", [/start|stop|index/], async args => {
            const action = args[0];
            if (action === "index") {
                monitor.exec("npx ts-node ./updateSearch.ts", { cwd: pathFromRoot("./src/server") });
            } else {
                const command = `${onWindows ? "solr.cmd" : "solr"} ${args[0] === "start" ? "start" : "stop -p 8983"}`;
                await monitor.exec(command, { cwd: "./solr-8.3.1/bin" });
                try {
                    await get("http://localhost:8983");
                    monitor.mainLog(green("successfully connected to 8983 after running solr initialization"));
                } catch {
                    monitor.mainLog(red("unable to connect at 8983 after running solr initialization"));
                }
            }
        });
        const releaseDesktop = pathFromRoot("../../Desktop");
        const backup = () => monitor.exec("backup.bat", { cwd: releaseDesktop });
        monitor.addReplCommand("backup", [], backup);
        monitor.addReplCommand("debug", [/active|passive/, /\S+\@\S+/], async args => {
            const [mode, recipient] = args;
            if (mode === "active") {
                await backup();
            }
            monitor.mainLog("backup complete");
            const backupsDirectory = `${releaseDesktop}/backups`;
            const compressedDirectory = `${releaseDesktop}/compressed`;
            if (!existsSync(compressedDirectory)) {
                mkdirSync(compressedDirectory);
            }
            const target = readdirSync(backupsDirectory).map(filename => ({
                modifiedTime: statSync(`${backupsDirectory}/${filename}`).mtimeMs,
                filename
            })).sort((a, b) => b.modifiedTime - a.modifiedTime)[0].filename;
            monitor.mainLog(`targeting ${target}...`);
            const zipName = `${target}.zip`;
            const zipPath = `${compressedDirectory}/${zipName}`;
            const output = createWriteStream(zipPath);
            const zip = Archiver('zip');
            zip.pipe(output);
            zip.directory(`${backupsDirectory}/${target}/Dash`, false);
            await zip.finalize();
            monitor.mainLog(`zip finalized with size ${statSync(zipPath).size} bytes, saved to ${zipPath}`);
            const instructions = [
                `Instructions:\n\nDownload this attachment, open your downloads folder and find this file (${zipName}).`,
                `Right click on the zip file and select 'Extract to ${target}\\'.`,
                "Open up the command line, and remember that you can get the path to any file or directory by literally dragging it from the file system and dropping it onto the terminal.",
                "Unless it's in your path, you'll want to navigate to the mongodb bin directory, given for Windows: cd '/c/Program Files/MongoDB/Server/[your version goes here]/bin'. Then run the following command:\n",
                "mongorestore --gzip [/path/to/directory/you/just/unzipped] --db Dash.\n",
                "Assuming everything runs well, this will mirror your local database with that of the server.",
                "Now, just start the server locally and debug.\n",
                this.signature
            ].join("\n");
            const error = await Email.dispatch(recipient, `Compressed backup of ${target}...`, instructions, [
                {
                    filename: zipName,
                    path: zipPath
                }
            ]);
            monitor.mainLog(`${error === null ? green("successfully dispatched") : red("failed to dispatch")} ${zipName} to ${cyan(recipient)}`);
            error && monitor.mainLog(red(error.message));
        });
        return monitor;
    }

    protected async launchServerWorker() {
        const worker = Session.ServerWorker.Create(launchServer); // server initialization delegated to worker
        worker.addExitHandler(reason => {
            const { _socket } = WebSocket;
            if (_socket) {
                const message = typeof reason === "boolean" ? (reason ? "exit" : "temporary") : "crash";
                Utils.Emit(_socket, MessageStore.ConnectionTerminated, message);
            }
        });
        return worker;
    }

}