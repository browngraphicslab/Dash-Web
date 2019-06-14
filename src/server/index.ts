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
import { MessageStore, Transferable, Types, Diff } from "./Message";
import { RouteStore } from './RouteStore';
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
const MongoStore = require('connect-mongo')(session);
const mongoose = require('mongoose');

const download = (url: string, dest: fs.PathLike) => request.get(url).pipe(fs.createWriteStream(dest));

const mongoUrl = 'mongodb://localhost:27017/Dash';
mongoose.connect(mongoUrl);
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
    onRejection: (res: express.Response) => any = (res) => res.redirect(RouteStore.logout),
    ...subscribers: string[]
) {
    let abstracted = (req: express.Request, res: express.Response) => {
        if (req.user) {
            handler(req.user, res, req);
        } else {
            onRejection(res);
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

// SEARCH

// GETTERS

app.get("/search", async (req, res) => {
    let query = req.query.query || "hello";
    let results = await Search.Instance.search(query);
    res.send(results);
});

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
                else if (pdfTypes.includes(ext)) {
                    Pdfjs.getDocument(uploadDir + file).promise
                        .then((pdf: Pdfjs.PDFDocumentProxy) => {
                            let numPages = pdf.numPages;
                            let factory = new NodeCanvasFactory();
                            for (let pageNum = 0; pageNum < numPages; pageNum++) {
                                console.log(pageNum);
                                pdf.getPage(pageNum + 1).then((page: Pdfjs.PDFPageProxy) => {
                                    console.log("reading " + pageNum);
                                    let viewport = page.getViewport(1);
                                    let canvasAndContext = factory.create(viewport.width, viewport.height);
                                    let renderContext = {
                                        canvasContext: canvasAndContext.context,
                                        viewport: viewport,
                                        canvasFactory: factory
                                    }
                                    console.log("read " + pageNum);

                                    page.render(renderContext).promise
                                        .then(() => {
                                            console.log("saving " + pageNum);
                                            let stream = canvasAndContext.canvas.createPNGStream();
                                            let out = fs.createWriteStream(uploadDir + file.substring(0, file.length - ext.length) + `-${pageNum + 1}.PNG`);
                                            stream.pipe(out);
                                            out.on("finish", () => console.log(`Success! Saved to ${uploadDir + file.substring(0, file.length - ext.length) + `-${pageNum + 1}.PNG`}`));
                                        }, (reason: string) => {
                                            console.error(reason + ` ${pageNum}`);
                                        });
                                });
                            }
                        });
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

app.use(RouteStore.corsProxy, (req, res) =>
    req.pipe(request(req.url.substring(1))).pipe(res));

app.get(RouteStore.delete, (req, res) =>
    deleteFields().then(() => res.redirect(RouteStore.home)));

app.get(RouteStore.deleteAll, (req, res) =>
    deleteAll().then(() => res.redirect(RouteStore.home)));

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

server.on("connection", function (socket: Socket) {
    console.log("a user has connected");

    Utils.Emit(socket, MessageStore.Foo, "handshooken");

    Utils.AddServerHandler(socket, MessageStore.Bar, barReceived);
    Utils.AddServerHandler(socket, MessageStore.SetField, (args) => setField(socket, args));
    Utils.AddServerHandlerCallback(socket, MessageStore.GetField, getField);
    Utils.AddServerHandlerCallback(socket, MessageStore.GetFields, getFields);
    Utils.AddServerHandler(socket, MessageStore.DeleteAll, deleteFields);

    Utils.AddServerHandler(socket, MessageStore.CreateField, CreateField);
    Utils.AddServerHandler(socket, MessageStore.UpdateField, diff => UpdateField(socket, diff));
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

function barReceived(guid: String) {
    clients[guid.toString()] = new Client(guid.toString());
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


const suffixMap: { [type: string]: (string | [string, string | ((json: any) => any)]) } = {
    "number": "_n",
    "string": "_t",
    // "boolean": "_b",
    // "image": ["_t", "url"],
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

function CreateField(newValue: any) {
    Database.Instance.insert(newValue, "newDocuments");
}

server.listen(serverPort);
console.log(`listening on port ${serverPort}`);