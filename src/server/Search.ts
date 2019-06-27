import * as rp from 'request-promise';
import { Database } from './database';
import { thisExpression } from 'babel-types';

export class Search {
    public static Instance = new Search();
    private url = 'http://localhost:8983/solr/';

    public async updateDocument(document: any) {
        try {
            const res = await rp.post(this.url + "dash/update", {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify([document])
            });
            return res;
        } catch (e) {
            // console.warn("Search error: " + e + document);
        }
    }

    public async search(query: string, start: number = 0) {
        try {
            const searchResults = JSON.parse(await rp.get(this.url + "dash/select", {
                qs: {
                    q: query,
                    fl: "id",
                    start: start
                }
            }));
            const fields = searchResults.response.docs;
            const ids = fields.map((field: any) => field.id);
            return ids;
        } catch {
            return [];
        }
    }

    public async clear() {
        try {
            return await rp.post(this.url + "dash/update", {
                body: {
                    delete: {
                        query: "*:*"
                    }
                },
                json: true
            });
        } catch { }
    }
}