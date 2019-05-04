import * as rp from 'request-promise';
import { Database } from './database';
import { thisExpression } from 'babel-types';

export class Search {
    public static Instance = new Search();
    private url = 'http://localhost:8983/solr/';
    private client: any;

    constructor() {
        console.log("Search Instantiated!");
        var SolrNode = require('solr-node');
        this.client = new SolrNode({
            host: 'localhost',
            port: '8983',
            core: 'dash',
            protocol: 'http'
        });
        var strQuery = this.client.query().q('text:test');

        console.log(strQuery);

        // Search documents using strQuery
        // client.search(strQuery, (err: any, result: any) => {
        //     if (err) {
        //         console.log(err);
        //         return;
        //     }
        //     console.log('Response:', result.response);
        // });
    }


    public async updateDocument(document: any) {
        console.log("UPDATE: ", JSON.stringify(document));
        return rp.post(this.url + "dash/update", {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify([document])
        });
    }

    public async search(query: string) {
        const searchResults = JSON.parse(await rp.get(this.url + "dash/select", {
            qs: {
                q: query
            }
        }));
        const fields = searchResults.response.docs;
        const ids = fields.map((field: any) => field.id);
        return ids;
    }

    public async clear() {
        return rp.post(this.url + "dash/update", {
            body: {
                delete: {
                    query: "*:*"
                }
            },
            json: true
        });
    }
}