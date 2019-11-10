require('dotenv').config();
import * as bodyParser from 'body-parser';
import { exec, ExecOptions } from 'child_process';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as session from 'express-session';
import * as expressValidator from 'express-validator';
import * as formidable from 'formidable';
import * as fs from 'fs';
import * as sharp from 'sharp';
import * as Pdfjs from 'pdfjs-dist';
const imageDataUri = require('image-data-uri');
import * as mobileDetect from 'mobile-detect';
import * as passport from 'passport';
import * as path from 'path';
import * as request from 'request';
import * as io from 'socket.io';
import { Socket } from 'socket.io';
import * as webpack from 'webpack';
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import { Utils } from '../Utils';
import { getForgot, getLogin, getLogout, getReset, getSignup, postForgot, postLogin, postReset, postSignup } from './authentication/controllers/user_controller';
import { DashUserModel } from './authentication/models/user_model';
import { Client } from './Client';
import { Database } from './database';
import { MessageStore, Transferable, Types, Diff, YoutubeQueryTypes as YoutubeQueryType, YoutubeQueryInput, RoomMessage } from "./Message";
import { RouteStore } from './RouteStore';
import v4 = require('uuid/v4');
const app = express();
const config = require('../../webpack.config');
import { createCanvas } from "canvas";
const compiler = webpack(config);
const port = 1050; // default port to listen
const serverPort = 4321;
import expressFlash = require('express-flash');
import flash = require('connect-flash');
import { Search } from './Search';
import * as Archiver from 'archiver';
var AdmZip = require('adm-zip');
import * as YoutubeApi from "./apis/youtube/youtubeApiSample";
import { Response } from 'express-serve-static-core';
import { GoogleApiServerUtils } from "./apis/google/GoogleApiServerUtils";
const MongoStore = require('connect-mongo')(session);
const mongoose = require('mongoose');
const probe = require("probe-image-size");
const pdf = require('pdf-parse');
var findInFiles = require('find-in-files');
import { GooglePhotosUploadUtils } from './apis/google/GooglePhotosUploadUtils';
import * as qs from 'query-string';
import { Opt } from '../new_fields/Doc';
import { DashUploadUtils } from './DashUploadUtils';
import { BatchedArray, TimeUnit } from 'array-batcher';
import { ParsedPDF } from "./PdfTypes";
import { reject } from 'bluebird';
import { ExifData } from 'exif';
import { Result } from '../client/northstar/model/idea/idea';
import RouteSubscriber from './RouteSubscriber';

const download = (url: string, dest: fs.PathLike) => request.get(url).pipe(fs.createWriteStream(dest));
let youtubeApiKey: string;
YoutubeApi.readApiKey((apiKey: string) => youtubeApiKey = apiKey);

const release = process.env.RELEASE === "true";
if (process.env.RELEASE === "true") {
    console.log("Running server in release mode");
} else {
    console.log("Running server in debug mode");
}
console.log(process.env.PWD);
let clientUtils = fs.readFileSync("./src/client/util/ClientUtils.ts.temp", "utf8");
clientUtils = `//AUTO-GENERATED FILE: DO NOT EDIT\n${clientUtils.replace('"mode"', String(release))}`;
fs.writeFileSync("./src/client/util/ClientUtils.ts", clientUtils, "utf8");

const mongoUrl = 'mongodb://localhost:27017/Dash';
mongoose.connection.readyState === 0 && mongoose.connect(mongoUrl);
mongoose.connection.on('connected', () => console.log("connected"));

// SESSION MANAGEMENT AND AUTHENTICATION MIDDLEWARE
// ORDER OF IMPORTS MATTERS

app.use(cookieParser());
app.use(session({
    secret: "64d6866242d3b5a5503c675b32c9605e4e90478e9b77bcf2bc",
    resave: true,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
    saveUninitialized: true,
    store: new MongoStore({ url: 'mongodb://localhost:27017/Dash' })
}));

app.use(flash());
app.use(expressFlash());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});

app.get("/hello", (req, res) => res.send("<p>Hello</p>"));

enum Method {
    GET,
    POST
}

export type ValidationHandler = (user: DashUserModel, req: express.Request, res: express.Response) => any | Promise<any>;
export type RejectionHandler = (req: express.Request, res: express.Response) => any | Promise<any>;
export type ErrorHandler = (req: express.Request, res: express.Response, error: any) => any | Promise<any>;

const LoginRedirect: RejectionHandler = (_req, res) => res.redirect(RouteStore.login);

export interface RouteInitializer {
    method: Method;
    subscribers: string | RouteSubscriber | (string | RouteSubscriber)[];
    onValidation: ValidationHandler;
    onRejection?: RejectionHandler;
    onError?: ErrorHandler;
}

const isSharedDocAccess = (target: string) => {
    const shared = qs.parse(qs.extract(target), { sort: false }).sharing === "true";
    const docAccess = target.startsWith("/doc/");
    return shared && docAccess;
};

/**
 * Please invoke this function when adding a new route to Dash's server.
 * It ensures that any requests leading to or containing user-sensitive information
 * does not execute unless Passport authentication detects a user logged in.
 * @param method whether or not the request is a GET or a POST
 * @param handler the action to invoke, recieving a DashUserModel and, as expected, the Express.Request and Express.Response
 * @param onRejection an optional callback invoked on return if no user is found to be logged in
 * @param subscribers the forward slash prepended path names (reference and add to RouteStore.ts) that will all invoke the given @param handler 
 */
function addSecureRoute(initializer: RouteInitializer) {
    const { method, subscribers, onValidation, onRejection, onError } = initializer;
    let abstracted = async (req: express.Request, res: express.Response) => {
        const { user, originalUrl: target } = req;
        if (user || isSharedDocAccess(target)) {
            try {
                await onValidation(user as any, req, res);
            } catch (e) {
                if (onError) {
                    onError(req, res, e);
                } else {
                    _error(res, `The server encountered an internal error handling ${target}.`, e);
                }
            }
        } else {
            req.session!.target = target;
            try {
                await (onRejection || LoginRedirect)(req, res);
            } catch (e) {
                if (onError) {
                    onError(req, res, e);
                } else {
                    _error(res, `The server encountered an internal error when rejecting ${target}.`, e);
                }
            }
        }
    };
    const subscribe = (subscriber: RouteSubscriber | string) => {
        let route: string;
        if (typeof subscriber === "string") {
            route = subscriber;
        } else {
            route = subscriber.build;
        }
        switch (method) {
            case Method.GET:
                app.get(route, abstracted);
                break;
            case Method.POST:
                app.post(route, abstracted);
                break;
        }
    };
    if (Array.isArray(subscribers)) {
        subscribers.forEach(subscribe);
    } else {
        subscribe(subscribers);
    }
}

// STATIC FILE SERVING
app.use(express.static(__dirname + RouteStore.public));
app.use(RouteStore.images, express.static(__dirname + RouteStore.public));

app.get("/pull", (req, res) =>
    exec('"C:\\Program Files\\Git\\git-bash.exe" -c "git pull"', (err, stdout, stderr) => {
        if (err) {
            res.send(err.message);
            return;
        }
        res.redirect("/");
    }));

app.get("/buxton", (req, res) => {
    let cwd = '../scraping/buxton';

    let onResolved = (stdout: string) => { console.log(stdout); res.redirect("/"); };
    let onRejected = (err: any) => { console.error(err.message); res.send(err); };
    let tryPython3 = () => command_line('python3 scraper.py', cwd).then(onResolved, onRejected);

    command_line('python scraper.py', cwd).then(onResolved, tryPython3);
});

const STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    EXECUTION_ERROR: 500,
    PERMISSION_DENIED: 403
};

const command_line = (command: string, fromDirectory?: string) => {
    return new Promise<string>((resolve, reject) => {
        let options: ExecOptions = {};
        if (fromDirectory) {
            options.cwd = path.join(__dirname, fromDirectory);
        }
        exec(command, options, (err, stdout) => err ? reject(err) : resolve(stdout));
    });
};

const read_text_file = (relativePath: string) => {
    let target = path.join(__dirname, relativePath);
    return new Promise<string>((resolve, reject) => {
        fs.readFile(target, (err, data) => err ? reject(err) : resolve(data.toString()));
    });
};

const write_text_file = (relativePath: string, contents: any) => {
    let target = path.join(__dirname, relativePath);
    return new Promise<void>((resolve, reject) => {
        fs.writeFile(target, contents, (err) => err ? reject(err) : resolve());
    });
};

app.get("/version", (req, res) => {
    exec('"C:\\Program Files\\Git\\bin\\git.exe" rev-parse HEAD', (err, stdout, stderr) => {
        if (err) {
            res.send(err.message);
            return;
        }
        res.send(stdout);
    });
});

// SEARCH
const solrURL = "http://localhost:8983/solr/#/dash";

// GETTERS

app.get("/textsearch", async (req, res) => {
    let q = req.query.q;
    if (q === undefined) {
        res.send([]);
        return;
    }
    let results = await findInFiles.find({ 'term': q, 'flags': 'ig' }, uploadDirectory + "text", ".txt$");
    let resObj: { ids: string[], numFound: number, lines: string[] } = { ids: [], numFound: 0, lines: [] };
    for (var result in results) {
        resObj.ids.push(path.basename(result, ".txt").replace(/upload_/, ""));
        resObj.lines.push(results[result].line);
        resObj.numFound++;
    }
    res.send(resObj);
});

app.get("/search", async (req, res) => {
    const solrQuery: any = {};
    ["q", "fq", "start", "rows", "hl", "hl.fl"].forEach(key => solrQuery[key] = req.query[key]);
    if (solrQuery.q === undefined) {
        res.send([]);
        return;
    }
    let results = await Search.Instance.search(solrQuery);
    res.send(results);
});

function msToTime(duration: number) {
    let milliseconds = Math.floor((duration % 1000) / 100),
        seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    let hoursS = (hours < 10) ? "0" + hours : hours;
    let minutesS = (minutes < 10) ? "0" + minutes : minutes;
    let secondsS = (seconds < 10) ? "0" + seconds : seconds;

    return hoursS + ":" + minutesS + ":" + secondsS + "." + milliseconds;
}

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
app.get("/serializeDoc/:docId", async (req, res) => {
    const { docs, files } = await getDocs(req.params.docId);
    res.send({ docs, files: Array.from(files) });
});

export type Hierarchy = { [id: string]: string | Hierarchy };
export type ZipMutator = (file: Archiver.Archiver) => void | Promise<void>;

addSecureRoute({
    method: Method.GET,
    subscribers: new RouteSubscriber(RouteStore.imageHierarchyExport).add('docId'),
    onValidation: async (_user, req, res) => {
        const id = req.params.docId;
        const hierarchy: Hierarchy = {};
        await targetedVisitorRecursive(id, hierarchy);
        BuildAndDispatchZip(res, async zip => {
            await hierarchyTraverserRecursive(zip, hierarchy);
        });
    }
});

const BuildAndDispatchZip = async (res: Response, mutator: ZipMutator): Promise<void> => {
    const zip = Archiver('zip');
    zip.pipe(res);
    await mutator(zip);
    return zip.finalize();
};

const targetedVisitorRecursive = async (seedId: string, hierarchy: Hierarchy): Promise<void> => {
    const local: Hierarchy = {};
    const { title, data } = await getData(seedId);
    const label = `${title} (${seedId})`;
    if (Array.isArray(data)) {
        hierarchy[label] = local;
        await Promise.all(data.map(proxy => targetedVisitorRecursive(proxy.fieldId, local)));
    } else {
        hierarchy[label + path.extname(data)] = data;
    }
};

const getData = async (seedId: string): Promise<{ data: string | any[], title: string }> => {
    return new Promise<{ data: string | any[], title: string }>((resolve, reject) => {
        Database.Instance.getDocument(seedId, async (result: any) => {
            const { data, proto, title } = result.fields;
            if (data) {
                if (data.url) {
                    resolve({ data: data.url, title });
                } else if (data.fields) {
                    resolve({ data: data.fields, title });
                } else {
                    reject();
                }
            }
            if (proto) {
                getData(proto.fieldId).then(resolve, reject);
            }
        });
    });
};

const hierarchyTraverserRecursive = async (file: Archiver.Archiver, hierarchy: Hierarchy, prefix = "Dash Export"): Promise<void> => {
    for (const key of Object.keys(hierarchy)) {
        const result = hierarchy[key];
        if (typeof result === "string") {
            let path: string;
            let matches: RegExpExecArray | null;
            if ((matches = /\:1050\/files\/(upload\_[\da-z]{32}.*)/g.exec(result)) !== null) {
                path = `${__dirname}/public/files/${matches[1]}`;
            } else {
                const information = await DashUploadUtils.UploadImage(result);
                path = information.mediaPaths[0];
            }
            file.file(path, { name: key, prefix });
        } else {
            await hierarchyTraverserRecursive(file, result, `${prefix}/${key}`);
        }
    }
};

app.get("/downloadId/:docId", async (req, res) => {
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
});

app.post("/uploadDoc", (req, res) => {
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
    form.parse(req, async (err, fields, files) => {
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
    });
});

app.get("/whosOnline", (req, res) => {
    let users: any = { active: {}, inactive: {} };
    const now = Date.now();

    for (const user in timeMap) {
        const time = timeMap[user];
        const key = ((now - time) / 1000) < (60 * 5) ? "active" : "inactive";
        users[key][user] = `Last active ${msToTime(now - time)} ago`;
    }

    res.send(users);
});
app.get("/thumbnail/:filename", (req, res) => {
    let filename = req.params.filename;
    let noExt = filename.substring(0, filename.length - ".png".length);
    let pagenumber = parseInt(noExt.split('-')[1]);
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
    });
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
addSecureRoute({
    method: Method.GET,
    subscribers: RouteStore.root,
    onValidation: (_user, _req, res) => res.redirect(RouteStore.home)
});

addSecureRoute({
    method: Method.GET,
    subscribers: RouteStore.getUsers,
    onValidation: async (_user, _req, res) => {
        const cursor = await Database.Instance.query({}, { email: 1, userDocumentId: 1 }, "users");
        const results = await cursor.toArray();
        res.send(results.map(user => ({ email: user.email, userDocumentId: user.userDocumentId })));
    },
});

addSecureRoute({
    method: Method.GET,
    subscribers: [RouteStore.home, RouteStore.openDocumentWithId],
    onValidation: (_user, req, res) => {
        let detector = new mobileDetect(req.headers['user-agent'] || "");
        let filename = detector.mobile() !== null ? 'mobile/image.html' : 'index.html';
        res.sendFile(path.join(__dirname, '../../deploy/' + filename));
    },
});

addSecureRoute({
    method: Method.GET,
    subscribers: RouteStore.getUserDocumentId,
    onValidation: (user, _req, res) => res.send(user.userDocumentId),
    onRejection: (_req, res) => res.send(undefined)
});

addSecureRoute({
    method: Method.GET,
    subscribers: RouteStore.getCurrUser,
    onValidation: (user, _req, res) => { res.send(JSON.stringify(user)); },
    onRejection: (_req, res) => res.send(JSON.stringify({ id: "__guest__", email: "" }))
});

const ServicesApiKeyMap = new Map<string, string | undefined>([
    ["face", process.env.FACE],
    ["vision", process.env.VISION],
    ["handwriting", process.env.HANDWRITING]
]);

addSecureRoute({
    method: Method.GET,
    subscribers: new RouteSubscriber(RouteStore.cognitiveServices).add('requestedservice'),
    onValidation: (_user, req, res) => {
        let service = req.params.requestedservice;
        res.send(ServicesApiKeyMap.get(service));
    }
});

class NodeCanvasFactory {
    create = (width: number, height: number) => {
        var canvas = createCanvas(width, height);
        var context = canvas.getContext('2d');
        return {
            canvas: canvas,
            context: context,
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

const pngTypes = [".png", ".PNG"];
const jpgTypes = [".jpg", ".JPG", ".jpeg", ".JPEG"];
const uploadDirectory = __dirname + "/public/files/";
const pdfDirectory = uploadDirectory + "text";
DashUploadUtils.createIfNotExists(pdfDirectory);

interface ImageFileResponse {
    name: string;
    path: string;
    type: string;
    exif: Opt<DashUploadUtils.EnrichedExifData>;
}

addSecureRoute({
    method: Method.POST,
    subscribers: RouteStore.upload,
    onValidation: (_user, req, res) => {
        let form = new formidable.IncomingForm();
        form.uploadDir = uploadDirectory;
        form.keepExtensions = true;
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
                } else if (type.indexOf("audio") !== -1) {
                    // nothing to be done yet-- although transcribing the audio a la pdfs would make sense.
                } else {
                    uploadInformation = await DashUploadUtils.UploadImage(uploadDirectory + filename, filename);
                }
                const exif = uploadInformation ? uploadInformation.exifData : undefined;
                results.push({ name, type, path: `/files/${filename}`, exif });

            }
            _success(res, results);
        });
    }
});

addSecureRoute({
    method: Method.POST,
    subscribers: RouteStore.inspectImage,
    onValidation: async (_user, req, res) => {
        const { source } = req.body;
        if (typeof source === "string") {
            const uploadInformation = await DashUploadUtils.UploadImage(source);
            return res.send(await DashUploadUtils.InspectImage(uploadInformation.mediaPaths[0]));
        }
        res.send({});
    }
});

addSecureRoute({
    method: Method.POST,
    subscribers: RouteStore.dataUriToImage,
    onValidation: (_user, req, res) => {
        const uri = req.body.uri;
        const filename = req.body.name;
        if (!uri || !filename) {
            res.status(401).send("incorrect parameters specified");
            return;
        }
        imageDataUri.outputFile(uri, uploadDirectory + filename).then((savedName: string) => {
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

// AUTHENTICATION

// Sign Up
app.get(RouteStore.signup, getSignup);
app.post(RouteStore.signup, postSignup);

// Log In
app.get(RouteStore.login, getLogin);
app.post(RouteStore.login, postLogin);

// Log Out
app.get(RouteStore.logout, getLogout);

// FORGOT PASSWORD EMAIL HANDLING
app.get(RouteStore.forgot, getForgot);
app.post(RouteStore.forgot, postForgot);

// RESET PASSWORD EMAIL HANDLING
app.get(RouteStore.reset, getReset);
app.post(RouteStore.reset, postReset);

const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
app.use(RouteStore.corsProxy, (req, res) => {
    req.pipe(request(decodeURIComponent(req.url.substring(1)))).on("response", res => {
        const headers = Object.keys(res.headers);
        headers.forEach(headerName => {
            const header = res.headers[headerName];
            if (Array.isArray(header)) {
                res.headers[headerName] = header.filter(h => !headerCharRegex.test(h));
            } else if (header) {
                if (headerCharRegex.test(header as any)) {
                    delete res.headers[headerName];
                }
            }
        });
    }).pipe(res);
});

addSecureRoute({
    method: Method.GET,
    subscribers: RouteStore.delete,
    onValidation: (_user, _req, res) => {
        if (release) {
            return _permission_denied(res, deletionPermissionError);
        }
        deleteFields().then(() => res.redirect(RouteStore.home));
    }
});

addSecureRoute({
    method: Method.GET,
    subscribers: RouteStore.deleteAll,
    onValidation: (_user, _req, res) => {
        if (release) {
            return _permission_denied(res, deletionPermissionError);
        }
        deleteAll().then(() => res.redirect(RouteStore.home));
    }
});

app.use(wdm(compiler, { publicPath: config.output.publicPath }));

app.use(whm(compiler));

// start the Express server
app.listen(port, () =>
    console.log(`server started at http://localhost:${port}`));

const server = io();
interface Map {
    [key: string]: Client;
}
let clients: Map = {};

let socketMap = new Map<SocketIO.Socket, string>();
let timeMap: { [id: string]: number } = {};

server.on("connection", function (socket: Socket) {
    socket.use((packet, next) => {
        let id = socketMap.get(socket);
        if (id) {
            timeMap[id] = Date.now();
        }
        next();
    });

    Utils.Emit(socket, MessageStore.Foo, "handshooken");

    Utils.AddServerHandler(socket, MessageStore.Bar, guid => barReceived(socket, guid));
    Utils.AddServerHandler(socket, MessageStore.SetField, (args) => setField(socket, args));
    Utils.AddServerHandlerCallback(socket, MessageStore.GetField, getField);
    Utils.AddServerHandlerCallback(socket, MessageStore.GetFields, getFields);
    if (!release) {
        Utils.AddServerHandler(socket, MessageStore.DeleteAll, deleteFields);
    }

    Utils.AddServerHandler(socket, MessageStore.CreateField, CreateField);
    Utils.AddServerHandlerCallback(socket, MessageStore.YoutubeApiQuery, HandleYoutubeQuery);
    Utils.AddServerHandler(socket, MessageStore.UpdateField, diff => UpdateField(socket, diff));
    Utils.AddServerHandler(socket, MessageStore.DeleteField, id => DeleteField(socket, id));
    Utils.AddServerHandler(socket, MessageStore.DeleteFields, ids => DeleteFields(socket, ids));
    Utils.AddServerHandlerCallback(socket, MessageStore.GetRefField, GetRefField);
    Utils.AddServerHandlerCallback(socket, MessageStore.GetRefFields, GetRefFields);
    Utils.AddServerHandler(socket, MessageStore.NotifyRoommates, message => HandleRoommateNotification(socket, message));
    Utils.AddServerHandler(socket, MessageStore.HangUpCall, message => HandleHangUp(socket, message));
    Utils.AddRoomHandler(socket, "create or join", HandleCreateOrJoin);




});

async function deleteFields() {
    await Database.Instance.deleteAll();
    await Search.Instance.clear();
    await Database.Instance.deleteAll('newDocuments');
}

async function deleteAll() {
    await Database.Instance.deleteAll();
    await Database.Instance.deleteAll('newDocuments');
    await Database.Instance.deleteAll('sessions');
    await Database.Instance.deleteAll('users');
    await Search.Instance.clear();
}

function barReceived(socket: SocketIO.Socket, guid: string) {
    clients[guid] = new Client(guid.toString());
    console.log(`User ${guid} has connected`);
    socketMap.set(socket, guid);
}

function getField([id, callback]: [string, (result?: Transferable) => void]) {
    Database.Instance.getDocument(id, (result?: Transferable) =>
        callback(result ? result : undefined));
}

function getFields([ids, callback]: [string[], (result: Transferable[]) => void]) {
    Database.Instance.getDocuments(ids, callback);
}

function setField(socket: Socket, newValue: Transferable) {
    Database.Instance.update(newValue.id, newValue, () =>
        socket.broadcast.emit(MessageStore.SetField.Message, newValue));
    if (newValue.type === Types.Text) {
        Search.Instance.updateDocument({ id: newValue.id, data: (newValue as any).data });
        console.log("set field");
        console.log("checking in");
    }
}

function GetRefField([id, callback]: [string, (result?: Transferable) => void]) {
    Database.Instance.getDocument(id, callback, "newDocuments");
}

function GetRefFields([ids, callback]: [string[], (result?: Transferable[]) => void]) {
    Database.Instance.getDocuments(ids, callback, "newDocuments");
}

function HandleYoutubeQuery([query, callback]: [YoutubeQueryInput, (result?: any[]) => void]) {
    switch (query.type) {
        case YoutubeQueryType.Channels:
            YoutubeApi.authorizedGetChannel(youtubeApiKey);
            break;
        case YoutubeQueryType.SearchVideo:
            YoutubeApi.authorizedGetVideos(youtubeApiKey, query.userInput, callback);
        case YoutubeQueryType.VideoDetails:
            YoutubeApi.authorizedGetVideoDetails(youtubeApiKey, query.videoIds, callback);
    }
}

function HandleRoommateNotification(socket: Socket, message: RoomMessage) {
    //socket.broadcast.emit('message', message);
    console.log("The room that sent this: ", message.room, " and message is : ", message.message);
    server.sockets.in(message.room).emit('message', message);

}

function HandleCreateOrJoin(socket: io.Socket, room: string) {
    console.log("Received request to create or join room " + room);


    let clientsInRoom = server.sockets.adapter.rooms[room];
    let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    console.log('Room ' + room + ' now has ' + numClients + ' client(s)');


    if (numClients === 0) {
        socket.join(room);
        console.log('Client ID ' + socket.id + ' created room ' + room);
        socket.emit('created', room, socket.id);

    } else if (numClients === 1) {
        console.log('Client ID ' + socket.id + ' joined room ' + room);
        server.sockets.in(room).emit('join', room);
        socket.join(room);
        socket.emit('joined', room, socket.id);
        server.sockets.in(room).emit('ready');

    } else {
        socket.emit('full', room);
    }





}

function HandleHangUp(socket: io.Socket, message: string) {
    console.log("Receive bye from someone");
}

const credentialsPath = path.join(__dirname, "./credentials/google_docs_credentials.json");

const EndpointHandlerMap = new Map<GoogleApiServerUtils.Action, GoogleApiServerUtils.ApiRouter>([
    ["create", (api, params) => api.create(params)],
    ["retrieve", (api, params) => api.get(params)],
    ["update", (api, params) => api.batchUpdate(params)],
]);

app.post(RouteStore.googleDocs + "/:sector/:action", (req, res) => {
    let sector: GoogleApiServerUtils.Service = req.params.sector as GoogleApiServerUtils.Service;
    let action: GoogleApiServerUtils.Action = req.params.action as GoogleApiServerUtils.Action;
    GoogleApiServerUtils.GetEndpoint(GoogleApiServerUtils.Service[sector], { credentialsPath, userId: req.headers.userId as string }).then(endpoint => {
        let handler = EndpointHandlerMap.get(action);
        if (endpoint && handler) {
            let execute = handler(endpoint, req.body).then(
                response => res.send(response.data),
                rejection => res.send(rejection)
            );
            execute.catch(exception => res.send(exception));
            return;
        }
        res.send(undefined);
    });
});

addSecureRoute({
    method: Method.GET,
    subscribers: RouteStore.readGoogleAccessToken,
    onValidation: async (user, _req, res) => {
        const userId = user.id;
        const token = await Database.Auxiliary.GoogleAuthenticationToken.Fetch(userId);
        const information = { credentialsPath, userId };
        if (!token) {
            return res.send(await GoogleApiServerUtils.GenerateAuthenticationUrl(information));
        }
        GoogleApiServerUtils.RetrieveAccessToken(information).then(token => res.send(token));
    }
});

addSecureRoute({
    method: Method.POST,
    subscribers: RouteStore.writeGoogleAccessToken,
    onValidation: async (user, req, res) => {
        const userId = user.id;
        const information = { credentialsPath, userId };
        res.send(await GoogleApiServerUtils.ProcessClientSideCode(information, req.body.authenticationCode));
    }
});

const tokenError = "Unable to successfully upload bytes for all images!";
const mediaError = "Unable to convert all uploaded bytes to media items!";
const userIdError = "Unable to parse the identification of the user!";

export interface NewMediaItem {
    description: string;
    simpleMediaItem: {
        uploadToken: string;
    };
}

addSecureRoute({
    method: Method.POST,
    subscribers: RouteStore.googlePhotosMediaUpload,
    onValidation: async (user, req, res) => {
        const { media } = req.body;
        const userId = user.id;
        if (!userId) {
            return _error(res, userIdError);
        }

        await GooglePhotosUploadUtils.initialize({ credentialsPath, userId });

        let failed: number[] = [];

        const batched = BatchedArray.from<GooglePhotosUploadUtils.MediaInput>(media, { batchSize: 25 });
        const newMediaItems = await batched.batchedMapPatientInterval<NewMediaItem>(
            { magnitude: 100, unit: TimeUnit.Milliseconds },
            async (batch, collector) => {
                for (let index = 0; index < batch.length; index++) {
                    const { url, description } = batch[index];
                    const uploadToken = await GooglePhotosUploadUtils.DispatchGooglePhotosUpload(url);
                    if (!uploadToken) {
                        failed.push(index);
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
        }

        GooglePhotosUploadUtils.CreateMediaItems(newMediaItems, req.body.album).then(
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
const deletionPermissionError = "Cannot perform specialized delete outside of the development environment!";

app.get("/deleteWithAux", async (_req, res) => {
    if (release) {
        return _permission_denied(res, deletionPermissionError);
    }
    await Database.Auxiliary.DeleteAll();
    res.redirect(RouteStore.delete);
});

app.get("/deleteWithGoogleCredentials", async (req, res) => {
    if (release) {
        return _permission_denied(res, deletionPermissionError);
    }
    await Database.Auxiliary.GoogleAuthenticationToken.DeleteAll();
    res.redirect(RouteStore.delete);
});

const UploadError = (count: number) => `Unable to upload ${count} images to Dash's server`;
app.post(RouteStore.googlePhotosMediaDownload, async (req, res) => {
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
});

const _error = (res: Response, message: string, error?: any) => {
    res.statusMessage = message;
    res.status(STATUS.EXECUTION_ERROR).send(error);
};

const _success = (res: Response, body: any) => {
    res.status(STATUS.OK).send(body);
};

const _invalid = (res: Response, message: string) => {
    res.statusMessage = message;
    res.status(STATUS.BAD_REQUEST).send();
};

const _permission_denied = (res: Response, message: string) => {
    res.statusMessage = message;
    res.status(STATUS.BAD_REQUEST).send("Permission Denied!");
};

const suffixMap: { [type: string]: (string | [string, string | ((json: any) => any)]) } = {
    "number": "_n",
    "string": "_t",
    "boolean": "_b",
    "image": ["_t", "url"],
    "video": ["_t", "url"],
    "pdf": ["_t", "url"],
    "audio": ["_t", "url"],
    "web": ["_t", "url"],
    "date": ["_d", value => new Date(value.date).toISOString()],
    "proxy": ["_i", "fieldId"],
    "list": ["_l", list => {
        const results = [];
        for (const value of list.fields) {
            const term = ToSearchTerm(value);
            if (term) {
                results.push(term.value);
            }
        }
        return results.length ? results : null;
    }]
};

function ToSearchTerm(val: any): { suffix: string, value: any } | undefined {
    if (val === null || val === undefined) {
        return;
    }
    const type = val.__type || typeof val;
    let suffix = suffixMap[type];
    if (!suffix) {
        return;
    }

    if (Array.isArray(suffix)) {
        const accessor = suffix[1];
        if (typeof accessor === "function") {
            val = accessor(val);
        } else {
            val = val[accessor];
        }
        suffix = suffix[0];
    }

    return { suffix, value: val };
}

function getSuffix(value: string | [string, any]): string {
    return typeof value === "string" ? value : value[0];
}

function UpdateField(socket: Socket, diff: Diff) {
    Database.Instance.update(diff.id, diff.diff,
        () => socket.broadcast.emit(MessageStore.UpdateField.Message, diff), false, "newDocuments");
    const docfield = diff.diff.$set;
    if (!docfield) {
        return;
    }
    const update: any = { id: diff.id };
    let dynfield = false;
    for (let key in docfield) {
        if (!key.startsWith("fields.")) continue;
        dynfield = true;
        let val = docfield[key];
        key = key.substring(7);
        Object.values(suffixMap).forEach(suf => update[key + getSuffix(suf)] = { set: null });
        let term = ToSearchTerm(val);
        if (term !== undefined) {
            let { suffix, value } = term;
            update[key + suffix] = { set: value };
        }
    }
    if (dynfield) {
        Search.Instance.updateDocument(update);
    }
}

function DeleteField(socket: Socket, id: string) {
    Database.Instance.delete({ _id: id }, "newDocuments").then(() => {
        socket.broadcast.emit(MessageStore.DeleteField.Message, id);
    });

    Search.Instance.deleteDocuments([id]);
}

function DeleteFields(socket: Socket, ids: string[]) {
    Database.Instance.delete({ _id: { $in: ids } }, "newDocuments").then(() => {
        socket.broadcast.emit(MessageStore.DeleteFields.Message, ids);
    });

    Search.Instance.deleteDocuments(ids);

}

function CreateField(newValue: any) {
    Database.Instance.insert(newValue, "newDocuments");
}

server.listen(serverPort);
console.log(`listening on port ${serverPort}`);

