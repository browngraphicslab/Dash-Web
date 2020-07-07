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
                if (existsSync(serverPathToFile(Directory.hypothesis, user.id))) {
                    const read = readFileSync(serverPathToFile(Directory.hypothesis, user.id), "base64") || "";
                    console.log("READ = " + read);
                    res.send(read);
                } else res.send("");
            }
        });

        register({
            method: Method.POST,
            subscription: "/writeHypothesisAccessToken",
            secureHandler: async ({ user, req, res }) => {
                const write = req.body.authenticationCode;
                console.log("WRITE = " + write);
                res.send(await writeFile(serverPathToFile(Directory.hypothesis, user.id), write, "base64", () => { }));
            }
        });

        register({
            method: Method.GET,
            subscription: "/revokeHypothesisAccessToken",
            secureHandler: async ({ user, res }) => {
                await Database.Auxiliary.GoogleAccessToken.Revoke("dash-hyp-" + user.id);
                res.send();
            }
        });

    }
}