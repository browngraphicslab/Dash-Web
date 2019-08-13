require('dotenv').config();
import * as bodyParser from 'body-parser';
import { exec } from 'child_process';
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
import * as rp from 'request-promise';
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
import { MessageStore, Transferable, Types, Diff, YoutubeQueryTypes as YoutubeQueryType, YoutubeQueryInput } from "./Message";
import { RouteStore } from './RouteStore';
import v4 = require('uuid/v4');
const app = express();
const config = require('../../webpack.config');
import { createCanvas, loadImage, Canvas } from "canvas";
const compiler = webpack(config);
const port = 1050; // default port to listen
const serverPort = 4321;
import expressFlash = require('express-flash');
import flash = require('connect-flash');
import c = require("crypto");
import { Search } from './Search';
import { debug } from 'util';
import _ = require('lodash');
import * as Archiver from 'archiver';
import * as AdmZip from 'adm-zip';
import * as YoutubeApi from './youtubeApi/youtubeApiSample.js';
import { Response } from 'express-serve-static-core';
import { DocComponent } from '../client/views/DocComponent';
const MongoStore = require('connect-mongo')(session);
const mongoose = require('mongoose');
const probe = require("probe-image-size");
var SolrNode = require('solr-node');
var shell = require('shelljs');

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

/**
 * Please invoke this function when adding a new route to Dash's server.
 * It ensures that any requests leading to or containing user-sensitive information
 * does not execute unless Passport authentication detects a user logged in.
 * @param method whether or not the request is a GET or a POST
 * @param handler the action to invoke, recieving a DashUserModel and, as expected, the Express.Request and Express.Response
 * @param onRejection an optional callback invoked on return if no user is found to be logged in
 * @param subscribers the forward slash prepended path names (reference and add to RouteStore.ts) that will all invoke the given @param handler 
 */
function addSecureRoute(method: Method,
    handler: (user: DashUserModel, res: express.Response, req: express.Request) => void,
    onRejection: (res: express.Response, req: express.Request) => any = res => res.redirect(RouteStore.login),
    ...subscribers: string[]
) {
    let abstracted = (req: express.Request, res: express.Response) => {
        if (req.user) {
            handler(req.user, res, req);
        } else {
            req.session!.target = req.originalUrl;
            onRejection(res, req);
        }
    };
    subscribers.forEach(route => {
        switch (method) {
            case Method.GET:
                app.get(route, abstracted);
                break;
            case Method.POST:
                app.post(route, abstracted);
                break;
        }
    });
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
                    zip.extractEntryTo(entry.entryName, __dirname + RouteStore.public, true, false);
                    dirname = "/" + dirname;

                    fs.createReadStream(__dirname + RouteStore.public + dirname + basename + extname).pipe(fs.createWriteStream(__dirname + RouteStore.public + dirname + basename + "_o" + extname));
                    fs.createReadStream(__dirname + RouteStore.public + dirname + basename + extname).pipe(fs.createWriteStream(__dirname + RouteStore.public + dirname + basename + "_s" + extname));
                    fs.createReadStream(__dirname + RouteStore.public + dirname + basename + extname).pipe(fs.createWriteStream(__dirname + RouteStore.public + dirname + basename + "_m" + extname));
                    fs.createReadStream(__dirname + RouteStore.public + dirname + basename + extname).pipe(fs.createWriteStream(__dirname + RouteStore.public + dirname + basename + "_l" + extname));
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
    fs.exists(uploadDir + filename, (exists: boolean) => {
        console.log(`${uploadDir + filename} ${exists ? "exists" : "does not exist"}`);
        if (exists) {
            let input = fs.createReadStream(uploadDir + filename);
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
            LoadPage(uploadDir + filename.substring(0, filename.length - noExt.split('-')[1].length - ".PNG".length - 1) + ".pdf", pagenumber, res);
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
                let viewport = page.getViewport(1);
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

// anyone attempting to navigate to localhost at this port will
// first have to login
addSecureRoute(
    Method.GET,
    (user, res) => res.redirect(RouteStore.home),
    undefined,
    RouteStore.root
);

addSecureRoute(
    Method.GET,
    async (_, res) => {
        const cursor = await Database.Instance.query({}, { email: 1, userDocumentId: 1 }, "users");
        const results = await cursor.toArray();
        res.send(results.map(user => ({ email: user.email, userDocumentId: user.userDocumentId })));
    },
    undefined,
    RouteStore.getUsers
);

addSecureRoute(
    Method.GET,
    (user, res, req) => {
        let detector = new mobileDetect(req.headers['user-agent'] || "");
        let filename = detector.mobile() !== null ? 'mobile/image.html' : 'index.html';
        res.sendFile(path.join(__dirname, '../../deploy/' + filename));
    },
    undefined,
    RouteStore.home,
    RouteStore.openDocumentWithId
);

addSecureRoute(
    Method.GET,
    (user, res) => res.send(user.userDocumentId || ""),
    undefined,
    RouteStore.getUserDocumentId,
);

addSecureRoute(
    Method.GET,
    (user, res) => res.send(JSON.stringify({ id: user.id, email: user.email })),
    undefined,
    RouteStore.getCurrUser
);

const ServicesApiKeyMap = new Map<string, string | undefined>([
    ["face", process.env.FACE],
    ["vision", process.env.VISION],
    ["handwriting", process.env.HANDWRITING],
    ["text", process.env.TEXT]
]);

addSecureRoute(Method.GET, (user, res, req) => {
    let service = req.params.requestedservice;
    res.send(ServicesApiKeyMap.get(service));
}, undefined, `${RouteStore.cognitiveServices}/:requestedservice`);

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
const pdfTypes = [".pdf", ".PDF"];
const jpgTypes = [".jpg", ".JPG", ".jpeg", ".JPEG"];
const uploadDir = __dirname + "/public/files/";
// SETTERS
app.post(
    RouteStore.upload,
    (req, res) => {
        let form = new formidable.IncomingForm();
        form.uploadDir = uploadDir;
        form.keepExtensions = true;
        // let path = req.body.path;
        console.log("upload");
        form.parse(req, (err, fields, files) => {
            console.log("parsing");
            let names: string[] = [];
            for (const name in files) {
                const file = path.basename(files[name].path);
                const ext = path.extname(file);
                let resizers = [
                    { resizer: sharp().rotate(), suffix: "_o" },
                    { resizer: sharp().resize(100, undefined, { withoutEnlargement: true }).rotate(), suffix: "_s" },
                    { resizer: sharp().resize(400, undefined, { withoutEnlargement: true }).rotate(), suffix: "_m" },
                    { resizer: sharp().resize(900, undefined, { withoutEnlargement: true }).rotate(), suffix: "_l" },
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
                        fs.createReadStream(uploadDir + file).pipe(resizer.resizer).pipe(fs.createWriteStream(uploadDir + file.substring(0, file.length - ext.length) + resizer.suffix + ext));
                    });
                }
                names.push(`/files/` + file);
            }
            res.send(names);
        });
    }
);

addSecureRoute(
    Method.POST,
    (user, res, req) => {
        const uri = req.body.uri;
        const filename = req.body.name;
        if (!uri || !filename) {
            res.status(401).send("incorrect parameters specified");
            return;
        }
        imageDataUri.outputFile(uri, uploadDir + filename).then((savedName: string) => {
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
                    fs.createReadStream(savedName).pipe(resizer.resizer).pipe(fs.createWriteStream(uploadDir + filename + resizer.suffix + ext));
                });
            }
            res.send("/files/" + filename + ext);
        });
    },
    undefined,
    RouteStore.dataUriToImage
);
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

app.get(RouteStore.delete, (req, res) => {
    if (release) {
        res.send("no");
        return;
    }
    deleteFields().then(() => res.redirect(RouteStore.home));
});

app.get(RouteStore.deleteAll, (req, res) => {
    if (release) {
        res.send("no");
        return;
    }
    deleteAll().then(() => res.redirect(RouteStore.home));
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

