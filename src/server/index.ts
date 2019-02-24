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
import { FIELD_ID, Field } from '../fields/Field';
import { Database } from './database';
import { ServerUtils } from './ServerUtil';
import { ObjectID } from 'mongodb';
import { Document } from '../fields/Document';
import * as io from 'socket.io'
import * as passportConfig from './authentication/config/passport';
import { getLogin, postLogin, getSignup, postSignup, getLogout, getEntry } from './authentication/controllers/user';
const config = require('../../webpack.config');
const compiler = webpack(config);
const port = 1050; // default port to listen
const serverPort = 1234;
import * as expressValidator from 'express-validator';
import expressFlash = require('express-flash');
import flash = require('express-flash');
import * as bodyParser from 'body-parser';
import * as session from 'express-session';
import * as cookieParser from 'cookie-parser';
import c = require("crypto");
const MongoStore = require('connect-mongo')(session);
const mongoose = require('mongoose');
const bluebird = require('bluebird');
import { performance } from 'perf_hooks'
import * as path from 'path'

const mongoUrl = 'mongodb://localhost:27017/Dash';
// mongoose.Promise = bluebird;
mongoose.connect(mongoUrl)//.then(
// () => { /** ready to use. The `mongoose.connect()` promise resolves to undefined. */ },
// ).catch((err: any) => {
// console.log("MongoDB connection error. Please make sure MongoDB is running. " + err);
// process.exit();
// });
mongoose.connection.on('connected', function () {
    console.log("connected");
})

// SESSION MANAGEMENT AND AUTHENTICATION MIDDLEWARE
// ORDER OF IMPORTS MATTERS

app.use(cookieParser("secret"));
app.use(session({
    secret: `${c.randomBytes(64)}`,
    resave: true,
    cookie: { maxAge: 60000 },
    saveUninitialized: true,
    store: new MongoStore({
        url: 'mongodb://localhost:27017/Dash'
    })
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

// AUTHENTICATION ROUTING

// ***
// Look for the definitions of these get and post
// functions in the exports of user.ts

// /home defines destination after a successful log in
app.get("/home", (req, res) => {
    // if user is not logged in, redirect to log in page
    if (!req.user) {
        res.redirect("/login");
        return;
    }
    // otherwise, connect them to Dash
    // TODO: store and manage users' workspaces
    res.sendFile(path.join(__dirname, '../../deploy/index.html'));
});

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

let FieldStore: ObservableMap<FIELD_ID, Field> = new ObservableMap();

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