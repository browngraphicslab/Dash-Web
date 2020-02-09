require('dotenv').config();
import { GoogleApiServerUtils } from "./apis/google/GoogleApiServerUtils";
import * as mobileDetect from 'mobile-detect';
import * as path from 'path';
import { Database } from './database';
import { DashUploadUtils } from './DashUploadUtils';
import RouteSubscriber from './RouteSubscriber';
import initializeServer from './server_Initialization';
import RouteManager, { Method, _success, _permission_denied, _error, _invalid, PublicHandler } from './RouteManager';
import * as qs from 'query-string';
import UtilManager from './ApiManagers/UtilManager';
import { SearchManager } from './ApiManagers/SearchManager';
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
import { Logger } from "./ProcessFactory";
import { yellow } from "colors";
import { DashSessionAgent } from "./DashSession/DashSessionAgent";
import SessionManager from "./ApiManagers/SessionManager";
import { AppliedSessionAgent } from "resilient-server-session";

export const onWindows = process.platform === "win32";
export let sessionAgent: AppliedSessionAgent;
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
    if (process.env.DB !== "MEM") {
        await log_execution({
            startMessage: "attempting to initialize mongodb connection",
            endMessage: "connection outcome determined",
            action: Database.tryInitializeConnection
        });
    }
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
        new SessionManager(),
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
export async function launchServer() {
    await log_execution({
        startMessage: "\nstarting execution of preliminary functions",
        endMessage: "completed preliminary functions\n",
        action: preliminaryFunctions
    });
    await initializeServer(routeSetter);
}

/**
 * If you're in development mode, you won't need to run a session.
 * The session spawns off new server processes each time an error is encountered, and doesn't
 * log the output of the server process, so it's not ideal for development.
 * So, the 'else' clause is exactly what we've always run when executing npm start.
 */
if (process.env.RELEASE) {
    (sessionAgent = new DashSessionAgent()).launch();
} else {
    launchServer();
}
