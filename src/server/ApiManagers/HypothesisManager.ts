import ApiManager, { Registration } from "./ApiManager";
import { Method, _permission_denied } from "../RouteManager";
import { GoogleApiServerUtils } from "../apis/google/GoogleApiServerUtils";
import { Database } from "../database";
import { writeFile, readFile, readFileSync, existsSync } from "fs";
import { serverPathToFile, Directory } from "./UploadManager";

export default class HypothesisManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/readHypothesisAccessToken",
            secureHandler: async ({ user, res }) => {
                const credentials = await Database.Auxiliary.HypothesisAccessToken.Fetch(user.id);
                res.send(credentials ? { username: credentials.hypothesisUsername, apiKey: credentials.hypothesisApiKey } : "");
            }
        });

        register({
            method: Method.POST,
            subscription: "/writeHypothesisAccessToken",
            secureHandler: async ({ user, req, res }) => {
                await Database.Auxiliary.HypothesisAccessToken.Write(user.id, req.body.authenticationCode, req.body.hypothesisUsername);
                res.send();
            }
        });

        register({
            method: Method.GET,
            subscription: "/revokeHypothesisAccessToken",
            secureHandler: async ({ user, res }) => {
                await Database.Auxiliary.HypothesisAccessToken.Revoke(user.id);
                res.send();
            }
        });

    }
}