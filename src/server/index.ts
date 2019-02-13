import * as express from 'express'
const app = express()
import * as webpack from 'webpack'
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import * as path from 'path'
import { MessageStore, Message, SetFieldArgs, GetFieldArgs, Transferable } from "./Message";
import { Client } from './Client';
import { Socket } from 'socket.io';
import { Utils } from '../Utils';
import { ObservableMap } from 'mobx';
import { FIELD_ID, Field } from '../fields/Field';
import { Database } from './database';
import { ServerUtils } from './ServerUtil';
import { ObjectID } from 'mongodb';
const config = require('../../webpack.config')
const compiler = webpack(config)
const port = 1050; // default port to listen
const serverPort = 1234;

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
    Utils.AddServerHandler(socket, MessageStore.SetField, setField)
    Utils.AddServerHandlerCallback(socket, MessageStore.GetField, getField)
})

function barReceived(guid: String) {
    clients[guid.toString()] = new Client(guid.toString());
    Database.Instance.print()
}

function addDocument(document: Document) {

}

function setField(newValue: Transferable) {
    console.log(newValue._id)
    if (Database.Instance.getDocument(newValue._id)) {
        Database.Instance.update(newValue._id, newValue)
    }
    else {
        Database.Instance.insert(newValue)
    }
}

function getField([fieldRequest, callback]: [GetFieldArgs, (field: Field) => void]) {
    let fieldId: string = fieldRequest.field
    let result: string | undefined = Database.Instance.getDocument(fieldId)
    if (result) {
        let fromJson: Field = ServerUtils.FromJson(result)
    }
}

server.listen(serverPort);
console.log(`listening on port ${serverPort}`);