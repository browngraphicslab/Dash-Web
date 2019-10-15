import RouteSubscriber from "./RouteSubscriber";
import { RouteStore } from "./RouteStore";
import { DashUserModel } from "./authentication/models/user_model";
import * as express from 'express';
import * as qs from 'query-string';

export default class RouteManager {
    private server: express.Express;
    private _isRelease: boolean;

    public get release() {
        return this._isRelease;
    }

    constructor(server: express.Express, isRelease: boolean) {
        this.server = server;
        this._isRelease = isRelease;
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
    addSupervisedRoute(initializer: RouteInitializer) {
        const { method, subscription, onValidation, onRejection, onError } = initializer;
        const release = this._isRelease;
        let abstracted = async (req: express.Request, res: express.Response) => {
            const { user, originalUrl: target } = req;
            if (user || isSharedDocAccess(target)) {
                try {
                    await onValidation(user, req, res, release);
                } catch (e) {
                    if (onError) {
                        onError(req, res, e, release);
                    } else {
                        _error(res, `The server encountered an internal error handling ${target}.`, e);
                    }
                }
            } else {
                req.session!.target = target;
                try {
                    await (onRejection || LoginRedirect)(req, res, release);
                } catch (e) {
                    if (onError) {
                        onError(req, res, e, this._isRelease);
                    } else {
                        _error(res, `The server encountered an internal error when rejecting ${target}.`, e);
                    }
                }
            }
        };
        const subscribe = (subscriber: RouteSubscriber | string) => {
            let route: string;
            if (typeof subscriber === "string") {
                route = subscriber;
            } else {
                route = subscriber.build;
            }
            switch (method) {
                case Method.GET:
                    this.server.get(route, abstracted);
                    break;
                case Method.POST:
                    this.server.post(route, abstracted);
                    break;
            }
        };
        if (Array.isArray(subscription)) {
            subscription.forEach(subscribe);
        } else {
            subscribe(subscription);
        }
    }

}

export enum Method {
    GET,
    POST
}

export type ValidationHandler = (user: DashUserModel, req: express.Request, res: express.Response, isRelease: boolean) => any | Promise<any>;
export type RejectionHandler = (req: express.Request, res: express.Response, isRelease: boolean) => any | Promise<any>;
export type ErrorHandler = (req: express.Request, res: express.Response, error: any, isRelease: boolean) => any | Promise<any>;

const LoginRedirect: RejectionHandler = (_req, res) => res.redirect(RouteStore.login);

export interface RouteInitializer {
    method: Method;
    subscription: string | RouteSubscriber | (string | RouteSubscriber)[];
    onValidation: ValidationHandler;
    onRejection?: RejectionHandler;
    onError?: ErrorHandler;
}

const isSharedDocAccess = (target: string) => {
    const shared = qs.parse(qs.extract(target), { sort: false }).sharing === "true";
    const docAccess = target.startsWith("/doc/");
    return shared && docAccess;
};

export const STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    EXECUTION_ERROR: 500,
    PERMISSION_DENIED: 403
};

export function _error(res: express.Response, message: string, error?: any) {
    res.statusMessage = message;
    res.status(STATUS.EXECUTION_ERROR).send(error);
}

export function _success(res: express.Response, body: any) {
    res.status(STATUS.OK).send(body);
}

export function _invalid(res: express.Response, message: string) {
    res.statusMessage = message;
    res.status(STATUS.BAD_REQUEST).send();
}

export function _permission_denied(res: express.Response, message: string) {
    res.statusMessage = message;
    res.status(STATUS.BAD_REQUEST).send("Permission Denied!");
}
