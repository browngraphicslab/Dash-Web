import * as rp from 'request-promise';
import { Database } from './database';

export class Search {
    public static Instance = new Search();
    private url = 'http://localhost:8983/solr/';

    public updateDocument(document: any): rp.RequestPromise {
        return rp.post(this.url + "dash/update/json/docs", {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(document)
        });
    }

    public async search(query: string) {
        console.log("____________________________");
        console.log(query);
        const searchResults = JSON.parse(await rp.get(this.url + "dash/select", {
            qs: {
                q: query
            }
        }));
        const fields = searchResults.response.docs;
        const ids = fields.map((field: any) => field.id);
        const docs = await Database.Instance.searchQuery(ids);
        const docIds = docs.map((doc: any) => doc._id);
        return docIds;
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