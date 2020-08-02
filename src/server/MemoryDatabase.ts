import { DH_CHECK_P_NOT_SAFE_PRIME } from 'constants';
import * as mongodb from 'mongodb';
import { DocumentsCollection, IDatabase } from './IDatabase';
import { Transferable } from './Message';

export class MemoryDatabase implements IDatabase {

    private db: { [collectionName: string]: { [id: string]: any } } = {};

    private getCollection(collectionName: string) {
        const collection = this.db[collectionName];
        if (collection) {
            return collection;
        } else {
            return this.db[collectionName] = {};
        }
    }

    public getCollectionNames() {
        return Promise.resolve(Object.keys(this.db));
    }

    public update(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, _upsert?: boolean, collectionName = DocumentsCollection): Promise<void> {
        const collection = this.getCollection(collectionName);
        const set = "$set";
        if (set in value) {
            let currentVal = collection[id] ?? (collection[id] = {});
            const val = value[set];
            for (const key in val) {
                const keys = key.split(".");
                for (let i = 0; i < keys.length - 1; i++) {
                    const k = keys[i];
                    if (typeof currentVal[k] === "object") {
                        currentVal = currentVal[k];
                    } else {
                        currentVal[k] = {};
                        currentVal = currentVal[k];
                    }
                }
                currentVal[keys[keys.length - 1]] = val[key];
            }
        } else {
            collection[id] = value;
        }
        callback(null as any, {} as any);
        return Promise.resolve(undefined);
    }

    public updateMany(query: any, update: any, collectionName = DocumentsCollection): Promise<mongodb.WriteOpResult> {
        throw new Error("Can't updateMany a MemoryDatabase");
    }

    public replace(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, upsert?: boolean, collectionName = DocumentsCollection): void {
        this.update(id, value, callback, upsert, collectionName);
    }

    public delete(query: any, collectionName?: string): Promise<mongodb.DeleteWriteOpResultObject>;
    public delete(id: string, collectionName?: string): Promise<mongodb.DeleteWriteOpResultObject>;
    public delete(id: any, collectionName = DocumentsCollection): Promise<mongodb.DeleteWriteOpResultObject> {
        const i = id.id ?? id;
        delete this.getCollection(collectionName)[i];

        return Promise.resolve({} as any);
    }

    public async dropSchema(...schemaNames: string[]): Promise<any> {
        const existing = await this.getCollectionNames();
        let valid: string[];
        if (schemaNames.length) {
            valid = schemaNames.filter(collection => existing.includes(collection));
        } else {
            valid = existing;
        }
        valid.forEach(schemaName => delete this.db[schemaName]);
        return Promise.resolve();
    }

    public insert(value: any, collectionName = DocumentsCollection): Promise<void> {
        const id = value.id;
        this.getCollection(collectionName)[id] = value;
        return Promise.resolve();
    }

    public getDocument(id: string, fn: (result?: Transferable) => void, collectionName = DocumentsCollection): void {
        fn(this.getCollection(collectionName)[id]);
    }
    public getDocuments(ids: string[], fn: (result: Transferable[]) => void, collectionName = DocumentsCollection): void {
        fn(ids.map(id => this.getCollection(collectionName)[id]));
    }

    public async visit(ids: string[], fn: (result: any) => string[] | Promise<string[]>, collectionName = DocumentsCollection): Promise<void> {
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

    public query(): Promise<mongodb.Cursor> {
        throw new Error("Can't query a MemoryDatabase");
    }
}
