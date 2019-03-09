import * as express from 'express'
const app = express()
import * as webpack from 'webpack'
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import * as passport from 'passport';
import { MessageStore, Message, SetFieldArgs, GetFieldArgs, Transferable } from "./Message";
import { Client } from './Client';
import { Socket } from 'socket.io';
import { Utils } from '../Utils';
import { ObservableMap } from 'mobx';
import { FieldId, Field } from '../fields/Field';
import { Database } from './database';
import { ServerUtils } from './ServerUtil';
import { ObjectID } from 'mongodb';
import * as bcrypt from "bcrypt-nodejs";
import { Document } from '../fields/Document';
import * as io from 'socket.io'
import * as passportConfig from './authentication/config/passport';
import { getLogin, postLogin, getSignup, postSignup, getLogout, getEntry, postReset, getForgot, postForgot, getReset } from './authentication/controllers/user_controller';
const config = require('../../webpack.config');
const compiler = webpack(config);
const port = 1050; // default port to listen
const serverPort = 1234;
import * as expressValidator from 'express-validator';
import expressFlash = require('express-flash');
import flash = require('connect-flash');
import * as bodyParser from 'body-parser';
import * as session from 'express-session';
// import cookieSession = require('cookie-session');
import * as cookieParser from 'cookie-parser';
import c = require("crypto");
const MongoStore = require('connect-mongo')(session);
const mongoose = require('mongoose');
import { performance } from 'perf_hooks'
import * as path from 'path'
import User, { DashUserModel } from './authentication/models/user_model';
import * as fs from 'fs';
import * as request from 'request'

const download = (url: string, dest: fs.PathLike) => {
    request.get(url).pipe(fs.createWriteStream(dest));
}

const mongoUrl = 'mongodb://localhost:27017/Dash';
mongoose.connect(mongoUrl)
mongoose.connection.on('connected', function () {
    console.log("connected");
})

// SESSION MANAGEMENT AND AUTHENTICATION MIDDLEWARE
// ORDER OF IMPORTS MATTERS

app.use(cookieParser(`${c.randomBytes(64)}`));
app.use(session({
    secret: `${c.randomBytes(64)}`,
    resave: true,
    cookie: { maxAge: 7 * 24 * 60 * 60 },
    saveUninitialized: true,
    store: new MongoStore({
        url: 'mongodb://localhost:27017/Dash'
    })
}));
// app.use(cookieSession({
//     name: 'authentication',
//     keys: [`${c.randomBytes(8)}`, `${c.randomBytes(8)}`, `${c.randomBytes(8)}`],
//     maxAge: 7 * 24 * 60 * 60 * 1000
// }));
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

// AUTHENTICATION ROUTING

enum Method {
    Get,
    Post
}

function addSecureRoute(method: Method,
    route: string,
    handler: (user: DashUserModel, req: express.Request, res: express.Response) => void,
    nope: (res: express.Response) => any) {
    route = "/" + route;
    switch (method) {
        case Method.Get:
            app.get(route, (req, res) => {
                const dashUser: DashUserModel = req.user;
                if (!dashUser) return nope(res);
                handler(dashUser, req, res);
            });
            break;
        case Method.Post:
            app.post(route, (req, res) => {
                const dashUser: DashUserModel = req.user;
                if (!dashUser) return nope(res);
                handler(dashUser, req, res);
            });
            break;
    }
}

// ***
// Look for the definitions of these get and post
// functions in the exports of user.ts

addSecureRoute(Method.Get, "home", (user, req, res) => {
    res.sendFile(path.join(__dirname, '../../deploy/index.html'));
}, res => res.redirect("/login"))

addSecureRoute(Method.Get, "getActiveWorkspaceId", (user, req, res) => {
    res.send(user.activeWorkspaceId || "");
}, () => { });

addSecureRoute(Method.Get, "getAllWorkspaceIds", (user, req, res) => {
    res.send(JSON.stringify(user.allWorkspaceIds as Array<String>));
}, () => { });

addSecureRoute(Method.Post, "setActiveWorkspaceId", (user, req) => {
    user.update({ $set: { activeWorkspaceId: req.body.target } }, () => { });
}, () => { });

addSecureRoute(Method.Post, "addWorkspaceId", (user, req) => {
    user.update({ $push: { allWorkspaceIds: req.body.target } }, () => { });
}, () => { });

// anyone attempting to navigate to localhost at this port will
// first have to login
app.get("/", getEntry);

// Sign Up
app.get("/signup", getSignup);
app.post("/signup", postSignup);

// Log In
app.get("/login", getLogin);
app.post("/login", postLogin);

// Log Out
app.get('/logout', getLogout);

// *** 

// FORGOT PASSWORD EMAIL HANDLING
app.get('/forgot', getForgot)
app.post('/forgot', postForgot)

// RESET PASSWORD EMAIL HANDLING
app.get('/reset/:token', getReset);
app.post('/reset/:token', postReset);

let FieldStore: ObservableMap<FieldId, Field> = new ObservableMap();
app.get("/hello", (req, res) => {
    res.send("<p>Hello</p>");
})

app.get("/delete", (req, res) => {
    deleteAll();
    res.redirect("/");
});

app.use(wdm(compiler, {
    publicPath: config.output.publicPath
}))

app.use(whm(compiler))

// start the Express server
app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
})

const server = io();
interface Map {
    [key: string]: Client;
}
let clients: Map = {}

server.on("connection", function (socket: Socket) {
    console.log("a user has connected")

    Utils.Emit(socket, MessageStore.Foo, "handshooken")

    Utils.AddServerHandler(socket, MessageStore.Bar, barReceived)
    Utils.AddServerHandler(socket, MessageStore.SetField, (args) => setField(socket, args))
    Utils.AddServerHandlerCallback(socket, MessageStore.GetField, getField)
    Utils.AddServerHandlerCallback(socket, MessageStore.GetFields, getFields)
    Utils.AddServerHandler(socket, MessageStore.DeleteAll, deleteAll)
})

function deleteAll() {
    Database.Instance.deleteAll();
}

function barReceived(guid: String) {
    clients[guid.toString()] = new Client(guid.toString());
    // Database.Instance.print()
}

function addDocument(document: Document) {

}

function getField([id, callback]: [string, (result: any) => void]) {
    Database.Instance.getDocument(id, (result: any) => {
        if (result) {
            callback(result)
        }
        else {
            callback(undefined)
        }
    })
}

function getFields([ids, callback]: [string[], (result: any) => void]) {
    Database.Instance.getDocuments(ids, callback);
}

function setField(socket: Socket, newValue: Transferable) {
    Database.Instance.update(newValue._id, newValue)
    socket.broadcast.emit(MessageStore.SetField.Message, newValue)
}

server.listen(serverPort);
console.log(`listening on port ${serverPort}`);