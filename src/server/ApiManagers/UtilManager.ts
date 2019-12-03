import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { exec } from 'child_process';
import { command_line } from "../ActionUtilities";
import RouteSubscriber from "../RouteSubscriber";

export default class UtilManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("environment").add("key"),
            onValidation: ({ req, res }) => res.send(process.env[req.params.key])
        });

        register({
            method: Method.GET,
            subscription: "/pull",
            onValidation: async ({ res }) => {
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
            onValidation: async ({ res }) => {
                const cwd = '../scraping/buxton';

                const onResolved = (stdout: string) => { console.log(stdout); res.redirect("/"); };
                const onRejected = (err: any) => { console.error(err.message); res.send(err); };
                const tryPython3 = () => command_line('python3 scraper.py', cwd).then(onResolved, onRejected);

                return command_line('python scraper.py', cwd).then(onResolved, tryPython3);
            },
        });

        register({
            method: Method.GET,
            subscription: "/version",
            onValidation: ({ res }) => {
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