import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { exec } from 'child_process';
// import { IBM_Recommender } from "../../client/apis/IBM_Recommender";
// import { Recommender } from "../Recommender";

// const recommender = new Recommender();
// recommender.testModel();
import executeImport from "../../scraping/buxton/final/BuxtonImporter";

export default class UtilManager extends ApiManager {

    protected initialize(register: Registration): void {

        // register({
        //     method: Method.POST,
        //     subscription: "/IBMAnalysis",
        //     secureHandler: async ({ req, res }) => res.send(await IBM_Recommender.analyze(req.body))
        // });

        // register({
        //     method: Method.POST,
        //     subscription: "/recommender",
        //     secureHandler: async ({ req, res }) => {
        //         const keyphrases = req.body.keyphrases;
        //         const wordvecs = await recommender.vectorize(keyphrases);
        //         let embedding: Float32Array = new Float32Array();
        //         if (wordvecs && wordvecs.dataSync()) {
        //             embedding = wordvecs.dataSync() as Float32Array;
        //         }
        //         res.send(embedding);
        //     }
        // });

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