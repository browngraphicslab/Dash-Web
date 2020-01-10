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
            res.redirect("/home");
        };
    }

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("debug", "mode", "recipient"),
            secureHandler: this.authorizedAction(({ req }) => {
                const { mode, recipient } = req.params;
                if (["passive", "active"].includes(mode)) {
                    sessionAgent.serverWorker.sendMonitorAction("debug", { mode, recipient });
                }
            })
        });

        register({
            method: Method.GET,
            subscription: this.secureSubscriber("backup"),
            secureHandler: this.authorizedAction(() => sessionAgent.serverWorker.sendMonitorAction("backup"))
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