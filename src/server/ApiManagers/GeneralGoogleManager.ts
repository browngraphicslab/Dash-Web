import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied } from "../RouteManager";
import { uploadDirectory } from "..";
import { path } from "animejs";
import { RouteStore } from "../RouteStore";
import { GoogleApiServerUtils } from "../apis/google/GoogleApiServerUtils";
import { Database } from "../database";

const deletionPermissionError = "Cannot perform specialized delete outside of the development environment!";

export default class GeneralGoogleManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: RouteStore.readGoogleAccessToken,
            onValidation: async ({ user, res }) => {
                const userId = user.id;
                const token = await GoogleApiServerUtils.retrieveAccessToken(userId);
                if (!token) {
                    return res.send(GoogleApiServerUtils.generateAuthenticationUrl());
                }
                return res.send(token);
            }
        });

        register({
            method: Method.POST,
            subscription: RouteStore.writeGoogleAccessToken,
            onValidation: async ({ user, req, res }) => {
                res.send(await GoogleApiServerUtils.processNewUser(user.id, req.body.authenticationCode));
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