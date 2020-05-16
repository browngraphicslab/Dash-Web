import * as express from 'express';
import * as expressValidator from 'express-validator';
import * as session from 'express-session';
import * as passport from 'passport';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import expressFlash = require('express-flash');
import flash = require('connect-flash');
import { Database } from './database';
import { getForgot, getLogin, getLogout, getReset, getSignup, postForgot, postLogin, postReset, postSignup } from './authentication/AuthenticationManager';
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
import { logPort, pathFromRoot, } from './ActionUtilities';
import { blue, yellow } from 'colors';
import * as cors from "cors";
import { createServer, Server as SecureServer } from "https";
import { Server } from "http";

/* RouteSetter is a wrapper around the server that prevents the server
   from being exposed. */
export type RouteSetter = (server: RouteManager) => void;
export let disconnect: Function;

export default async function InitializeServer(routeSetter: RouteSetter) {
    const app = buildWithMiddleware(express());

    app.use(express.static(publicDirectory, {
        setHeaders: res => res.setHeader("Access-Control-Allow-Origin", "*")
    }));
    app.use("/images", express.static(publicDirectory));
    app.use(cors({ origin: (_origin: any, callback: any) => callback(null, true) }));

    app.use(wdm(compiler, { publicPath: config.output.publicPath }));
    app.use(whm(compiler));

    registerAuthenticationRoutes(app);
    registerCorsProxy(app);

    const isRelease = determineEnvironment();

    routeSetter(new RouteManager(app, isRelease));
    registerRelativePath(app);

    const { serverPort } = process.env;
    const resolved = isRelease && serverPort ? Number(serverPort) : 1050;

    let server: Server | SecureServer;
    if (isRelease) {
        server = createServer({
            key: fs.readFileSync(pathFromRoot(`./${process.env.serverName}.key`)),
            cert: fs.readFileSync(pathFromRoot(`./${process.env.serverName}.crt`))
        }, app);
        (server as SecureServer).listen(resolved, () => {
            logPort("server", resolved);
            console.log();
        });
    } else {
        server = app.listen(resolved, () => {
            logPort("server", resolved);
            console.log();
        });
    }

    disconnect = async () => new Promise<Error>(resolve => server.close(resolve));
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
            store: process.env.DB === "MEM" ? new session.MemoryStore() : new MongoStore({ url: Database.url })
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

    const color = isRelease ? blue : yellow;
    const label = isRelease ? "release" : "development";
    console.log(`\nrunning server in ${color(label)} mode`);

    // swilkins: I don't think we need to read from ClientUtils.RELEASE anymore. Should be able to invoke process.env.RELEASE
    // on the client side, thanks to dotenv in webpack.config.js
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

        const requrl = decodeURIComponent(req.url.substring(1));
        const referer = req.headers.referer ? decodeURIComponent(req.headers.referer) : "";
        // cors weirdness here... 
        // if the referer is a cors page and the cors() route (I think) redirected to /corsProxy/<path> and the requested url path was relative, 
        // then we redirect again to the cors referer and just add the relative path.
        if (!requrl.startsWith("http") && req.originalUrl.startsWith("/corsProxy") && referer?.includes("corsProxy")) {
            res.redirect(referer + (referer.endsWith("/") ? "" : "/") + requrl);
        }
        else {
            req.pipe(request(requrl)).on("response", res => {
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
        }
    });
}

function registerRelativePath(server: express.Express) {
    server.use("*", (req, res) => {
        const relativeUrl = req.originalUrl;
        if (!res.headersSent && req.headers.referer?.includes("corsProxy")) { // a request for something by a proxied referrer means it must be a relative reference.  So construct a proxied absolute reference here.
            const proxiedRefererUrl = decodeURIComponent(req.headers.referer); // (e.g., http://localhost:1050/corsProxy/https://en.wikipedia.org/wiki/Engelbart)
            const dashServerUrl = proxiedRefererUrl.match(/.*corsProxy\//)![0]; // the dash server url (e.g.: http://localhost:1050/corsProxy/ )
            const actualReferUrl = proxiedRefererUrl.replace(dashServerUrl, ""); // the url of the referer without the proxy (e.g., : http:s//en.wikipedia.org/wiki/Engelbart)
            const absoluteTargetBaseUrl = actualReferUrl.match(/http[s]?:\/\/[^\/]*/)![0]; // the base of the original url (e.g.,  https://en.wikipedia.org)
            const redirectedProxiedUrl = dashServerUrl + encodeURIComponent(absoluteTargetBaseUrl + relativeUrl); // the new proxied full url (e..g, http://localhost:1050/corsProxy/https://en.wikipedia.org/<somethingelse>)
            res.redirect(redirectedProxiedUrl);
        } else if (relativeUrl.startsWith("/search")) { // detect search query and use default search engine
            res.redirect(req.headers.referer + "corsProxy/" + encodeURIComponent("http://www.google.com" + relativeUrl));
        } else {
            res.end();
        }
    });
}
