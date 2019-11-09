import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied } from "../RouteManager";
import { RouteStore } from "../RouteStore";
import { WebSocket } from "../Websocket/Websocket";
import { Database } from "../database";

export default class DeleteManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: RouteStore.delete,
            onValidation: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await WebSocket.deleteFields();
                res.redirect(RouteStore.home);
            }
        });

        register({
            method: Method.GET,
            subscription: RouteStore.deleteAll,
            onValidation: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await WebSocket.deleteAll();
                res.redirect(RouteStore.home);
            }
        });


        register({
            method: Method.GET,
            subscription: "/deleteWithAux",
            onValidation: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await Database.Auxiliary.DeleteAll();
                res.redirect(RouteStore.delete);
            }
        });

        register({
            method: Method.GET,
            subscription: "/deleteWithGoogleCredentials",
            onValidation: async ({ res, isRelease }) => {
                if (isRelease) {
                    return _permission_denied(res, deletionPermissionError);
                }
                await Database.Auxiliary.GoogleAuthenticationToken.DeleteAll();
                res.redirect(RouteStore.delete);
            }
        });


    }

}

const deletionPermissionError = "Cannot perform a delete operation outside of the development environment!";
