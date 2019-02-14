import * as express from 'express'
const app = express()
import * as webpack from 'webpack'
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import * as path from 'path'
import * as passport from 'passport';
import { MessageStore, Message, SetFieldArgs, GetFieldArgs, Transferable } from "./Message";
import { Client } from './Client';
import { Socket } from 'socket.io';
import { Utils } from '../Utils';
import { ObservableMap } from 'mobx';
import { FIELD_ID, Field } from '../fields/Field';
// import { Database } from './database';
import { ServerUtils } from './ServerUtil';
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

let FieldStore: ObservableMap<FIELD_ID, Field> = new ObservableMap();

// define a route handler for the default home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, '../../deploy/index.html'));
});

app.get("/hello", (req, res) => {
    res.send("<p>Hello</p>");
})

app.use(wdm(compiler, {
    publicPath: config.output.publicPath
}))

app.use(whm(compiler))

// start the Express server
app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
})

const server = require("socket.io")();
interface Map {
    [key: string]: Client;
}
let clients: Map = {}

server.on("connection", function (socket: Socket) {
    console.log("a user has connected")

    Utils.Emit(socket, MessageStore.Foo, "handshooken")

    Utils.AddServerHandler(socket, MessageStore.Bar, barReceived)
    // Utils.AddServerHandler(socket, MessageStore.SetField, setField)
    // Utils.AddServerHandlerCallback(socket, MessageStore.GetField, getField)
})

function barReceived(guid: String) {
    clients[guid.toString()] = new Client(guid.toString());
    // Database.Instance.print()
}

function addDocument(document: Document) {

}

function setField(newValue: Transferable) {
    console.log(newValue._id)
    // if (Database.Instance.getDocument(newValue._id)) {
    //     Database.Instance.update(newValue._id, newValue)
    // }
    // else {
    //     Database.Instance.insert(newValue)
    // }
}

function getField([fieldRequest, callback]: [GetFieldArgs, (field: Field) => void]) {
    let fieldId: string = fieldRequest.field
    // let result: string | undefined = Database.Instance.getDocument(fieldId)
    // if (result) {
    //     let fromJson: Field = ServerUtils.FromJson(result)
    // }
}

server.listen(serverPort);
console.log(`listening on port ${serverPort}`);