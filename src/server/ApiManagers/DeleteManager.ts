import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied } from "../RouteManager";
import { WebSocket } from "../websocket";
import { Database } from "../database";
import rimraf = require("rimraf");
import { filesDirectory, AdminPriviliges } from "..";
import { DashUploadUtils } from "../DashUploadUtils";
import { mkdirSync } from "fs";
import RouteSubscriber from "../RouteSubscriber";

export default class DeleteManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("delete").add("target?"),
            secureHandler: async ({ req, res, isRelease, user: { id } }) => {
                const { target } = req.params;
                if (isRelease && process.env.PASSWORD) {
                    if (AdminPriviliges.get(id)) {
                        AdminPriviliges.delete(id);
                    } else {
                        return res.redirect(`/admin/delete${target ? `:${target}` : ``}`);
                    }
                }

                this.doDelete(target);
                res.redirect("/home");
            }
        });

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("admin").add("previous_target"),
            secureHandler: ({ res }) => res.render("admin.pug", { title: "Enter Administrator Password" })
        })

        register({
            method: Method.POST,
            subscription: new RouteSubscriber("admin").add("previous_target"),
            secureHandler: async ({ req, res, isRelease, user: { id } }) => {
                const { PASSWORD } = process.env;
                if (!(isRelease && PASSWORD)) {
                    return res.redirect("/home");
                }
                const { password } = req.body;
                const { previous_target } = req.params;
                let redirect: string;
                if (password === PASSWORD) {
                    AdminPriviliges.set(id, true);
                    redirect = `/${previous_target.replace(":", "/")}`;
                } else {
                    redirect = `/admin/${previous_target}`;
                }
                res.redirect(redirect);
            }
        })

    }


    private doDelete = async (target?: string) => {
        if (!target) {
            await WebSocket.doDelete();
        } else {
            let all = false;
            switch (target) {
                case "all":
                    all = true;
                case "database":
                    await WebSocket.doDelete(false);
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
    }

}