import * as express from 'express';
import * as expressValidator from 'express-validator';
import * as session from 'express-session';
import * as passport from 'passport';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import expressFlash = require('express-flash');
import flash = require('connect-flash');
import { Database } from './database';
const MongoStore = require('connect-mongo')(session);
import mongoose, { ConnectionStates } from 'mongoose';
import { RouteStore } from './RouteStore';
import RouteManager from './RouteManager';
import * as webpack from 'webpack';
const config = require('../../webpack.config');
const compiler = webpack(config);
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import * as fs from 'fs';

export interface InitializationOptions {
    listenAtPort: number;
    routeSetter: (server: RouteManager) => void;
}

export default async function InitializeServer(options: InitializationOptions) {
    const { listenAtPort, routeSetter } = options;
    const server = injectMiddleware(express());
    const { url } = Database;
    try {
        await connectToDatabase(url);
    } catch (e) {
        console.error(`Mongoose FAILED to establish default connection at ${url}`);
        console.error(e);
        console.log('Since a valid database connection is required to use Dash, killing the server process.\nPlease try again later.');
        process.exit(1);
    }

    // static file serving
    server.use(express.static(__dirname + RouteStore.public));
    server.use(RouteStore.images, express.static(__dirname + RouteStore.public));

    routeSetter(new RouteManager(server, determineEnvironment()));

    server.use(wdm(compiler, { publicPath: config.output.publicPath }));
    server.use(whm(compiler));
    server.listen(listenAtPort, () => console.log(`server started at http://localhost:${listenAtPort}`));

    return server;
}

function determineEnvironment() {
    const isRelease = process.env.RELEASE === "true";

    console.log(`running server in ${isRelease ? 'release' : 'debug'} mode`);
    console.log(process.env.PWD);

    let clientUtils = fs.readFileSync("./src/client/util/ClientUtils.ts.temp", "utf8");
    clientUtils = `//AUTO-GENERATED FILE: DO NOT EDIT\n${clientUtils.replace('"mode"', String(isRelease))}`;
    fs.writeFileSync("./src/client/util/ClientUtils.ts", clientUtils, "utf8");

    return isRelease;
}

const week = 7 * 24 * 60 * 60 * 1000;
const secret = "64d6866242d3b5a5503c675b32c9605e4e90478e9b77bcf2bc";

function injectMiddleware(server: express.Express) {
    [
        cookieParser(),
        session({
            secret,
            resave: true,
            cookie: { maxAge: week },
            saveUninitialized: true,
            store: new MongoStore({ url: Database.url })
        }),
        flash(),
        expressFlash(),
        bodyParser.json({ limit: "10mb" }),
        bodyParser.urlencoded({ extended: true }),
        expressValidator(),
        passport.initialize(),
        passport.session(),
        (req: express.Request, res: express.Response, next: express.NextFunction) => {
            res.locals.user = req.user;
            next();
        }
    ].forEach(next => server.use(next));
    return server;
}

async function connectToDatabase(url: string) {
    const { connection } = mongoose;
    process.on('SIGINT', () => {
        connection.close(() => {
            console.log('Mongoose default connection disconnected through app termination');
            process.exit(0);
        });
    });
    if (connection.readyState === ConnectionStates.disconnected) {
        return new Promise<void>((resolve, reject) => {
            connection.on('error', reject);
            connection.on('connected', () => {
                console.log(`Mongoose established default connection at ${url}`);
                resolve();
            });
        });
    }
}