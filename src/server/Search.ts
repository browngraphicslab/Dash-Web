import * as rp from 'request-promise';
import { Database } from './database';
import { thisExpression } from 'babel-types';

export class Search {
    public static Instance = new Search();
    private url = 'http://localhost:8983/solr/';

    public async updateDocument(document: any) {
        try {
            return rp.post(this.url + "dash/update", {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify([document])
            });
        } catch { }
    }

    public async search(query: string) {
        try {
            const searchResults = JSON.parse(await rp.get(this.url + "dash/select", {
                qs: {
                    q: query
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
            return rp.post(this.url + "dash/update", {
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