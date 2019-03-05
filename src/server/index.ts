import * as express from 'express'
const app = express()
import * as webpack from 'webpack'
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import * as path from 'path'
import * as formidable from 'formidable'
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
import { Document } from '../fields/Document';
import * as io from 'socket.io'
import * as passportConfig from './authentication/config/passport';
import { getLogin, postLogin, getSignup, postSignup } from './authentication/controllers/user';
const config = require('../../webpack.config');
const compiler = webpack(config);
const port = 1050; // default port to listen
const serverPort = 1234;
import * as expressValidator from 'express-validator';
import expressFlash = require('express-flash');
import * as bodyParser from 'body-parser';
import * as session from 'express-session';
import c = require("crypto");
const MongoStore = require('connect-mongo')(session);
const mongoose = require('mongoose');
const bluebird = require('bluebird');
import { performance } from 'perf_hooks'
import * as fs from 'fs';
import * as request from 'request'

const download = (url: string, dest: fs.PathLike) => {
    request.get(url).pipe(fs.createWriteStream(dest));
}

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

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(expressFlash());
app.use(require('express-session')({
    secret: `${c.randomBytes(64)}`,
    resave: true,
    saveUninitialized: true,
    store: new MongoStore({
        url: 'mongodb://localhost:27017/Dash'
    })
}));
app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});

app.get("/signup", getSignup);
app.post("/signup", postSignup);
app.get("/login", getLogin);
app.post("/login", postLogin);

// IMAGE UPLOADING HANDLER

app.post("/upload", (req, res, err) => {
    new formidable.IncomingForm().parse(req, (err, fields, files) => {
        for (const name in files) {
            let file = files[name];
            file.path = __dirname + "/files/" + file.name;
            console.log(file.path);
        }
    });
    //request.get(url).pipe(fs.createWriteStream(__dirname + "/public/images"));
})

app.use(express.static(__dirname + '/public'));

let FieldStore: ObservableMap<FieldId, Field> = new ObservableMap();

// define a route handler for the default home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, '../../deploy/index.html'));
});

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