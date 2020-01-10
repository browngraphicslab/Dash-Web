import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied, AuthorizedCore, SecureHandler } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { sessionAgent } from "..";

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
            handler(core);
        };
    }

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("debug", "mode", "recipient"),
            secureHandler: this.authorizedAction(({ req, res }) => {
                const { mode, recipient } = req.params;
                if (["passive", "active"].includes(mode)) {
                    sessionAgent.serverWorker.sendMonitorAction("debug", { mode, recipient });
                    res.send(`Your request was successful: the server is ${mode === "active" ? "creating and compressing a new" : "retrieving and compressing the most recent"} back up. It will be sent to ${recipient}.`);
                } else {
                    res.send(`Your request failed. '${mode}' is not a valid mode: please choose either 'active' or 'passive'`);
                }
            })
        });

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("backup"),
            secureHandler: this.authorizedAction(({ res }) => {
                sessionAgent.serverWorker.sendMonitorAction("backup");
                res.send(`Your request was successful: the server is creating a new back up.`);
            })
        });

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("kill"),
            secureHandler: this.authorizedAction(({ res }) => {
                res.send("<img src='https://media.giphy.com/media/NGIfqtcS81qi4/giphy.gif' style='width:100%;height:100%;'/>");
                sessionAgent.killSession("an authorized user has manually ended the server session via the /kill route", true);
            })
        });

    }

}