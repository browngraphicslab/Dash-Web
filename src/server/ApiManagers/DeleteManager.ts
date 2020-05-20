import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied, PublicHandler } from "../RouteManager";
import { WebSocket } from "../Websocket/Websocket";
import { Database } from "../database";
import rimraf = require("rimraf");
import { pathToDirectory, Directory } from "./UploadManager";
import { filesDirectory } from "..";
import { DashUploadUtils } from "../DashUploadUtils";
import { mkdirSync } from "fs";

export default class DeleteManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/delete",
            secureHandler: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await WebSocket.deleteFields();
                res.redirect("/home");
            }
        });

        register({
            method: Method.GET,
            subscription: "/deleteAll",
            secureHandler: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await WebSocket.deleteAll();
                res.redirect("/home");
            }
        });

        register({
            method: Method.GET,
            subscription: "/deleteAssets",
            secureHandler: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                rimraf.sync(filesDirectory);
                mkdirSync(filesDirectory);
                await DashUploadUtils.buildFileDirectories();
                res.redirect("/delete");
            }
        });

        register({
            method: Method.GET,
            subscription: "/deleteWithAux",
            secureHandler: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await Database.Auxiliary.DeleteAll();
                res.redirect("/delete");
            }
        });

        register({
            method: Method.GET,
            subscription: "/deleteWithGoogleCredentials",
            secureHandler: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await Database.Auxiliary.GoogleAuthenticationToken.DeleteAll();
                res.redirect("/delete");
            }
        });

    }

}

const deletionPermissionError = "Cannot perform a delete operation outside of the development environment!";
