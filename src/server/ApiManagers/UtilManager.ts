import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { exec } from 'child_process';
import { command_line } from "../ActionUtilities";
import RouteSubscriber from "../RouteSubscriber";
import { red } from "colors";

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
            secureHandler: async ({ res }) => {
                const cwd = './src/scraping/buxton';

                const onResolved = (stdout: string) => { console.log(stdout); res.redirect("/"); };
                const onRejected = (err: any) => { console.error(err.message); res.send(err); };
                const tryPython3 = (reason: any) => {
                    console.log("Initial scraper failed for the following reason:");
                    console.log(red(reason.Error));
                    console.log("Falling back to python3...");
                    return command_line('python3 scraper.py', cwd).then(onResolved, onRejected);
                };

                return command_line('python scraper.py', cwd).then(onResolved, tryPython3);
            },
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