import * as mongodb from 'mongodb';

export class Database {
    public static DocumentsCollection = 'documents';
    public static Instance = new Database();
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/Dash';
    private currentWrites: { [_id: string]: Promise<void> } = {};
    private db?: mongodb.Db;

    constructor() {
        this.MongoClient.connect(this.url, (err, client) => this.db = client.db());
    }

    public update(id: string, value: any, callback: () => void, collectionName = Database.DocumentsCollection) {
        if (this.db) {
            let collection = this.db.collection(collectionName);
            const prom = this.currentWrites[id];
            const run = (): Promise<void> => {
                let newProm = new Promise<void>(resolve => {
                    collection.updateOne({ _id: id }, { $set: value }, { upsert: true }
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
                return newProm;
            };
            this.currentWrites[id] = prom ? prom.then(run) : run();
        }
    }

    public delete(id: string, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).remove({ _id: id });
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

    public getDocument(id: string, fn: (res: any) => void, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).findOne({ _id: id }, (err, result) =>
            fn(result ? result : undefined));
    }

    public getDocuments(ids: string[], fn: (res: any) => void, collectionName = Database.DocumentsCollection) {
        this.db && this.db.collection(collectionName).find({ _id: { "$in": ids } }).toArray((err, docs) => {
            if (err) {
                console.log(err.message);
                console.log(err.errmsg);
            }
            fn(docs);
        });
    }

    public print() {
        console.log("db says hi!");
    }
}
