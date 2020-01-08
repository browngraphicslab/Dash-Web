import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { Search } from "../Search";
const findInFiles = require('find-in-files');
import * as path from 'path';
import { pathToDirectory, Directory } from "./UploadManager";
import { command_line } from "../ActionUtilities";
import request = require('request-promise');
import { red } from "colors";
import RouteSubscriber from "../RouteSubscriber";
import { execSync } from "child_process";

export class SearchManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("solr").add("action"),
            secureHandler: async ({ req, res }) => {
                const { action } = req.params;
                if (["start", "stop"].includes(action)) {
                    const status = req.params.action === "start";
                    const success = await SolrManager.SetRunning(status);
                    console.log(success ? `Successfully ${status ? "started" : "stopped"} Solr!` : `Uh oh! Check the console for the error that occurred while ${status ? "starting" : "stopping"} Solr`);
                }
                res.redirect("/home");
            }
        });

        register({
            method: Method.GET,
            subscription: "/textsearch",
            secureHandler: async ({ req, res }) => {
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
            secureHandler: async ({ req, res }) => {
                const solrQuery: any = {};
                ["q", "fq", "start", "rows", "hl", "hl.fl"].forEach(key => solrQuery[key] = req.query[key]);
                if (solrQuery.q === undefined) {
                    res.send([]);
                    return;
                }
                const results = await Search.search(solrQuery);
                res.send(results);
            }
        });

    }

}

export namespace SolrManager {

    export async function SetRunning(status: boolean): Promise<boolean> {
        const args = status ? "start" : "stop -p 8983";
        try {
            console.log(`Solr management: trying to ${args}`);
            console.log(execSync(`${process.platform === "win32" ? "solr.cmd" : "solr"} ${args}`, { cwd: "./solr-8.3.1/bin" }).toString());
            return true;
        } catch (e) {
            console.log(red(`Solr management error: unable to ${args}`));
            console.log(e);
            return false;
        }
    }

}