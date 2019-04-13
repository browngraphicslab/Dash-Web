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

    public update(id: string, value: any, callback: () => void) {
        if (this.db) {
            let collection = this.db.collection('documents');
            const prom = this.currentWrites[id];
            let newProm: Promise<void>;
            const run = (): Promise<void> => {
                return new Promise<void>(resolve => {
                    collection.updateOne({ _id: id }, { $set: value }, {
                        upsert: true
                    }, (err, res) => {
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
            if (prom) {
                newProm = prom.then(run);
                this.currentWrites[id] = newProm;
            } else {
                newProm = run();
                this.currentWrites[id] = newProm;
            }
        }
    }

    public delete(id: string, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).remove({ id: id });
    }

    public deleteAll(collectionName = Database.DocumentsCollection): Promise<any> {
        return new Promise(res =>
            this.db && this.db.collection(collectionName).deleteMany({}, res));
    }

    public insert(kvpairs: any, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).insertOne(kvpairs, (err, res) =>
            err // &&  console.log(err)
        );
    }

    public getDocument(id: string, fn: (result?: Transferable) => void, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).findOne({ id: id }, (err, result) =>
            fn(result ? ({ id: result._id, type: result.type, data: result.data }) : undefined))
    }

    public getDocuments(ids: string[], fn: (result: Transferable[]) => void, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).find({ id: { "$in": ids } }).toArray((err, docs) => {
            if (err) {
                console.log(err.message);
                console.log(err.errmsg);
            }
            fn(docs.map(doc => ({ id: doc._id, type: doc.type, data: doc.data })));
        });
    }

    public print() {
        console.log("db says hi!");
    }
}
