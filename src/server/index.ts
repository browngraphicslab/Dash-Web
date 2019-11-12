require('dotenv').config();
import { GoogleApiServerUtils } from "./apis/google/GoogleApiServerUtils";
import * as mobileDetect from 'mobile-detect';
import * as path from 'path';
import { Database } from './database';
import { RouteStore } from './RouteStore';
const serverPort = 4321;
import { GooglePhotosUploadUtils } from './apis/google/GooglePhotosUploadUtils';
import { Opt } from '../new_fields/Doc';
import { DashUploadUtils } from './DashUploadUtils';
import { BatchedArray, TimeUnit } from 'array-batcher';
import RouteSubscriber from './RouteSubscriber';
import initializeServer from './Initialization';
import RouteManager, { Method, _success, _permission_denied, _error, _invalid, OnUnauthenticated } from './RouteManager';
import * as qs from 'query-string';
import UtilManager from './ApiManagers/UtilManager';
import SearchManager from './ApiManagers/SearchManager';
import UserManager from './ApiManagers/UserManager';
import { WebSocket } from './Websocket/Websocket';
import DownloadManager from './ApiManagers/ExportManager';
import { GoogleCredentialsLoader } from './credentials/CredentialsLoader';
import DeleteManager from "./ApiManagers/DeleteManager";
import PDFManager from "./ApiManagers/PDFManager";
import UploadManager from "./ApiManagers/UploadManager";

export const publicDirectory = __dirname + RouteStore.public;
export const filesDirectory = publicDirectory + "/files/";
export enum Partitions {
    pdf_text,
    images,
    videos
}

/**
 * These are the functions run before the server starts
 * listening. Anything that must be complete
 * before clients can access the server should be run or awaited here.
 */
async function preliminaryFunctions() {
    // make project credentials globally accessible
    await GoogleCredentialsLoader.loadCredentials();
    // read the resulting credentials into a different namespace
    GoogleApiServerUtils.processProjectCredentials();
    // divide the public directory based on type
    await Promise.all(Object.keys(Partitions).map(partition => DashUploadUtils.createIfNotExists(filesDirectory + partition)));
    // connect to the database
    await Database.tryInitializeConnection();
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
function routeSetter(router: RouteManager) {
    // initialize API Managers
    [
        new UserManager(),
        new UploadManager(),
        new DownloadManager(),
        new SearchManager(),
        new PDFManager(),
        new DeleteManager(),
        new UtilManager()
    ].forEach(manager => manager.register(router));

    // initialize the web socket (bidirectional communication: if a user changes
    // a field on one client, that change must be broadcast to all other clients)
    WebSocket.initialize(serverPort, router.isRelease);

    /**
     * Anyone attempting to navigate to localhost at this port will
     * first have to log in.
     */
    router.addSupervisedRoute({
        method: Method.GET,
        subscription: RouteStore.root,
        onValidation: ({ res }) => res.redirect(RouteStore.home)
    });

    const serve: OnUnauthenticated = ({ req, res }) => {
        let detector = new mobileDetect(req.headers['user-agent'] || "");
        let filename = detector.mobile() !== null ? 'mobile/image.html' : 'index.html';
        res.sendFile(path.join(__dirname, '../../deploy/' + filename));
    };

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: [RouteStore.home, new RouteSubscriber("/doc").add("docId")],
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
}

(async function start() {
    await preliminaryFunctions();
    await initializeServer({ listenAtPort: 1050, routeSetter });
})();
