import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { exec } from 'child_process';
import RouteSubscriber from "../RouteSubscriber";
import { red } from "colors";
import executeImport from "../../scraping/buxton/final/BuxtonImporter";

export default class UtilManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("environment").add("key"),
            secureHandler: ({ req, res }) => {
                const { key } = req.params;
                const value = process.env[key];
                if (!value) {
                    console.log(red(`process.env.${key} is not defined.`));
                }
                return res.send(value);
            }
        });

        register({
            method: Method.GET,
            subscription: "/pull",
            secureHandler: async ({ res }) => {
                return new Promise<void>(resolve => {
                    exec('"C:\\Program Files\\Git\\git-bash.exe" -c "git pull"', err => {
                        if (err) {
                            res.send(err.message);
                            return;
                        }
                        res.redirect("/");
                        resolve();
                    });
                });
            }
        });

        register({
            method: Method.GET,
            subscription: "/buxton",
            secureHandler: async ({ req, res }) => {
                req.setTimeout(300000);
                res.send(await executeImport());
            }
        });

        register({
            method: Method.GET,
            subscription: "/version",
            secureHandler: ({ res }) => {
                return new Promise<void>(resolve => {
                    exec('"C:\\Program Files\\Git\\bin\\git.exe" rev-parse HEAD', (err, stdout) => {
                        if (err) {
                            res.send(err.message);
                            return;
                        }
                        res.send(stdout);
                    });
                    resolve();
                });
            }
        });

    }

}