import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied, AuthorizedCore, SecureHandler } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { sessionAgent } from "..";
import { DashSessionAgent } from "../DashSession/DashSessionAgent";

const permissionError = "You are not authorized!";

export default class SessionManager extends ApiManager {

    private secureSubscriber = (root: string, ...params: string[]) => new RouteSubscriber(root).add("password", ...params);

    private authorizedAction = (handler: SecureHandler) => {
        return (core: AuthorizedCore) => {
            const { req, res, isRelease } = core;
            const { password } = req.params;
            if (!isRelease) {
                return res.send("This can be run only on the release server.");
            }
            if (password !== process.env.session_key) {
                return _permission_denied(res, permissionError);
            }
            return handler(core);
        };
    }

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("debug", "mode", "recipient?"),
            secureHandler: this.authorizedAction(async ({ req, res }) => {
                const { mode } = req.params;
                if (["passive", "active"].includes(mode)) {
                    const recipient = req.params.recipient || DashSessionAgent.notificationRecipient;
                    const response = await sessionAgent.serverWorker.sendMonitorAction("debug", { mode, recipient }, true);
                    if (response instanceof Error) {
                        res.send(response);
                    } else {
                        res.send(`Your request was successful: the server ${mode === "active" ? "created and compressed a new" : "retrieved and compressed the most recent"} back up. It was sent to ${recipient}.`);
                    }
                } else {
                    res.send(`Your request failed. '${mode}' is not a valid mode: please choose either 'active' or 'passive'`);
                }
            })
        });

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("backup"),
            secureHandler: this.authorizedAction(async ({ res }) => {
                const response = await sessionAgent.serverWorker.sendMonitorAction("backup");
                if (response instanceof Error) {
                    res.send(response);
                } else {
                    res.send("Your request was successful: the server successfully created a new back up.");
                }
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