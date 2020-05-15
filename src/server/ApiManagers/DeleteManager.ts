import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied } from "../RouteManager";
import { WebSocket } from "../websocket";
import { Database } from "../database";
import rimraf = require("rimraf");
import { filesDirectory } from "..";
import { DashUploadUtils } from "../DashUploadUtils";
import { mkdirSync } from "fs";
import RouteSubscriber from "../RouteSubscriber";

export default class DeleteManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("delete").add("target?"),
            secureHandler: async ({ req, res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, "Cannot perform a delete operation outside of the development environment!");
                }

                const { target } = req.params;
                const { doDelete } = WebSocket;

                if (!target) {
                    await doDelete();
                } else {
                    let all = false;
                    switch (target) {
                        case "all":
                            all = true;
                        case "database":
                            await doDelete(false);
                            if (!all) break;
                        case "files":
                            rimraf.sync(filesDirectory);
                            mkdirSync(filesDirectory);
                            await DashUploadUtils.buildFileDirectories();
                            break;
                        default:
                            await Database.Instance.dropSchema(target);
                    }
                }

                res.redirect("/home");
            }
        });

    }

}