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

    const ServicesApiKeyMap = new Map<string, string | undefined>([
        ["face", process.env.FACE],
        ["vision", process.env.VISION],
        ["handwriting", process.env.HANDWRITING]
    ]);

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: new RouteSubscriber(RouteStore.cognitiveServices).add('requestedservice'),
        onValidation: ({ req, res }) => {
            let service = req.params.requestedservice;
            res.send(ServicesApiKeyMap.get(service));
        }
    });

    const EndpointHandlerMap = new Map<GoogleApiServerUtils.Action, GoogleApiServerUtils.ApiRouter>([
        ["create", (api, params) => api.create(params)],
        ["retrieve", (api, params) => api.get(params)],
        ["update", (api, params) => api.batchUpdate(params)],
    ]);

    router.addSupervisedRoute({
        method: Method.POST,
        subscription: new RouteSubscriber(RouteStore.googleDocs).add("sector", "action"),
        onValidation: async ({ req, res, user }) => {
            let sector: GoogleApiServerUtils.Service = req.params.sector as GoogleApiServerUtils.Service;
            let action: GoogleApiServerUtils.Action = req.params.action as GoogleApiServerUtils.Action;
            const endpoint = await GoogleApiServerUtils.GetEndpoint(GoogleApiServerUtils.Service[sector], user.id);
            let handler = EndpointHandlerMap.get(action);
            if (endpoint && handler) {
                handler(endpoint, req.body)
                    .then(response => res.send(response.data))
                    .catch(exception => res.send(exception));
                return;
            }
            res.send(undefined);
        }
    });

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: RouteStore.readGoogleAccessToken,
        onValidation: async ({ user, res }) => {
            const userId = user.id;
            const token = await GoogleApiServerUtils.retrieveAccessToken(userId);
            if (!token) {
                return res.send(GoogleApiServerUtils.generateAuthenticationUrl());
            }
            return res.send(token);
        }
    });

    router.addSupervisedRoute({
        method: Method.POST,
        subscription: RouteStore.writeGoogleAccessToken,
        onValidation: async ({ user, req, res }) => {
            res.send(await GoogleApiServerUtils.processNewUser(user.id, req.body.authenticationCode));
        }
    });

    const authenticationError = "Unable to authenticate Google credentials before uploading to Google Photos!";
    const mediaError = "Unable to convert all uploaded bytes to media items!";
    interface GooglePhotosUploadFailure {
        batch: number;
        index: number;
        url: string;
        reason: string;
    }

    router.addSupervisedRoute({
        method: Method.POST,
        subscription: RouteStore.googlePhotosMediaUpload,
        onValidation: async ({ user, req, res }) => {
            const { media } = req.body;

            const token = await GoogleApiServerUtils.retrieveAccessToken(user.id);
            if (!token) {
                return _error(res, authenticationError);
            }

            let failed: GooglePhotosUploadFailure[] = [];
            const batched = BatchedArray.from<GooglePhotosUploadUtils.UploadSource>(media, { batchSize: 25 });
            const newMediaItems = await batched.batchedMapPatientInterval<GooglePhotosUploadUtils.NewMediaItem>(
                { magnitude: 100, unit: TimeUnit.Milliseconds },
                async (batch, collector, { completedBatches }) => {
                    for (let index = 0; index < batch.length; index++) {
                        const { url, description } = batch[index];
                        const fail = (reason: string) => failed.push({ reason, batch: completedBatches + 1, index, url });
                        const uploadToken = await GooglePhotosUploadUtils.DispatchGooglePhotosUpload(token, url).catch(fail);
                        if (!uploadToken) {
                            fail(`${path.extname(url)} is not an accepted extension`);
                        } else {
                            collector.push({
                                description,
                                simpleMediaItem: { uploadToken }
                            });
                        }
                    }
                }
            );

            const failedCount = failed.length;
            if (failedCount) {
                console.error(`Unable to upload ${failedCount} image${failedCount === 1 ? "" : "s"} to Google's servers`);
                console.log(failed.map(({ reason, batch, index, url }) => `@${batch}.${index}: ${url} failed:\n${reason}`).join('\n\n'));
            }

            return GooglePhotosUploadUtils.CreateMediaItems(token, newMediaItems, req.body.album).then(
                results => _success(res, { results, failed }),
                error => _error(res, mediaError, error)
            );
        }
    });

    interface MediaItem {
        baseUrl: string;
        filename: string;
    }
    const prefix = "google_photos_";

    const downloadError = "Encountered an error while executing downloads.";
    const requestError = "Unable to execute download: the body's media items were malformed.";

    const UploadError = (count: number) => `Unable to upload ${count} images to Dash's server`;
    router.addSupervisedRoute({
        method: Method.POST,
        subscription: RouteStore.googlePhotosMediaDownload,
        onValidation: async ({ req, res }) => {
            const contents: { mediaItems: MediaItem[] } = req.body;
            let failed = 0;
            if (contents) {
                const completed: Opt<DashUploadUtils.UploadInformation>[] = [];
                for (let item of contents.mediaItems) {
                    const { contentSize, ...attributes } = await DashUploadUtils.InspectImage(item.baseUrl);
                    const found: Opt<DashUploadUtils.UploadInformation> = await Database.Auxiliary.QueryUploadHistory(contentSize!);
                    if (!found) {
                        const upload = await DashUploadUtils.UploadInspectedImage({ contentSize, ...attributes }, item.filename, prefix).catch(error => _error(res, downloadError, error));
                        if (upload) {
                            completed.push(upload);
                            await Database.Auxiliary.LogUpload(upload);
                        } else {
                            failed++;
                        }
                    } else {
                        completed.push(found);
                    }
                }
                if (failed) {
                    return _error(res, UploadError(failed));
                }
                return _success(res, completed);
            }
            _invalid(res, requestError);
        }
    });
}

(async function start() {
    await preliminaryFunctions();
    await initializeServer({ listenAtPort: 1050, routeSetter });
})();
