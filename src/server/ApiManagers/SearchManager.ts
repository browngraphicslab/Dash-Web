import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import { Search } from "../Search";
var findInFiles = require('find-in-files');
import * as path from 'path';
import { uploadDirectory } from "..";

export default class SearchManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: "/textsearch",
            onValidation: async ({ req, res }) => {
                let q = req.query.q;
                if (q === undefined) {
                    res.send([]);
                    return;
                }
                let results = await findInFiles.find({ 'term': q, 'flags': 'ig' }, uploadDirectory + "text", ".txt$");
                let resObj: { ids: string[], numFound: number, lines: string[] } = { ids: [], numFound: 0, lines: [] };
                for (var result in results) {
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
                let results = await Search.Instance.search(solrQuery);
                res.send(results);
            }
        });

    }

}