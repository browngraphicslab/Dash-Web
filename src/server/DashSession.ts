import { Session } from "./Session/session";
import { Email } from "./ActionUtilities";
import { red, yellow } from "colors";
import { SolrManager } from "./ApiManagers/SearchManager";
import { execSync } from "child_process";
import { isMaster } from "cluster";
import { Utils } from "../Utils";
import { WebSocket } from "./Websocket/Websocket";
import { MessageStore } from "./Message";
import { launchServer } from ".";

const notificationRecipients = ["samuel_wilkins@brown.edu"];
const signature = "-Dash Server Session Manager";

const monitorHooks: Session.MonitorNotifierHooks = {
    key: async (key, masterLog) => {
        const content = `The key for this session (started @ ${new Date().toUTCString()}) is ${key}.\n\n${signature}`;
        const failures = await Email.dispatchAll(notificationRecipients, "Server Termination Key", content);
        if (failures) {
            failures.map(({ recipient, error: { message } }) => masterLog(red(`dispatch failure @ ${recipient} (${yellow(message)})`)));
            return false;
        }
        return true;
    },
    crash: async ({ name, message, stack }, masterLog) => {
        const body = [
            "You, as a Dash Administrator, are being notified of a server crash event. Here's what we know:",
            `name:\n${name}`,
            `message:\n${message}`,
            `stack:\n${stack}`,
            "The server is already restarting itself, but if you're concerned, use the Remote Desktop Connection to monitor progress.",
        ].join("\n\n");
        const content = `${body}\n\n${signature}`;
        const failures = await Email.dispatchAll(notificationRecipients, "Dash Web Server Crash", content);
        if (failures) {
            failures.map(({ recipient, error: { message } }) => masterLog(red(`dispatch failure @ ${recipient} (${yellow(message)})`)));
            return false;
        }
        return true;
    }
};

export class DashSessionAgent extends Session.AppliedSessionAgent {

    /**
    * If we're the monitor (master) thread, we should launch the monitor logic for the session.
    * Otherwise, we must be on a worker thread that was spawned *by* the monitor (master) thread, and thus
    * our job should be to run the server.
    */
    protected async launchImplementation() {
        if (isMaster) {
            this.sessionMonitor = await Session.initializeMonitorThread(monitorHooks);
            this.sessionMonitor.addReplCommand("pull", [], () => execSync("git pull", { stdio: ["ignore", "inherit", "inherit"] }));
            this.sessionMonitor.addReplCommand("solr", [/start|stop/g], args => SolrManager.SetRunning(args[0] === "start"));
        } else {
            this.serverWorker = await Session.initializeWorkerThread(launchServer); // server initialization delegated to worker
            this.serverWorker.addExitHandler(() => Utils.Emit(WebSocket._socket, MessageStore.ConnectionTerminated, "Manual"));
        }
    }

}