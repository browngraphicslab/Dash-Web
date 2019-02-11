import { MessageStore } from "./Message";

// const express = require("express")
// const path = require("path")

// const app = express();
// app.set("port", process.env.PORT || 3000);

// var http = require('http').Server(app);

// app.get('/', function (req: any, res: any) {
//     res.sendFile(path.resolve("./deploy/index.html"))
// })

// const server = http.listen(3000, function () {
//     console.log("Listening on *:3000")
// })

const server = require("socket.io")();
var clients = [];

server.on("connection", function (socket: any) {
    console.log("a user has connected")

    socket.emit(MessageStore.Handshake.Message, "handshake received")

    clients.push(socket)
})

server.listen(8080);
console.log("listening on port 8080")