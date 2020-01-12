import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied, AuthorizedCore, SecureHandler } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { sessionAgent } from "..";
import { DashSessionAgent } from "../DashSession/DashSessionAgent";

const permissionError = "You are not authorized!";

export default class SessionManager extends ApiManager {

    private secureSubscriber = (root: string, ...params: string[]) => new RouteSubscriber(root).add("sessionKey", ...params);

    private authorizedAction = (handler: SecureHandler) => {
        return (core: AuthorizedCore) => {
            const { req, res, isRelease } = core;
            const { sessionKey } = req.params;
            if (!isRelease) {
                return res.send("This can be run only on the release server.");
            }
            if (sessionKey !== process.env.session_key) {
                return _permission_denied(res, permissionError);
            }
            return handler(core);
        };
    }

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("debug", "mode?", "recipient?"),
            secureHandler: this.authorizedAction(async ({ req: { params }, res }) => {
                const mode = params.mode || "active";
                const recipient = params.recipient || DashSessionAgent.notificationRecipient;
                if (!["passive", "active"].includes(mode)) {
                    res.send(`Your request failed. '${mode}' is not a valid mode: please choose either 'active' or 'passive'`);
                } else {
                    const { error } = await sessionAgent.serverWorker.emitToMonitorPromise("debug", { mode, recipient });
                    res.send(error ? error.message : `Your request was successful: the server ${mode === "active" ? "created and compressed a new" : "retrieved and compressed the most recent"} back up. It was sent to ${recipient}.`);
                }
            })
        });

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("backup"),
            secureHandler: this.authorizedAction(async ({ res }) => {
                const { error } = await sessionAgent.serverWorker.emitToMonitorPromise("backup");
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