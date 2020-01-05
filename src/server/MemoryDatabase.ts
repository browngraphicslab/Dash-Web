import { IDatabase, DocumentsCollection, NewDocumentsCollection } from './IDatabase';
import { Transferable } from './Message';
import * as mongodb from 'mongodb';

export class MemoryDatabase implements IDatabase {

    private db: { [collectionName: string]: { [id: string]: any } } = {};

    private getCollection(collectionName: string) {
        let collection = this.db[collectionName];
        if (collection) {
            return collection;
        } else {
            return this.db[collectionName] = {};
        }
    }

    public update(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, _upsert?: boolean, collectionName = DocumentsCollection): Promise<void> {
        const collection = this.getCollection(collectionName);
        collection[id] = { ...collection[id], ...value };
        callback(null, {} as any);
        return Promise.resolve(undefined);
    }

    public replace(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, upsert?: boolean, collectionName = DocumentsCollection): void {
        this.update(id, value, callback, upsert, collectionName);
    }

    public delete(query: any, collectionName?: string): Promise<mongodb.DeleteWriteOpResultObject>;
    public delete(id: string, collectionName?: string): Promise<mongodb.DeleteWriteOpResultObject>;
    public delete(id: any, collectionName = DocumentsCollection): Promise<mongodb.DeleteWriteOpResultObject> {
        const i = id["_id"] ?? id;
        delete this.getCollection(collectionName)[i];

        return Promise.resolve({} as any);
    }

    public deleteAll(collectionName = DocumentsCollection, _persist = true): Promise<any> {
        delete this.db[collectionName];
        return Promise.resolve();
    }

    public insert(value: any, collectionName = DocumentsCollection): Promise<void> {
        const id = value._id;
        this.getCollection(collectionName)[id] = value;
        return Promise.resolve();
    }

    public getDocument(id: string, fn: (result?: Transferable) => void, collectionName = NewDocumentsCollection): void {
        fn(this.getCollection(collectionName)[id]);
    }
    public getDocuments(ids: string[], fn: (result?: Transferable[]) => void, collectionName = DocumentsCollection): void {
        fn(ids.map(id => this.getCollection(collectionName)[id]));
    }

    public async visit(ids: string[], fn: (result: any) => string[] | Promise<string[]>, collectionName = NewDocumentsCollection): Promise<void> {
        const visited = new Set<string>();
        while (ids.length) {
            const count = Math.min(ids.length, 1000);
            const index = ids.length - count;
            const fetchIds = ids.splice(index, count).filter(id => !visited.has(id));
            if (!fetchIds.length) {
                continue;
            }
            const docs = await new Promise<{ [key: string]: any }[]>(res => this.getDocuments(fetchIds, res, collectionName));
            for (const doc of docs) {
                const id = doc.id;
                visited.add(id);
                ids.push(...(await fn(doc)));
            }
        }
    }
}
