import * as express from 'express'
const app = express()
import * as webpack from 'webpack'
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import * as path from 'path'
import * as formidable from 'formidable'
import * as passport from 'passport';
import { MessageStore, Transferable } from "./Message";
import { Client } from './Client';
import { Socket } from 'socket.io';
import { Utils } from '../Utils';
import { ObservableMap } from 'mobx';
import { FieldId, Field } from '../fields/Field';
import { Database } from './database';
import * as io from 'socket.io'
import { getLogin, postLogin, getSignup, postSignup, getLogout, postReset, getForgot, postForgot, getReset } from './authentication/controllers/user_controller';
const config = require('../../webpack.config');
const compiler = webpack(config);
const port = 1050; // default port to listen
const serverPort = 1234;
import * as expressValidator from 'express-validator';
import expressFlash = require('express-flash');
import flash = require('connect-flash');
import * as bodyParser from 'body-parser';
import * as session from 'express-session';
import * as cookieParser from 'cookie-parser';
import c = require("crypto");
const MongoStore = require('connect-mongo')(session);
const mongoose = require('mongoose');
import { DashUserModel } from './authentication/models/user_model';
import * as fs from 'fs';
import * as request from 'request'
import { RouteStore } from './RouteStore';

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

app.use(cookieParser());
app.use(session({
    secret: "64d6866242d3b5a5503c675b32c9605e4e90478e9b77bcf2bc",
    resave: true,
    cookie: { maxAge: 7 * 24 * 60 * 60 },
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

app.get("/hello", (req, res) => {
    res.send("<p>Hello</p>");
})

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
        const dashUser: DashUserModel = req.user;
        if (!dashUser) return onRejection(res);
        handler(dashUser, res, req);
    }
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

let FieldStore: ObservableMap<FieldId, Field> = new ObservableMap();

app.use(express.static(__dirname + RouteStore.public));
app.use(RouteStore.images, express.static(__dirname + RouteStore.public))

// GETTERS

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
    (user, res) => res.sendFile(path.join(__dirname, '../../deploy/index.html')),
    undefined,
    RouteStore.home,
    RouteStore.openDocumentWithId
);

addSecureRoute(
    Method.GET,
    (user, res) => res.send(user.activeWorkspaceId || ""),
    undefined,
    RouteStore.getActiveWorkspace,
);

addSecureRoute(
    Method.GET,
    (user, res) => res.send(JSON.stringify(user.allWorkspaceIds)),
    undefined,
    RouteStore.getAllWorkspaces
);

addSecureRoute(
    Method.GET,
    (user, res) => res.send(JSON.stringify(user.id)),
    undefined,
    RouteStore.getCurrUser
);

// SETTERS

addSecureRoute(
    Method.POST,
    (user, res, req) => {
        user.update({ $set: { activeWorkspaceId: req.body.target } }, (err, raw) => {
            res.sendStatus(err ? 500 : 200);
        });
    },
    undefined,
    RouteStore.setActiveWorkspace
);

addSecureRoute(
    Method.POST,
    (user, res, req) => {
        user.update({ $push: { allWorkspaceIds: req.body.target } }, (err, raw) => {
            res.sendStatus(err ? 500 : 200);
        });
    },
    undefined,
    RouteStore.addWorkspace
);

addSecureRoute(
    Method.POST,
    (user, res, req) => {
        let form = new formidable.IncomingForm()
        form.uploadDir = __dirname + "/public/files/"
        form.keepExtensions = true
        // let path = req.body.path;
        console.log("upload")
        form.parse(req, (err, fields, files) => {
            console.log("parsing")
            let names: any[] = [];
            for (const name in files) {
                let file = files[name];
                names.push(`/files/` + path.basename(file.path));
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
app.get(RouteStore.forgot, getForgot)
app.post(RouteStore.forgot, postForgot)

// RESET PASSWORD EMAIL HANDLING
app.get(RouteStore.reset, getReset);
app.post(RouteStore.reset, postReset);

app.use(RouteStore.corsProxy, (req, res) => {
    req.pipe(request(req.url.substring(1))).pipe(res);
});

app.get(RouteStore.delete, (req, res) => {
    deleteAll();
    res.redirect(RouteStore.home);
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
    Database.Instance.update(newValue._id, newValue, () => {
        socket.broadcast.emit(MessageStore.SetField.Message, newValue);
    })
}

server.listen(serverPort);
console.log(`listening on port ${serverPort}`);