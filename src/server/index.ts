require('dotenv').config();
import { GoogleApiServerUtils } from "./apis/google/GoogleApiServerUtils";
import * as mobileDetect from 'mobile-detect';
import * as path from 'path';
import { Database } from './database';
const serverPort = 4321;
import { DashUploadUtils } from './DashUploadUtils';
import RouteSubscriber from './RouteSubscriber';
import initializeServer from './Initialization';
import RouteManager, { Method, _success, _permission_denied, _error, _invalid, OnUnauthenticated } from './RouteManager';
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
import { log_execution } from "./ActionUtilities";
import GeneralGoogleManager from "./ApiManagers/GeneralGoogleManager";
import GooglePhotosManager from "./ApiManagers/GooglePhotosManager";
import { yellow, red, cyan } from "colors";
import { disconnect } from "../server/Initialization";
import { Logger } from "./ProcessFactory";
import { isMaster, on, fork, workers } from "cluster";
import { identifier } from "./session_manager/config";
import InputManager from "./session_manager/input_manager";
import { execSync } from "child_process";
import { CrashEmail } from "./session_manager/crash_email";
const killport = require("kill-port");

export const onWindows = process.platform === "win32";
export const publicDirectory = path.resolve(__dirname, "public");
export const filesDirectory = path.resolve(publicDirectory, "files");

export const ExitHandlers = new Array<() => void>();

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
        onValidation: ({ res }) => res.redirect("/home")
    });

    addSupervisedRoute({
        method: Method.GET,
        subscription: "/serverHeartbeat",
        onValidation: ({ res }) => res.send(true)
    });

    addSupervisedRoute({
        method: Method.GET,
        subscription: "/shutdown",
        onValidation: async ({ res }) => {
            WebSocket.disconnect();
            await disconnect();
            await Database.disconnect();
            SolrManager.SetRunning(false);
            res.send("Server successfully shut down.");
            process.exit(0);
        }
    });

    const serve: OnUnauthenticated = ({ req, res }) => {
        const detector = new mobileDetect(req.headers['user-agent'] || "");
        const filename = detector.mobile() !== null ? 'mobile/image.html' : 'index.html';
        res.sendFile(path.join(__dirname, '../../deploy/' + filename));
    };

    addSupervisedRoute({
        method: Method.GET,
        subscription: ["/home", new RouteSubscriber("doc").add("docId")],
        onValidation: serve,
        onUnauthenticated: ({ req, ...remaining }) => {
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
    WebSocket.initialize(serverPort, isRelease);
}

async function start() {
    await log_execution({
        startMessage: "\nstarting execution of preliminary functions",
        endMessage: "completed preliminary functions\n",
        action: preliminaryFunctions
    });
    await initializeServer({ serverPort: 1050, routeSetter });
}

const admin = ["samuel_wilkins@brown.edu"];
if (isMaster) {
    fork();
    on("exit", ({ process: { pid } }, code, signal) => {
        const prompt = `Server worker with process id ${pid} has died with code ${code}${signal === null ? "" : `, having encountered signal ${signal}`}.\n`;
        console.log(cyan(prompt));
        fork();
    });
    const { registerCommand } = new InputManager({ identifier });
    registerCommand("exit", [], () => execSync(onWindows ? "taskkill /f /im node.exe" : "killall -9 node"));
    registerCommand("restart", [], () => {
        for (const id in workers) {
            workers[id]?.kill();
        }
        fork();
    });
} else {
    process.on('uncaughtException', async error => {
        await CrashEmail.dispatch(error, admin);
        console.error(red(`Crash event detected @ ${new Date().toUTCString()}`));
        console.error(error.message);
        process.exit(1);
    });
    start();
}