import { red } from 'colors';
import * as rp from 'request-promise';

const pathTo = (relative: string) => `http://localhost:8983/solr/dash/${relative}`;

export namespace Search {

    export async function updateDocument(document: any) {
        try {
            return await rp.post(pathTo("update"), {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify([document])
            });
        } catch (e) {
            // console.warn("Search error: " + e + document);
        }
    }

    export async function updateDocuments(documents: any[]) {
        try {
            return await rp.post(pathTo("update"), {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(documents)
            });
        } catch (e) {
            // console.warn("Search error: ", e, documents);
        }
    }

    export async function search(query: any) {
        try {
            const output = await rp.get(pathTo("select"), { qs: query });
            const searchResults = JSON.parse(output);
            const { docs, numFound } = searchResults.response;
            const ids = docs.map((field: any) => field.id);
            return { ids, numFound, highlighting: searchResults.highlighting };
        } catch {
            return { ids: [], numFound: -1 };
        }
    }

    export async function clear() {
        try {
            await rp.post(pathTo("update"), {
                body: {
                    delete: {
                        query: "*:*"
                    }
                },
                json: true
            });
        } catch (e) {
            console.log(red("Unable to clear search..."));
            console.log(red(e.message));
        }
    }

    export async function deleteDocuments(docs: string[]) {
        const promises: rp.RequestPromise[] = [];
        const nToDelete = 1000;
        let index = 0;
        while (index < docs.length) {
            const count = Math.min(docs.length - index, nToDelete);
            const deleteIds = docs.slice(index, index + count);
            index += count;
            promises.push(rp.post(pathTo("update"), {
                body: {
                    delete: {
                        query: deleteIds.map(id => `id:"${id}"`).join(" ")
                    }
                },
                json: true
            }));
        }

        return Promise.all(promises);
    }
}