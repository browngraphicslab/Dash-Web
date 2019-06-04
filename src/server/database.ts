import * as mongodb from 'mongodb';
import { Transferable } from './Message';

export class Database {
    public static DocumentsCollection = 'documents';
    public static Instance = new Database();
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/Dash';
    private currentWrites: { [id: string]: Promise<void> } = {};
    private db?: mongodb.Db;
    private onConnect: (() => void)[] = [];

    constructor() {
        this.MongoClient.connect(this.url, (err, client) => {
            this.db = client.db();
            this.onConnect.forEach(fn => fn());
        });
    }

    public update(id: string, value: any, callback: () => void, upsert = true, collectionName = Database.DocumentsCollection) {
        if (this.db) {
            let collection = this.db.collection(collectionName);
            const prom = this.currentWrites[id];
            let newProm: Promise<void>;
            const run = (): Promise<void> => {
                return new Promise<void>(resolve => {
                    collection.updateOne({ _id: id }, value, { upsert }
                        , (err, res) => {
                            if (this.currentWrites[id] === newProm) {
                                delete this.currentWrites[id];
                            }
                            resolve();
                            callback();
                        });
                });
            };
            newProm = prom ? prom.then(run) : run();
            this.currentWrites[id] = newProm;
        } else {
            this.onConnect.push(() => this.update(id, value, callback, upsert, collectionName));
        }
    }

    public delete(id: string, collectionName = Database.DocumentsCollection) {
        if (this.db) {
            this.db.collection(collectionName).remove({ id: id });
        } else {
            this.onConnect.push(() => this.delete(id, collectionName));
        }
    }

    public deleteAll(collectionName = Database.DocumentsCollection): Promise<any> {
        return new Promise(res => {
            if (this.db) {
                this.db.collection(collectionName).deleteMany({}, res);
            } else {
                this.onConnect.push(() => this.db && this.db.collection(collectionName).deleteMany({}, res));
            }
        });
    }

    public insert(value: any, collectionName = Database.DocumentsCollection) {
        if (this.db) {
            if ("id" in value) {
                value._id = value.id;
                delete value.id;
            }
            const id = value._id;
            const collection = this.db.collection(collectionName);
            const prom = this.currentWrites[id];
            let newProm: Promise<void>;
            const run = (): Promise<void> => {
                return new Promise<void>(resolve => {
                    collection.insertOne(value, (err, res) => {
                        if (this.currentWrites[id] === newProm) {
                            delete this.currentWrites[id];
                        }
                        resolve();
                    });
                });
            };
            newProm = prom ? prom.then(run) : run();
            this.currentWrites[id] = newProm;
        } else {
            this.onConnect.push(() => this.insert(value, collectionName));
        }
    }

    public getDocument(id: string, fn: (result?: Transferable) => void, collectionName = Database.DocumentsCollection) {
        if (this.db) {
            this.db.collection(collectionName).findOne({ _id: id }, (err, result) => {
                if (result) {
                    result.id = result._id;
                    delete result._id;
                    fn(result);
                } else {
                    fn(undefined);
                }
            });
        } else {
            this.onConnect.push(() => this.getDocument(id, fn, collectionName));
        }
    }

    public getDocuments(ids: string[], fn: (result: Transferable[]) => void, collectionName = Database.DocumentsCollection) {
        if (this.db) {
            this.db.collection(collectionName).find({ _id: { "$in": ids } }).toArray((err, docs) => {
                if (err) {
                    console.log(err.message);
                    console.log(err.errmsg);
                }
                fn(docs.map(doc => {
                    doc.id = doc._id;
                    delete doc._id;
                    return doc;
                }));
            });
        } else {
            this.onConnect.push(() => this.getDocuments(ids, fn, collectionName));
        }
    }

    public query(query: any): Promise<mongodb.Cursor> {
        if (this.db) {
            return Promise.resolve<mongodb.Cursor>(this.db.collection('newDocuments').find(query));
        } else {
            return new Promise<mongodb.Cursor>(res => {
                this.onConnect.push(() => res(this.query(query)));
            });
        }
    }

    public print() {
        console.log("db says hi!");
    }
}
