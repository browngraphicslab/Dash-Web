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
import RouteManager from './RouteManager';
import * as webpack from 'webpack';
const config = require('../../webpack.config');
const compiler = webpack(config);
import * as wdm from 'webpack-dev-middleware';
import * as whm from 'webpack-hot-middleware';
import * as fs from 'fs';
import * as request from 'request';
import RouteSubscriber from './RouteSubscriber';
import { publicDirectory } from '.';

/* RouteSetter is a wrapper around the server that prevents the server
   from being exposed. */
export type RouteSetter = (server: RouteManager) => void;
export interface InitializationOptions {
    listenAtPort: number;
    routeSetter: RouteSetter;
}

export default async function InitializeServer(options: InitializationOptions) {
    const { listenAtPort, routeSetter } = options;
    const server = buildWithMiddleware(express());

    server.use(express.static(publicDirectory));
    server.use("/images", express.static(publicDirectory));

    server.use(wdm(compiler, { publicPath: config.output.publicPath }));
    server.use(whm(compiler));

    registerAuthenticationRoutes(server);
    registerCorsProxy(server);

    const isRelease = determineEnvironment(); //vs. dev mode
    routeSetter(new RouteManager(server, isRelease));

    server.listen(listenAtPort, () => console.log(`server started at http://localhost:${listenAtPort}`));
    return isRelease;
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

/* Determine if the enviroment is dev mode or release mode. */
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
    server.get("/signup", getSignup);
    server.post("/signup", postSignup);

    server.get("/login", getLogin);
    server.post("/login", postLogin);

    server.get("/logout", getLogout);

    server.get("/forgotPassword", getForgot);
    server.post("/forgotPassword", postForgot);

    const reset = new RouteSubscriber("resetPassword").add("token").build;
    server.get(reset, getReset);
    server.post(reset, postReset);
}

function registerCorsProxy(server: express.Express) {
    const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
    server.use("/corsProxy", (req, res) => {
        req.pipe(request(decodeURIComponent(req.url.substring(1)))).on("response", res => {
            const headers = Object.keys(res.headers);
            headers.forEach(headerName => {
                const header = res.headers[headerName];
                if (Array.isArray(header)) {
                    res.headers[headerName] = header.filter(h => !headerCharRegex.test(h));
                } else if (header) {
                    if (headerCharRegex.test(header as any)) {
                        delete res.headers[headerName];
                    }
                }
            });
        }).pipe(res);
    });
}