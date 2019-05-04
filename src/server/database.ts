import * as mongodb from 'mongodb';
import { Transferable } from './Message';

export class Database {
    public static DocumentsCollection = 'documents';
    public static Instance = new Database();
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/Dash';
    private currentWrites: { [id: string]: Promise<void> } = {};
    private db?: mongodb.Db;

    constructor() {
        this.MongoClient.connect(this.url, (err, client) => this.db = client.db());
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
                            if (err) {
                                console.log(err.message);
                                console.log(err.errmsg);
                            }
                            // if (res) {
                            //     console.log(JSON.stringify(res.result));
                            // }
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
        }
    }

    public delete(id: string, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).remove({ id: id });
    }

    public deleteAll(collectionName = Database.DocumentsCollection): Promise<any> {
        return new Promise(res =>
            this.db && this.db.collection(collectionName).deleteMany({}, res));
    }

    public insert(value: any, collectionName = Database.DocumentsCollection) {
        if ("id" in value) {
            value._id = value.id;
            delete value.id;
        }
        this.db && this.db.collection(collectionName).insertOne(value);
    }

    public getDocument(id: string, fn: (result?: Transferable) => void, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).findOne({ _id: id }, (err, result) => {
            if (result) {
                result.id = result._id;
                delete result._id;
                fn(result);
            } else {
                fn(undefined);
            }
        });
    }

    public getDocuments(ids: string[], fn: (result: Transferable[]) => void, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).find({ _id: { "$in": ids } }).toArray((err, docs) => {
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
    }

    public print() {
        console.log("db says hi!");
    }
}
