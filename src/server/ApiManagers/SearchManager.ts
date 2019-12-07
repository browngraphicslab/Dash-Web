import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { Search } from "../Search";
const findInFiles = require('find-in-files');
import * as path from 'path';
import { pathToDirectory, Directory } from "./UploadManager";
import { command_line, addBeforeExitHandler } from "../ActionUtilities";
import request = require('request-promise');
import { red, green, yellow, cyan } from "colors";

export class SearchManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/startSolr",
            onValidation: async ({ res }) => res.send((await SolrManager.SetRunning(true)) ? "Successfully started Solr!" : "Uh oh! Check the console for the error that occurred while starting Solr")
        });

        register({
            method: Method.GET,
            subscription: "/stopSolr",
            onValidation: async ({ res }) => res.send((await SolrManager.SetRunning(false)) ? "Successfully stopped Solr!" : "Uh oh! Check the console for the error that occurred while stopping Solr")
        });

        register({
            method: Method.GET,
            subscription: "/textsearch",
            onValidation: async ({ req, res }) => {
                const q = req.query.q;
                if (q === undefined) {
                    res.send([]);
                    return;
                }
                const results = await findInFiles.find({ 'term': q, 'flags': 'ig' }, pathToDirectory(Directory.text), ".txt$");
                const resObj: { ids: string[], numFound: number, lines: string[] } = { ids: [], numFound: 0, lines: [] };
                for (const result in results) {
                    resObj.ids.push(path.basename(result, ".txt").replace(/upload_/, ""));
                    resObj.lines.push(results[result].line);
                    resObj.numFound++;
                }
                res.send(resObj);
            }
        });

        register({
            method: Method.GET,
            subscription: "/search",
            onValidation: async ({ req, res }) => {
                const solrQuery: any = {};
                ["q", "fq", "start", "rows", "hl", "hl.fl"].forEach(key => solrQuery[key] = req.query[key]);
                if (solrQuery.q === undefined) {
                    res.send([]);
                    return;
                }
                const results = await Search.Instance.search(solrQuery);
                res.send(results);
            }
        });

    }

}

export namespace SolrManager {

    export async function initializeSolr() {
        console.log(cyan("\nInspecting Solr status..."));
        try {
            await request("http://localhost:8983");
            console.log(green('Solr already running\n'));
        } catch (e) {
            console.log(cyan('Initializing Solr...'));
            await SolrManager.SetRunning(true);
        } finally {
            addBeforeExitHandler(async () => SolrManager.SetRunning(false));
        }
    }

    export async function SetRunning(status: boolean): Promise<boolean> {
        const args = status ? "start" : "stop -p 8983";
        console.log(`Solr management: trying to ${args}`);
        try {
            console.log(await command_line(`solr.cmd ${args}`, "../../solr-8.1.1/bin"));
            return true;
        } catch (e) {
            console.log(red(`Solr management error: unable to ${args}`));
            if (status) {
                process.exit(0);
            }
            return false;
        }
    }

}