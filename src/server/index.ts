require('dotenv').config();
import * as formidable from 'formidable';
import * as fs from 'fs';
import * as sharp from 'sharp';
import * as Pdfjs from 'pdfjs-dist';
const imageDataUri = require('image-data-uri');
import * as mobileDetect from 'mobile-detect';
import * as path from 'path';
import { Database } from './database';
import { RouteStore } from './RouteStore';
import v4 = require('uuid/v4');
import { createCanvas } from "canvas";
const serverPort = 4321;
import { Search } from './Search';
import * as Archiver from 'archiver';
var AdmZip = require('adm-zip');
import * as YoutubeApi from "./apis/youtube/youtubeApiSample";
import { Response } from 'express-serve-static-core';
import { GoogleApiServerUtils } from "./apis/google/GoogleApiServerUtils";
const probe = require("probe-image-size");
const pdf = require('pdf-parse');
import { GooglePhotosUploadUtils } from './apis/google/GooglePhotosUploadUtils';
import { Opt } from '../new_fields/Doc';
import { DashUploadUtils } from './DashUploadUtils';
import { BatchedArray, TimeUnit } from 'array-batcher';
import { ParsedPDF } from "./PdfTypes";
import { reject } from 'bluebird';
import RouteSubscriber from './RouteSubscriber';
import InitializeServer from './Initialization';
import RouteManager, { Method, _success, _permission_denied, _error, _invalid, OnUnauthenticated } from './RouteManager';
import * as qs from 'query-string';
import UtilManager from './ApiManagers/UtilManager';
import SearchManager from './ApiManagers/SearchManager';
import UserManager from './ApiManagers/UserManager';
import { WebSocket } from './Websocket/Websocket';
import ExportManager from './ApiManagers/ExportManager';
import ApiManager from './ApiManagers/ApiManager';

export let youtubeApiKey: string;

export interface NewMediaItem {
    description: string;
    simpleMediaItem: {
        uploadToken: string;
    };
}

const pngTypes = [".png", ".PNG"];
const jpgTypes = [".jpg", ".JPG", ".jpeg", ".JPEG"];
export const uploadDirectory = __dirname + "/public/files/";
const pdfDirectory = uploadDirectory + "text";
const solrURL = "http://localhost:8983/solr/#/dash";

start();

async function start() {
    await PreliminaryFunctions();
    await InitializeServer({ listenAtPort: 1050, routeSetter });
}

async function PreliminaryFunctions() {
    await new Promise<void>(resolve => {
        YoutubeApi.readApiKey((apiKey: string) => {
            youtubeApiKey = apiKey;
            resolve();
        });
    });
    await GoogleApiServerUtils.loadClientSecret();
    await DashUploadUtils.createIfNotExists(pdfDirectory);
    await Database.tryInitializeConnection();
}

function routeSetter(router: RouteManager) {
    const managers: ApiManager[] = [
        new UtilManager(),
        new SearchManager(),
        new UserManager(),
        new ExportManager()
    ];
    managers.forEach(manager => manager.register(router));

    WebSocket.initialize(serverPort, router.isRelease);

    async function getDocs(id: string) {
        const files = new Set<string>();
        const docs: { [id: string]: any } = {};
        const fn = (doc: any): string[] => {
            const id = doc.id;
            if (typeof id === "string" && id.endsWith("Proto")) {
                //Skip protos
                return [];
            }
            const ids: string[] = [];
            for (const key in doc.fields) {
                if (!doc.fields.hasOwnProperty(key)) {
                    continue;
                }
                const field = doc.fields[key];
                if (field === undefined || field === null) {
                    continue;
                }

                if (field.__type === "proxy" || field.__type === "prefetch_proxy") {
                    ids.push(field.fieldId);
                } else if (field.__type === "script" || field.__type === "computed") {
                    if (field.captures) {
                        ids.push(field.captures.fieldId);
                    }
                } else if (field.__type === "list") {
                    ids.push(...fn(field));
                } else if (typeof field === "string") {
                    const re = /"(?:dataD|d)ocumentId"\s*:\s*"([\w\-]*)"/g;
                    let match: string[] | null;
                    while ((match = re.exec(field)) !== null) {
                        ids.push(match[1]);
                    }
                } else if (field.__type === "RichTextField") {
                    const re = /"href"\s*:\s*"(.*?)"/g;
                    let match: string[] | null;
                    while ((match = re.exec(field.Data)) !== null) {
                        const urlString = match[1];
                        const split = new URL(urlString).pathname.split("doc/");
                        if (split.length > 1) {
                            ids.push(split[split.length - 1]);
                        }
                    }
                    const re2 = /"src"\s*:\s*"(.*?)"/g;
                    while ((match = re2.exec(field.Data)) !== null) {
                        const urlString = match[1];
                        const pathname = new URL(urlString).pathname;
                        files.add(pathname);
                    }
                } else if (["audio", "image", "video", "pdf", "web"].includes(field.__type)) {
                    const url = new URL(field.url);
                    const pathname = url.pathname;
                    files.add(pathname);
                }
            }

            if (doc.id) {
                docs[doc.id] = doc;
            }
            return ids;
        };
        await Database.Instance.visit([id], fn);
        return { id, docs, files };
    }

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: new RouteSubscriber("/serializeDoc").add("docId"),
        onValidation: async ({ req, res }) => {
            const { docs, files } = await getDocs(req.params.docId);
            res.send({ docs, files: Array.from(files) });
        }
    });

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: new RouteSubscriber("/downloadId").add("docId"),
        onValidation: async ({ req, res }) => {
            res.set('Content-disposition', `attachment;`);
            res.set('Content-Type', "application/zip");
            const { id, docs, files } = await getDocs(req.params.docId);
            const docString = JSON.stringify({ id, docs });
            const zip = Archiver('zip');
            zip.pipe(res);
            zip.append(docString, { name: "doc.json" });
            files.forEach(val => {
                zip.file(__dirname + RouteStore.public + val, { name: val.substring(1) });
            });
            zip.finalize();
        }
    });

    router.addSupervisedRoute({
        method: Method.POST,
        subscription: "/uploadDoc",
        onValidation: ({ req, res }) => {
            let form = new formidable.IncomingForm();
            form.keepExtensions = true;
            // let path = req.body.path;
            const ids: { [id: string]: string } = {};
            let remap = true;
            const getId = (id: string): string => {
                if (!remap) return id;
                if (id.endsWith("Proto")) return id;
                if (id in ids) {
                    return ids[id];
                } else {
                    return ids[id] = v4();
                }
            };
            const mapFn = (doc: any) => {
                if (doc.id) {
                    doc.id = getId(doc.id);
                }
                for (const key in doc.fields) {
                    if (!doc.fields.hasOwnProperty(key)) {
                        continue;
                    }
                    const field = doc.fields[key];
                    if (field === undefined || field === null) {
                        continue;
                    }

                    if (field.__type === "proxy" || field.__type === "prefetch_proxy") {
                        field.fieldId = getId(field.fieldId);
                    } else if (field.__type === "script" || field.__type === "computed") {
                        if (field.captures) {
                            field.captures.fieldId = getId(field.captures.fieldId);
                        }
                    } else if (field.__type === "list") {
                        mapFn(field);
                    } else if (typeof field === "string") {
                        const re = /("(?:dataD|d)ocumentId"\s*:\s*")([\w\-]*)"/g;
                        doc.fields[key] = (field as any).replace(re, (match: any, p1: string, p2: string) => {
                            return `${p1}${getId(p2)}"`;
                        });
                    } else if (field.__type === "RichTextField") {
                        const re = /("href"\s*:\s*")(.*?)"/g;
                        field.Data = field.Data.replace(re, (match: any, p1: string, p2: string) => {
                            return `${p1}${getId(p2)}"`;
                        });
                    }
                }
            };
            return new Promise<void>(resolve => {
                form.parse(req, async (_err, fields, files) => {
                    remap = fields.remap !== "false";
                    let id: string = "";
                    try {
                        for (const name in files) {
                            const path_2 = files[name].path;
                            const zip = new AdmZip(path_2);
                            zip.getEntries().forEach((entry: any) => {
                                if (!entry.entryName.startsWith("files/")) return;
                                let dirname = path.dirname(entry.entryName) + "/";
                                let extname = path.extname(entry.entryName);
                                let basename = path.basename(entry.entryName).split(".")[0];
                                // zip.extractEntryTo(dirname + basename + "_o" + extname, __dirname + RouteStore.public, true, false);
                                // zip.extractEntryTo(dirname + basename + "_s" + extname, __dirname + RouteStore.public, true, false);
                                // zip.extractEntryTo(dirname + basename + "_m" + extname, __dirname + RouteStore.public, true, false);
                                // zip.extractEntryTo(dirname + basename + "_l" + extname, __dirname + RouteStore.public, true, false);
                                try {
                                    zip.extractEntryTo(entry.entryName, __dirname + RouteStore.public, true, false);
                                    dirname = "/" + dirname;

                                    fs.createReadStream(__dirname + RouteStore.public + dirname + basename + extname).pipe(fs.createWriteStream(__dirname + RouteStore.public + dirname + basename + "_o" + extname));
                                    fs.createReadStream(__dirname + RouteStore.public + dirname + basename + extname).pipe(fs.createWriteStream(__dirname + RouteStore.public + dirname + basename + "_s" + extname));
                                    fs.createReadStream(__dirname + RouteStore.public + dirname + basename + extname).pipe(fs.createWriteStream(__dirname + RouteStore.public + dirname + basename + "_m" + extname));
                                    fs.createReadStream(__dirname + RouteStore.public + dirname + basename + extname).pipe(fs.createWriteStream(__dirname + RouteStore.public + dirname + basename + "_l" + extname));
                                } catch (e) {
                                    console.log(e);
                                }
                            });
                            const json = zip.getEntry("doc.json");
                            let docs: any;
                            try {
                                let data = JSON.parse(json.getData().toString("utf8"));
                                docs = data.docs;
                                id = data.id;
                                docs = Object.keys(docs).map(key => docs[key]);
                                docs.forEach(mapFn);
                                await Promise.all(docs.map((doc: any) => new Promise(res => Database.Instance.replace(doc.id, doc, (err, r) => {
                                    err && console.log(err);
                                    res();
                                }, true, "newDocuments"))));
                            } catch (e) { console.log(e); }
                            fs.unlink(path_2, () => { });
                        }
                        if (id) {
                            res.send(JSON.stringify(getId(id)));
                        } else {
                            res.send(JSON.stringify("error"));
                        }
                    } catch (e) { console.log(e); }
                    resolve();
                });
            });
        }
    });

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: new RouteSubscriber("/thumbnail").add("filename"),
        onValidation: ({ req, res }) => {
            let filename = req.params.filename;
            let noExt = filename.substring(0, filename.length - ".png".length);
            let pagenumber = parseInt(noExt.split('-')[1]);
            return new Promise<void>(resolve => {
                fs.exists(uploadDirectory + filename, (exists: boolean) => {
                    console.log(`${uploadDirectory + filename} ${exists ? "exists" : "does not exist"}`);
                    if (exists) {
                        let input = fs.createReadStream(uploadDirectory + filename);
                        probe(input, (err: any, result: any) => {
                            if (err) {
                                console.log(err);
                                console.log(`error on ${filename}`);
                                return;
                            }
                            res.send({ path: "/files/" + filename, width: result.width, height: result.height });
                        });
                    }
                    else {
                        LoadPage(uploadDirectory + filename.substring(0, filename.length - noExt.split('-')[1].length - ".PNG".length - 1) + ".pdf", pagenumber, res);
                    }
                    resolve();
                });
            });
        }
    });

    function LoadPage(file: string, pageNumber: number, res: Response) {
        console.log(file);
        Pdfjs.getDocument(file).promise
            .then((pdf: Pdfjs.PDFDocumentProxy) => {
                let factory = new NodeCanvasFactory();
                console.log(pageNumber);
                pdf.getPage(pageNumber).then((page: Pdfjs.PDFPageProxy) => {
                    console.log("reading " + page);
                    let viewport = page.getViewport(1 as any);
                    let canvasAndContext = factory.create(viewport.width, viewport.height);
                    let renderContext = {
                        canvasContext: canvasAndContext.context,
                        viewport: viewport,
                        canvasFactory: factory
                    };
                    console.log("read " + pageNumber);

                    page.render(renderContext).promise
                        .then(() => {
                            console.log("saving " + pageNumber);
                            let stream = canvasAndContext.canvas.createPNGStream();
                            let pngFile = `${file.substring(0, file.length - ".pdf".length)}-${pageNumber}.PNG`;
                            let out = fs.createWriteStream(pngFile);
                            stream.pipe(out);
                            out.on("finish", () => {
                                console.log(`Success! Saved to ${pngFile}`);
                                let name = path.basename(pngFile);
                                res.send({ path: "/files/" + name, width: viewport.width, height: viewport.height });
                            });
                        }, (reason: string) => {
                            console.error(reason + ` ${pageNumber}`);
                        });
                });
            });
    }

    /**
     * Anyone attempting to navigate to localhost at this port will
     * first have to log in.
     */
    router.addSupervisedRoute({
        method: Method.GET,
        subscription: RouteStore.root,
        onValidation: ({ res }) => res.redirect(RouteStore.home)
    });

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: RouteStore.getUsers,
        onValidation: async ({ res }) => {
            const cursor = await Database.Instance.query({}, { email: 1, userDocumentId: 1 }, "users");
            const results = await cursor.toArray();
            res.send(results.map(user => ({ email: user.email, userDocumentId: user.userDocumentId })));
        }
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

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: RouteStore.getUserDocumentId,
        onValidation: ({ res, user }) => res.send(user.userDocumentId)
    });

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: RouteStore.getCurrUser,
        onValidation: ({ res, user }) => res.send(JSON.stringify(user)),
        onUnauthenticated: ({ res }) => res.send(JSON.stringify({ id: "__guest__", email: "" }))
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

    class NodeCanvasFactory {
        create = (width: number, height: number) => {
            var canvas = createCanvas(width, height);
            var context = canvas.getContext('2d');
            return {
                canvas,
                context
            };
        }

        reset = (canvasAndContext: any, width: number, height: number) => {
            canvasAndContext.canvas.width = width;
            canvasAndContext.canvas.height = height;
        }

        destroy = (canvasAndContext: any) => {
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
            canvasAndContext.canvas = null;
            canvasAndContext.context = null;
        }
    }

    interface ImageFileResponse {
        name: string;
        path: string;
        type: string;
        exif: Opt<DashUploadUtils.EnrichedExifData>;
    }

    router.addSupervisedRoute({
        method: Method.POST,
        subscription: RouteStore.upload,
        onValidation: async ({ req, res }) => {
            let form = new formidable.IncomingForm();
            form.uploadDir = uploadDirectory;
            form.keepExtensions = true;
            return new Promise<void>(resolve => {
                form.parse(req, async (_err, _fields, files) => {
                    let results: ImageFileResponse[] = [];
                    for (const key in files) {
                        const { type, path: location, name } = files[key];
                        const filename = path.basename(location);
                        let uploadInformation: Opt<DashUploadUtils.UploadInformation>;
                        if (filename.endsWith(".pdf")) {
                            let dataBuffer = fs.readFileSync(uploadDirectory + filename);
                            const result: ParsedPDF = await pdf(dataBuffer);
                            await new Promise<void>(resolve => {
                                const path = pdfDirectory + "/" + filename.substring(0, filename.length - ".pdf".length) + ".txt";
                                fs.createWriteStream(path).write(result.text, error => {
                                    if (!error) {
                                        resolve();
                                    } else {
                                        reject(error);
                                    }
                                });
                            });
                        } else {
                            uploadInformation = await DashUploadUtils.UploadImage(uploadDirectory + filename, filename);
                        }
                        const exif = uploadInformation ? uploadInformation.exifData : undefined;
                        results.push({ name, type, path: `/files/${filename}`, exif });
                    }
                    _success(res, results);
                    resolve();
                });
            });
        }
    });

    router.addSupervisedRoute({
        method: Method.POST,
        subscription: RouteStore.inspectImage,
        onValidation: async ({ req, res }) => {
            const { source } = req.body;
            if (typeof source === "string") {
                const uploadInformation = await DashUploadUtils.UploadImage(source);
                return res.send(await DashUploadUtils.InspectImage(uploadInformation.mediaPaths[0]));
            }
            res.send({});
        }
    });

    router.addSupervisedRoute({
        method: Method.POST,
        subscription: RouteStore.dataUriToImage,
        onValidation: ({ req, res }) => {
            const uri = req.body.uri;
            const filename = req.body.name;
            if (!uri || !filename) {
                res.status(401).send("incorrect parameters specified");
                return;
            }
            return imageDataUri.outputFile(uri, uploadDirectory + filename).then((savedName: string) => {
                const ext = path.extname(savedName);
                let resizers = [
                    { resizer: sharp().resize(100, undefined, { withoutEnlargement: true }), suffix: "_s" },
                    { resizer: sharp().resize(400, undefined, { withoutEnlargement: true }), suffix: "_m" },
                    { resizer: sharp().resize(900, undefined, { withoutEnlargement: true }), suffix: "_l" },
                ];
                let isImage = false;
                if (pngTypes.includes(ext)) {
                    resizers.forEach(element => {
                        element.resizer = element.resizer.png();
                    });
                    isImage = true;
                } else if (jpgTypes.includes(ext)) {
                    resizers.forEach(element => {
                        element.resizer = element.resizer.jpeg();
                    });
                    isImage = true;
                }
                if (isImage) {
                    resizers.forEach(resizer => {
                        fs.createReadStream(savedName).pipe(resizer.resizer).pipe(fs.createWriteStream(uploadDirectory + filename + resizer.suffix + ext));
                    });
                }
                res.send("/files/" + filename + ext);
            });
        }
    });

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: RouteStore.delete,
        onValidation: async ({ res, isRelease }) => {
            if (isRelease) {
                return _permission_denied(res, deletionPermissionError);
            }
            await WebSocket.deleteFields();
            res.redirect(RouteStore.home);
        }
    });

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: RouteStore.deleteAll,
        onValidation: async ({ res, isRelease }) => {
            if (isRelease) {
                return _permission_denied(res, deletionPermissionError);
            }
            await WebSocket.deleteAll();
            res.redirect(RouteStore.home);
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
            const batched = BatchedArray.from<GooglePhotosUploadUtils.MediaInput>(media, { batchSize: 25 });
            const newMediaItems = await batched.batchedMapPatientInterval<NewMediaItem>(
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
                console.log(failed.map(({ reason, batch, index, url }) => `@${batch}.${index}: ${url} failed: ${reason}`).join('\n'));
            }

            return GooglePhotosUploadUtils.CreateMediaItems(token, newMediaItems, req.body.album).then(
                result => _success(res, { results: result.newMediaItemResults, failed }),
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
    const deletionPermissionError = "Cannot perform specialized delete outside of the development environment!";

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: "/deleteWithAux",
        onValidation: async ({ res, isRelease }) => {
            if (isRelease) {
                return _permission_denied(res, deletionPermissionError);
            }
            await Database.Auxiliary.DeleteAll();
            res.redirect(RouteStore.delete);
        }
    });

    router.addSupervisedRoute({
        method: Method.GET,
        subscription: "/deleteWithGoogleCredentials",
        onValidation: async ({ res, isRelease }) => {
            if (isRelease) {
                return _permission_denied(res, deletionPermissionError);
            }
            await Database.Auxiliary.GoogleAuthenticationToken.DeleteAll();
            res.redirect(RouteStore.delete);
        }
    });

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