import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { exec } from 'child_process';
import { command_line } from "../ActionUtilities";

export default class UtilManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/pull",
            onValidation: ({ res }) => {
                exec('"C:\\Program Files\\Git\\git-bash.exe" -c "git pull"', err => {
                    if (err) {
                        res.send(err.message);
                        return;
                    }
                    res.redirect("/");
                });
            }
        });

        register({
            method: Method.GET,
            subscription: "/buxton",
            onValidation: ({ res }) => {
                let cwd = '../scraping/buxton';

                let onResolved = (stdout: string) => { console.log(stdout); res.redirect("/"); };
                let onRejected = (err: any) => { console.error(err.message); res.send(err); };
                let tryPython3 = () => command_line('python3 scraper.py', cwd).then(onResolved, onRejected);

                command_line('python scraper.py', cwd).then(onResolved, tryPython3);
            },
        });

        register({
            method: Method.GET,
            subscription: "/version",
            onValidation: ({ res }) => {
                exec('"C:\\Program Files\\Git\\bin\\git.exe" rev-parse HEAD', (err, stdout) => {
                    if (err) {
                        res.send(err.message);
                        return;
                    }
                    res.send(stdout);
                });
            }
        });

    }

}