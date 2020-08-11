require('dotenv').config();
import { yellow } from "colors";
import * as mobileDetect from 'mobile-detect';
import * as path from 'path';
import * as qs from 'query-string';
import { log_execution } from "./ActionUtilities";
import DeleteManager from "./ApiManagers/DeleteManager";
import DownloadManager from './ApiManagers/DownloadManager';
import GeneralGoogleManager from "./ApiManagers/GeneralGoogleManager";
import GooglePhotosManager from "./ApiManagers/GooglePhotosManager";
import PDFManager from "./ApiManagers/PDFManager";
import { SearchManager } from './ApiManagers/SearchManager';
import SessionManager from "./ApiManagers/SessionManager";
import UploadManager from "./ApiManagers/UploadManager";
import UserManager from './ApiManagers/UserManager';
import UtilManager from './ApiManagers/UtilManager';
import { GoogleCredentialsLoader, SSL } from './apis/google/CredentialsLoader';
import { GoogleApiServerUtils } from "./apis/google/GoogleApiServerUtils";
import { AppliedSessionAgent } from "./DashSession/Session/agents/applied_session_agent";
import { DashUploadUtils } from './DashUploadUtils';
import { Database } from './database';
import { Logger } from "./ProcessFactory";
import RouteManager, { Method, PublicHandler } from './RouteManager';
import RouteSubscriber from './RouteSubscriber';
import initializeServer, { resolvedPorts } from './server_Initialization';

export const AdminPriviliges: Map<string, boolean> = new Map();
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
    // Utils.TraceConsoleLog();
    await DashUploadUtils.buildFileDirectories();
    await Logger.initialize();
    await GoogleCredentialsLoader.loadCredentials();
    SSL.loadCredentials();
    GoogleApiServerUtils.processProjectCredentials();
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

    addSupervisedRoute({
        method: Method.GET,
        subscription: "/resolvedPorts",
        secureHandler: ({ res }) => res.send(resolvedPorts)
    });

    const serve: PublicHandler = ({ req, res }) => {
        const detector = new mobileDetect(req.headers['user-agent'] || "");
        const filename = detector.mobile() !== null ? 'mobile/image.html' : 'index.html';
        res.sendFile(path.join(__dirname, '../../deploy/' + filename));
    };

    /**
     * Serves a simple password input box for any 
     */
    addSupervisedRoute({
        method: Method.GET,
        subscription: new RouteSubscriber("admin").add("previous_target"),
        secureHandler: ({ res, isRelease }) => {
            const { PASSWORD } = process.env;
            if (!(isRelease && PASSWORD)) {
                return res.redirect("/home");
            }
            res.render("admin.pug", { title: "Enter Administrator Password" });
        }
    });

    addSupervisedRoute({
        method: Method.POST,
        subscription: new RouteSubscriber("admin").add("previous_target"),
        secureHandler: async ({ req, res, isRelease, user: { id } }) => {
            const { PASSWORD } = process.env;
            if (!(isRelease && PASSWORD)) {
                return res.redirect("/home");
            }
            const { password } = req.body;
            const { previous_target } = req.params;
            let redirect: string;
            if (password === PASSWORD) {
                AdminPriviliges.set(id, true);
                redirect = `/${previous_target.replace(":", "/")}`;
            } else {
                redirect = `/admin/${previous_target}`;
            }
            res.redirect(redirect);
        }
    });

    addSupervisedRoute({
        method: Method.GET,
        subscription: ["/home", new RouteSubscriber("doc").add("docId")],
        secureHandler: serve,
        publicHandler: ({ req, res, ...remaining }) => {
            const { originalUrl: target } = req;
            const sharing = qs.parse(qs.extract(req.originalUrl), { sort: false }).sharing === "true";
            const docAccess = target.startsWith("/doc/");
            // since this is the public handler, there's no meaning of '/home' to speak of
            // since there's no user logged in, so the only viable operation
            // for a guest is to look at a shared document
            if (sharing && docAccess) {
                serve({ req, res, ...remaining });
            } else {
                res.redirect("/login");
            }
        }
    });

    logRegistrationOutcome();
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
// if (process.env.RELEASE) {
//     (sessionAgent = new DashSessionAgent()).launch();
// } else {
(Database.Instance as Database.Database).doConnect();
launchServer();
// }
