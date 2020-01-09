import { Session } from "./Session/session";
import { Email } from "./ActionUtilities";
import { red, yellow } from "colors";
import { get } from "request-promise";
import { Utils } from "../Utils";
import { WebSocket } from "./Websocket/Websocket";
import { MessageStore } from "./Message";
import { launchServer } from ".";

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
        monitor.addReplCommand("solr", [/start|stop/], async args => {
            const command = args[0] === "start" ? "start" : "stop -p 8983";
            await monitor.exec(command, { cwd: "./solr-8.3.1/bin" });
            try {
                await get("http://localhost:8983");
                return true;
            } catch {
                return false;
            }
        });
        return monitor;
    }

    protected async launchServerWorker() {
        const worker = Session.ServerWorker.Create(launchServer); // server initialization delegated to worker
        worker.addExitHandler(() => Utils.Emit(WebSocket._socket, MessageStore.ConnectionTerminated, "Manual"));
        return worker;
    }

}