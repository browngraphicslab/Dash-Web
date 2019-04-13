import * as mongodb from 'mongodb';

export class Database {
    public static Instance = new Database();
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/Dash';
    private db?: mongodb.Db;

    constructor() {
        this.MongoClient.connect(this.url, (err, client) => this.db = client.db());
    }

    private currentWrites: { [_id: string]: Promise<void> } = {};

    public update(id: string, value: any, callback: () => void) {
        if (this.db) {
            let collection = this.db.collection('documents');
            const prom = this.currentWrites[id];
            const run = (promise: Promise<void>, resolve?: () => void) => {
                collection.updateOne({ _id: id }, { $set: value }, {
                    upsert: true
                }, (err, result) => {
                    if (err) {
                        console.log(err.message);
                        console.log(err.errmsg);
                    }
                    if (this.currentWrites[id] === promise) {
                        delete this.currentWrites[id];
                    }
                    if (resolve) {
                        resolve();
                    }
                    callback();
                });
            };

            let newProm: Promise<void> = new Promise<void>(resolve => run(newProm, resolve));
            this.currentWrites[id] = newProm;
            if (prom)
                prom.then(() => newProm);
            else newProm;
        }
    }

    public delete(id: string) {
        this.db && this.db.collection('documents').remove({ _id: id });
    }

    public deleteAll(collectionName: string = 'documents'): Promise<any> {
        return new Promise(res =>
            this.db && this.db.collection(collectionName).deleteMany({}, res));
    }

    public insert(kvpairs: any) {
        this.db && this.db.collection('documents').insertOne(kvpairs, (err: any, res: any) =>
            err // &&  console.log(err)
        );
    }

    public getDocument(id: string, fn: (res: any) => void) {
        this.db && this.db.collection('documents').findOne({ _id: id }, (err: any, result: any) =>
            fn(result ? result : undefined));
    }

    public getDocuments(ids: string[], fn: (res: any) => void) {
        this.db && this.db.collection('documents').find({ _id: { "$in": ids } }).toArray((err, docs) => {
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
