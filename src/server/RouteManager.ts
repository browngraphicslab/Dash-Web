import RouteSubscriber from "./RouteSubscriber";
import { DashUserModel } from "./authentication/models/user_model";
import * as express from 'express';
import { ConsoleColors } from "./ActionUtilities";

export enum Method {
    GET,
    POST
}

export interface CoreArguments {
    req: express.Request;
    res: express.Response;
    isRelease: boolean;
}

export type OnValidation = (core: CoreArguments & { user: DashUserModel }) => any | Promise<any>;
export type OnUnauthenticated = (core: CoreArguments) => any | Promise<any>;
export type OnError = (core: CoreArguments & { error: any }) => any | Promise<any>;

export interface RouteInitializer {
    method: Method;
    subscription: string | RouteSubscriber | (string | RouteSubscriber)[];
    onValidation: OnValidation;
    onUnauthenticated?: OnUnauthenticated;
    onError?: OnError;
}

export default class RouteManager {
    private server: express.Express;
    private _isRelease: boolean;

    public get isRelease() {
        return this._isRelease;
    }

    constructor(server: express.Express, isRelease: boolean) {
        this.server = server;
        this._isRelease = isRelease;
    }

    /**
     * 
     * @param initializer 
     */
    addSupervisedRoute = (initializer: RouteInitializer): void => {
        const { method, subscription, onValidation, onUnauthenticated, onError } = initializer;
        const isRelease = this._isRelease;
        let supervised = async (req: express.Request, res: express.Response) => {
            const { user, originalUrl: target } = req;
            const core = { req, res, isRelease };
            const tryExecute = async (toExecute: (args: any) => any | Promise<any>, args: any) => {
                try {
                    await toExecute(args);
                } catch (e) {
                    console.log(ConsoleColors.Red, target, user?.email ?? "<user logged out>");
                    if (onError) {
                        onError({ ...core, error: e });
                    } else {
                        _error(res, `The server encountered an internal error when serving ${target}.`, e);
                    }
                }
            };
            if (user) {
                await tryExecute(onValidation, { ...core, user });
            } else {
                req.session!.target = target;
                if (onUnauthenticated) {
                    await tryExecute(onUnauthenticated, core);
                    if (!res.headersSent) {
                        res.redirect("/login");
                    }
                } else {
                    res.redirect("/login");
                }
            }
            setTimeout(() => {
                if (!res.headersSent) {
                    console.log("Initiating fallback for ", target);
                    const warning = `request to ${target} fell through - this is a fallback response`;
                    res.send({ warning });
                }
            }, 1000);
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
                    this.server.get(route, supervised);
                    break;
                case Method.POST:
                    this.server.post(route, supervised);
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

export const STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    EXECUTION_ERROR: 500,
    PERMISSION_DENIED: 403
};

export function _error(res: express.Response, message: string, error?: any) {
    console.error(message);
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

export function _permission_denied(res: express.Response, message?: string) {
    if (message) {
        res.statusMessage = message;
    }
    res.status(STATUS.BAD_REQUEST).send("Permission Denied!");
}
