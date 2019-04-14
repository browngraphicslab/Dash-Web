import * as bodyParser from 'body-parser';
import { exec } from 'child_process';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as session from 'express-session';
import * as expressValidator from 'express-validator';
import * as formidable from 'formidable';
import * as fs from 'fs';
import * as mobileDetect from 'mobile-detect';
import { ObservableMap } from 'mobx';
import * as passport from 'passport';
import * as path from 'path';
import * as request from 'request';
import * as io from 'socket.io';
import { Socket } from 'socket.io';
import * as webpack from 'webpack';
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import { Field, FieldId } from '../fields/Field';
import { Utils } from '../Utils';
import { getForgot, getLogin, getLogout, getReset, getSignup, postForgot, postLogin, postReset, postSignup } from './authentication/controllers/user_controller';
import { DashUserModel } from './authentication/models/user_model';
import { Client } from './Client';
import { Database } from './database';
import { MessageStore, Transferable, Types } from "./Message";
import { RouteStore } from './RouteStore';
const app = express();
const config = require('../../webpack.config');
const compiler = webpack(config);
const port = 1050; // default port to listen
const serverPort = 4321;
import expressFlash = require('express-flash');
import flash = require('connect-flash');
import c = require("crypto");
import { Search } from './Search';
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
app.use(bodyParser.json());
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

// SETTERS

addSecureRoute(
    Method.POST,
    (user, res, req) => {
        let form = new formidable.IncomingForm();
        form.uploadDir = __dirname + "/public/files/";
        form.keepExtensions = true;
        // let path = req.body.path;
        console.log("upload");
        form.parse(req, (err, fields, files) => {
            console.log("parsing");
            let names: string[] = [];
            for (const name in files) {
                names.push(`/files/` + path.basename(files[name].path));
            }
            res.send(names);
        });
    },
    undefined,
    RouteStore.upload
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
});

function deleteFields() {
    return Database.Instance.deleteAll();
}

async function deleteAll() {
    await Database.Instance.deleteAll();
    await Database.Instance.deleteAll('sessions');
    await Database.Instance.deleteAll('users');
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
    }
}

server.listen(serverPort);
console.log(`listening on port ${serverPort}`);