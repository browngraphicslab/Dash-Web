import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied, AuthorizedCore, SecureHandler } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { sessionAgent } from "..";
import { DashSessionAgent } from "../DashSession/DashSessionAgent";

const permissionError = "You are not authorized!";

export default class SessionManager extends ApiManager {

    private secureSubscriber = (root: string, ...params: string[]) => new RouteSubscriber(root).add("session_key", ...params);

    private authorizedAction = (handler: SecureHandler) => {
        return (core: AuthorizedCore) => {
            const { req: { params }, res, isRelease } = core;
            if (!isRelease) {
                return res.send("This can be run only on the release server.");
            }
            if (params.session_key !== process.env.session_key) {
                return _permission_denied(res, permissionError);
            }
            return handler(core);
        };
    }

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("debug", "to?"),
            secureHandler: this.authorizedAction(async ({ req: { params }, res }) => {
                const to = params.to || DashSessionAgent.notificationRecipient;
                const { error } = await sessionAgent.serverWorker.emit("debug", { to });
                res.send(error ? error.message : `Your request was successful: the server captured and compressed (but did not save) a new back up. It was sent to ${to}.`);
            })
        });

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("backup"),
            secureHandler: this.authorizedAction(async ({ res }) => {
                const { error } = await sessionAgent.serverWorker.emit("backup");
                res.send(error ? error.message : "Your request was successful: the server successfully created a new back up.");
            })
        });

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("kill"),
            secureHandler: this.authorizedAction(({ res }) => {
                res.send("Your request was successful: the server and its session have been killed.");
                sessionAgent.killSession("an authorized user has manually ended the server session via the /kill route");
            })
        });

    }

}