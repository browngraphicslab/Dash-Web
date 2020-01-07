require('dotenv').config();
import { GoogleApiServerUtils } from "./apis/google/GoogleApiServerUtils";
import * as mobileDetect from 'mobile-detect';
import * as path from 'path';
import { Database } from './database';
const serverPort = 4321;
import { DashUploadUtils } from './DashUploadUtils';
import RouteSubscriber from './RouteSubscriber';
import initializeServer from './server_initialization';
import RouteManager, { Method, _success, _permission_denied, _error, _invalid, PublicHandler } from './RouteManager';
import * as qs from 'query-string';
import UtilManager from './ApiManagers/UtilManager';
import { SearchManager, SolrManager } from './ApiManagers/SearchManager';
import UserManager from './ApiManagers/UserManager';
import { WebSocket } from './Websocket/Websocket';
import DownloadManager from './ApiManagers/DownloadManager';
import { GoogleCredentialsLoader } from './credentials/CredentialsLoader';
import DeleteManager from "./ApiManagers/DeleteManager";
import PDFManager from "./ApiManagers/PDFManager";
import UploadManager from "./ApiManagers/UploadManager";
import { log_execution, Email } from "./ActionUtilities";
import GeneralGoogleManager from "./ApiManagers/GeneralGoogleManager";
import GooglePhotosManager from "./ApiManagers/GooglePhotosManager";
import { Logger } from "./ProcessFactory";
import { yellow, red } from "colors";
import { Session } from "./Session/session";
import { isMaster } from "cluster";
import { execSync } from "child_process";
import { Utils } from "../Utils";
import { MessageStore } from "./Message";

export const publicDirectory = path.resolve(__dirname, "public");
export const filesDirectory = path.resolve(publicDirectory, "files");

/**
 * These are the functions run before the server starts
 * listening. Anything that must be complete
 * before clients can access the server should be run or awaited here.
 */
async function preliminaryFunctions() {
    await Logger.initialize();
    await GoogleCredentialsLoader.loadCredentials();
    GoogleApiServerUtils.processProjectCredentials();
    await DashUploadUtils.buildFileDirectories();
    await log_execution({
        startMessage: "attempting to initialize mongodb connection",
        endMessage: "connection outcome determined",
        action: Database.tryInitializeConnection
    });
}

/**
 * Either clustered together as an API manager
 * or individually referenced below, by the completion
 * of this function's execution, all routes will
 * be registered on the server 
 * @param router the instance of the route manager
 * that will manage the registration of new routes
 * with the server
 */
function routeSetter({ isRelease, addSupervisedRoute, logRegistrationOutcome }: RouteManager) {
    const managers = [
        new UserManager(),
        new UploadManager(),
        new DownloadManager(),
        new SearchManager(),
        new PDFManager(),
        new DeleteManager(),
        new UtilManager(),
        new GeneralGoogleManager(),
        new GooglePhotosManager(),
    ];

    // initialize API Managers
    console.log(yellow("\nregistering server routes..."));
    managers.forEach(manager => manager.register(addSupervisedRoute));

    /**
     * Accessing root index redirects to home
     */
    addSupervisedRoute({
        method: Method.GET,
        subscription: "/",
        secureHandler: ({ res }) => res.redirect("/home")
    });

    addSupervisedRoute({
        method: Method.GET,
        subscription: "/serverHeartbeat",
        secureHandler: ({ res }) => res.send(true)
    });

    addSupervisedRoute({
        method: Method.GET,
        subscription: new RouteSubscriber("kill").add("key"),
        secureHandler: ({ req, res }) => {
            if (req.params.key === process.env.session_key) {
                res.send("<img src='https://media.giphy.com/media/NGIfqtcS81qi4/giphy.gif' style='width:100%;height:100%;'/>");
                process.send!({ action: { message: "kill" } });
            } else {
                res.redirect("/home");
            }
        }
    });

    const serve: PublicHandler = ({ req, res }) => {
        const detector = new mobileDetect(req.headers['user-agent'] || "");
        const filename = detector.mobile() !== null ? 'mobile/image.html' : 'index.html';
        res.sendFile(path.join(__dirname, '../../deploy/' + filename));
    };

    addSupervisedRoute({
        method: Method.GET,
        subscription: ["/home", new RouteSubscriber("doc").add("docId")],
        secureHandler: serve,
        publicHandler: ({ req, ...remaining }) => {
            const { originalUrl: target } = req;
            const sharing = qs.parse(qs.extract(req.originalUrl), { sort: false }).sharing === "true";
            const docAccess = target.startsWith("/doc/");
            if (sharing && docAccess) {
                serve({ req, ...remaining });
            }
        }
    });

    logRegistrationOutcome();

    // initialize the web socket (bidirectional communication: if a user changes
    // a field on one client, that change must be broadcast to all other clients)
    WebSocket.start(isRelease);
}

/**
 * This function can be used in two different ways. If not in release mode,
 * this is simply the logic that is invoked to start the server. In release mode,
 * however, this becomes the logic invoked by a single worker thread spawned by
 * the main monitor (master) thread.
 */
async function launchServer() {
    await log_execution({
        startMessage: "\nstarting execution of preliminary functions",
        endMessage: "completed preliminary functions\n",
        action: preliminaryFunctions
    });
    await initializeServer(routeSetter);
}

/**
 * If we're the monitor (master) thread, we should launch the monitor logic for the session.
 * Otherwise, we must be on a worker thread that was spawned *by* the monitor (master) thread, and thus
 * our job should be to run the server.
 */
async function launchMonitoredSession() {
    if (isMaster) {
        const notificationRecipients = ["samuel_wilkins@brown.edu"];
        const signature = "-Dash Server Session Manager";
        const extensions = await Session.initializeMonitorThread({
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
        });
        extensions.addReplCommand("pull", [], () => execSync("git pull", { stdio: ["ignore", "inherit", "inherit"] }));
        extensions.addReplCommand("solr", [/start|stop/g], args => SolrManager.SetRunning(args[0] === "start"));
    } else {
        const addExitHandler = await Session.initializeWorkerThread(launchServer); // server initialization delegated to worker
        addExitHandler(() => Utils.Emit(WebSocket._socket, MessageStore.ConnectionTerminated, "Manual"));
    }
}

/**
 * If you're in development mode, you won't need to run a session.
 * The session spawns off new server processes each time an error is encountered, and doesn't
 * log the output of the server process, so it's not ideal for development.
 * So, the 'else' clause is exactly what we've always run when executing npm start.
 */
if (process.env.RELEASE) {
    launchMonitoredSession();
} else {
    launchServer();
}