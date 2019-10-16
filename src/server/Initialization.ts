import * as express from 'express';
import * as expressValidator from 'express-validator';
import * as session from 'express-session';
import * as passport from 'passport';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import expressFlash = require('express-flash');
import flash = require('connect-flash');
import { Database } from './database';
import { getForgot, getLogin, getLogout, getReset, getSignup, postForgot, postLogin, postReset, postSignup } from './authentication/controllers/user_controller';
const MongoStore = require('connect-mongo')(session);
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
    const server = buildWithMiddleware(express());

    routeSetter(new RouteManager(server, determineEnvironment()));

    server.use(express.static(__dirname + RouteStore.public));
    server.use(RouteStore.images, express.static(__dirname + RouteStore.public));

    server.use(wdm(compiler, { publicPath: config.output.publicPath }));
    server.use(whm(compiler));
    server.listen(listenAtPort, () => console.log(`server started at http://localhost:${listenAtPort}`));

    registerAuthenticationRoutes(server);

    return server;
}

const week = 7 * 24 * 60 * 60 * 1000;
const secret = "64d6866242d3b5a5503c675b32c9605e4e90478e9b77bcf2bc";

function buildWithMiddleware(server: express.Express) {
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

function determineEnvironment() {
    const isRelease = process.env.RELEASE === "true";

    console.log(`running server in ${isRelease ? 'release' : 'debug'} mode`);
    console.log(process.env.PWD);

    let clientUtils = fs.readFileSync("./src/client/util/ClientUtils.ts.temp", "utf8");
    clientUtils = `//AUTO-GENERATED FILE: DO NOT EDIT\n${clientUtils.replace('"mode"', String(isRelease))}`;
    fs.writeFileSync("./src/client/util/ClientUtils.ts", clientUtils, "utf8");

    return isRelease;
}

function registerAuthenticationRoutes(server: express.Express) {
    server.get(RouteStore.signup, getSignup);
    server.post(RouteStore.signup, postSignup);

    server.get(RouteStore.login, getLogin);
    server.post(RouteStore.login, postLogin);

    server.get(RouteStore.logout, getLogout);

    server.get(RouteStore.forgot, getForgot);
    server.post(RouteStore.forgot, postForgot);

    server.get(RouteStore.reset, getReset);
    server.post(RouteStore.reset, postReset);
}