import RouteSubscriber from "./RouteSubscriber";
import { DashUserModel } from "./authentication/DashUserModel";
import { Request, Response, Express } from 'express';
import { cyan, red, green } from 'colors';

export enum Method {
    GET,
    POST
}

export interface CoreArguments {
    req: Request;
    res: Response;
    isRelease: boolean;
}

export type AuthorizedCore = CoreArguments & { user: DashUserModel };
export type SecureHandler = (core: AuthorizedCore) => any | Promise<any>;
export type PublicHandler = (core: CoreArguments) => any | Promise<any>;
export type ErrorHandler = (core: CoreArguments & { error: any }) => any | Promise<any>;

export interface RouteInitializer {
    method: Method;
    subscription: string | RouteSubscriber | (string | RouteSubscriber)[];
    secureHandler: SecureHandler;
    publicHandler?: PublicHandler;
    errorHandler?: ErrorHandler;
}

const registered = new Map<string, Set<Method>>();

enum RegistrationError {
    Malformed,
    Duplicate
}

export default class RouteManager {
    private server: Express;
    private _isRelease: boolean;
    private failedRegistrations: { route: string, reason: RegistrationError }[] = [];

    public get isRelease() {
        return this._isRelease;
    }

    constructor(server: Express, isRelease: boolean) {
        this.server = server;
        this._isRelease = isRelease;
    }

    logRegistrationOutcome = () => {
        if (this.failedRegistrations.length) {
            let duplicateCount = 0;
            let malformedCount = 0;
            this.failedRegistrations.forEach(({ reason, route }) => {
                let error: string;
                if (reason === RegistrationError.Duplicate) {
                    error = `duplicate registration error: ${route} is already registered `;
                    duplicateCount++;
                } else {
                    error = `malformed route error: ${route} is invalid`;
                    malformedCount++;
                }
                console.log(red(error));
            });
            console.log();
            if (duplicateCount) {
                console.log('please remove all duplicate routes before continuing');
            }
            if (malformedCount) {
                console.log(`please ensure all routes adhere to ^\/$|^\/[A-Za-z]+(\/\:[A-Za-z?_]+)*$`);
            }
            process.exit(1);
        } else {
            console.log(green("all server routes have been successfully registered:"));
            Array.from(registered.keys()).sort().forEach(route => console.log(cyan(route)));
            console.log();
        }
    }

    static routes: string[] = [];
    /**
     * 
     * @param initializer 
     */
    addSupervisedRoute = (initializer: RouteInitializer): void => {
        const { method, subscription, secureHandler, publicHandler, errorHandler } = initializer;

        typeof (initializer.subscription) === "string" && RouteManager.routes.push(initializer.subscription);
        initializer.subscription instanceof RouteSubscriber && RouteManager.routes.push(initializer.subscription.root);
        initializer.subscription instanceof Array && initializer.subscription.map(sub => {
            typeof (sub) === "string" && RouteManager.routes.push(sub);
            sub instanceof RouteSubscriber && RouteManager.routes.push(sub.root);
        });
        const isRelease = this._isRelease;
        const supervised = async (req: Request, res: Response) => {
            let { user } = req;
            const { originalUrl: target } = req;
            if (process.env.DB === "MEM" && !user) {
                user = { id: "guest", email: "", userDocumentId: "guestDocId" };
            }
            const core = { req, res, isRelease };
            const tryExecute = async (toExecute: (args: any) => any | Promise<any>, args: any) => {
                try {
                    await toExecute(args);
                } catch (e) {
                    console.log(red(target), user && ("email" in user) ? "<user logged out>" : undefined);
                    if (errorHandler) {
                        errorHandler({ ...core, error: e });
                    } else {
                        _error(res, `The server encountered an internal error when serving ${target}.`, e);
                    }
                }
            };
            if (user) {
                await tryExecute(secureHandler, { ...core, user });
            } else {
                req.session!.target = target;
                if (publicHandler) {
                    await tryExecute(publicHandler, core);
                    if (!res.headersSent) {
                        res.redirect("/login");
                    }
                } else {
                    res.redirect("/login");
                }
            }
            setTimeout(() => {
                if (!res.headersSent) {
                    console.log(red(`Initiating fallback for ${target}. Please remove dangling promise from route handler`));
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
            if (!/^\/$|^\/[A-Za-z\*]+(\/\:[A-Za-z?_\*]+)*$/g.test(route)) {
                this.failedRegistrations.push({
                    reason: RegistrationError.Malformed,
                    route
                });
            } else {
                const existing = registered.get(route);
                if (existing) {
                    if (existing.has(method)) {
                        this.failedRegistrations.push({
                            reason: RegistrationError.Duplicate,
                            route
                        });
                        return;
                    }
                } else {
                    const specific = new Set<Method>();
                    specific.add(method);
                    registered.set(route, specific);
                }
                switch (method) {
                    case Method.GET:
                        this.server.get(route, supervised);
                        break;
                    case Method.POST:
                        this.server.post(route, supervised);
                        break;
                }
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

export function _error(res: Response, message: string, error?: any) {
    console.error(message, error);
    res.statusMessage = message;
    res.status(STATUS.EXECUTION_ERROR).send(error);
}

export function _success(res: Response, body: any) {
    res.status(STATUS.OK).send(body);
}

export function _invalid(res: Response, message: string) {
    res.statusMessage = message;
    res.status(STATUS.BAD_REQUEST).send();
}

export function _permission_denied(res: Response, message?: string) {
    if (message) {
        res.statusMessage = message;
    }
    res.status(STATUS.PERMISSION_DENIED).send(`Permission Denied! ${message}`);
}
