import { exec } from "child_process";
import { cyan, green, red, yellow } from "colors";
import * as path from 'path';
import { log_execution } from "../ActionUtilities";
import { Database } from "../database";
import { Method } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { Search } from "../Search";
import ApiManager, { Registration } from "./ApiManager";
import { Directory, pathToDirectory } from "./UploadManager";
const findInFiles = require('find-in-files');

export class SearchManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("solr").add("action"),
            secureHandler: async ({ req, res }) => {
                const { action } = req.params;
                switch (action) {
                    case "start":
                    case "stop":
                        const status = req.params.action === "start";
                        SolrManager.SetRunning(status);
                        break;
                    case "update":
                        await SolrManager.update();
                        break;
                    default:
                        console.log(yellow(`${action} is an unknown solr operation.`));
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
                const resObj: { ids: string[], numFound: number, lines: string[] } = { ids: [], numFound: 0, lines: [] };
                let results: any;
                const dir = pathToDirectory(Directory.text);
                results = await findInFiles.find({ 'term': q, 'flags': 'ig' }, dir, ".txt$");
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
            subscription: "/dashsearch",
            secureHandler: async ({ req, res }) => {
                const solrQuery: any = {};
                ["q", "fq", "start", "rows", "sort", "hl.maxAnalyzedChars", "hl", "hl.fl"].forEach(key => solrQuery[key] = req.query[key]);
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

    export function SetRunning(status: boolean) {
        const args = status ? "start" : "stop -p 8983";
        console.log(`solr management: trying to ${args}`);
        exec(`solr ${args}`, { cwd: "./solr-8.3.1/bin" }, (error, stdout, stderr) => {
            if (error) {
                console.log(red(`solr management error: unable to ${args} server`));
                console.log(red(error.message));
            }
            console.log(cyan(stdout));
            console.log(yellow(stderr));
        });
        if (status) {
            console.log(cyan("Start script is executing: please allow 15 seconds for solr to start on port 8983."));
        }
    }

    export async function update() {
        console.log(green("Beginning update..."));
        await log_execution<void>({
            startMessage: "Clearing existing Solr information...",
            endMessage: "Solr information successfully cleared",
            action: Search.clear,
            color: cyan
        });
        const cursor = await log_execution({
            startMessage: "Connecting to and querying for all documents from database...",
            endMessage: ({ result, error }) => {
                const success = error === null && result !== undefined;
                if (!success) {
                    console.log(red("Unable to connect to the database."));
                    process.exit(0);
                }
                return "Connection successful and query complete";
            },
            action: () => Database.Instance.query({}),
            color: yellow
        });
        const updates: any[] = [];
        let numDocs = 0;
        function updateDoc(doc: any) {
            numDocs++;
            if ((numDocs % 50) === 0) {
                console.log(`Batch of 50 complete, total of ${numDocs}`);
            }
            if (doc.__type !== "Doc") {
                return;
            }
            const fields = doc.fields;
            if (!fields) {
                return;
            }
            const update: any = { id: doc._id };
            let dynfield = false;
            for (const key in fields) {
                const value = fields[key];
                const term = ToSearchTerm(value);
                if (term !== undefined) {
                    const { suffix, value } = term;
                    if (key.endsWith('lastModified')) {
                        update["lastModified" + suffix] = value;
                    }
                    update[key + suffix] = value;
                    dynfield = true;
                }
            }
            if (dynfield) {
                updates.push(update);
            }
        }
        await cursor?.forEach(updateDoc);
        const result = await log_execution({
            startMessage: `Dispatching updates for ${updates.length} documents`,
            endMessage: "Dispatched updates complete",
            action: () => Search.updateDocuments(updates),
            color: cyan
        });
        try {
            if (result) {
                const { status } = JSON.parse(result).responseHeader;
                console.log(status ? red(`Failed with status code (${status})`) : green("Success!"));
            } else {
                console.log(red("Solr is likely not running!"));
            }
        } catch (e) {
            console.log(red("Error:"));
            console.log(e);
            console.log("\n");
        }
        await cursor?.close();
    }

    const suffixMap: { [type: string]: (string | [string, string | ((json: any) => any)]) } = {
        "number": "_n",
        "string": "_t",
        "boolean": "_b",
        "image": ["_t", "url"],
        "video": ["_t", "url"],
        "pdf": ["_t", "url"],
        "audio": ["_t", "url"],
        "web": ["_t", "url"],
        "date": ["_d", value => new Date(value.date).toISOString()],
        "proxy": ["_i", "fieldId"],
        "prefetch_proxy": ["_i", "fieldId"],
        "list": ["_l", list => {
            const results = [];
            for (const value of list.fields) {
                const term = ToSearchTerm(value);
                if (term) {
                    results.push(term.value);
                }
            }
            return results.length ? results : null;
        }]
    };

    function ToSearchTerm(val: any): { suffix: string, value: any } | undefined {
        if (val === null || val === undefined) {
            return;
        }
        const type = val.__type || typeof val;
        let suffix = suffixMap[type];
        if (!suffix) {
            return;
        }

        if (Array.isArray(suffix)) {
            const accessor = suffix[1];
            if (typeof accessor === "function") {
                val = accessor(val);
            } else {
                val = val[accessor];
            }
            suffix = suffix[0];
        }

        return { suffix, value: val };
    }

}