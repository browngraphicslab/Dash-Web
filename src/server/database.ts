import * as mongodb from 'mongodb';

export class Database {
    public static Instance = new Database()
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/Dash';
    private db?: mongodb.Db;

    constructor() {
        this.MongoClient.connect(this.url, (err, client) => {
            this.db = client.db()
        })
    }

    private currentWrites: { [_id: string]: Promise<void> } = {};

    public update(id: string, value: any, callback: () => void) {
        if (this.db) {
            let collection = this.db.collection('documents');
            const prom = this.currentWrites[id];
            const run = (resolve?: () => void) => {
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
                    if (resolve) {
                        resolve();
                    }
                    callback();
                });
            }
            if (prom) {
                const newProm = prom.then(() => {
                    if (this.currentWrites[id] === newProm) {
                        delete this.currentWrites[id];
                    }
                    run();
                });
                this.currentWrites[id] = newProm;
            } else {
                this.currentWrites[id] = new Promise<void>(res => run(res));
            }
        }
    }

    public delete(id: string) {
        if (this.db) {
            let collection = this.db.collection('documents');
            collection.remove({ _id: id });
        }
    }

    public deleteAll(collectionName: string = 'documents'): Promise<any> {
        return new Promise(res => {
            if (this.db) {
                let collection = this.db.collection(collectionName);
                collection.deleteMany({}, res);
            }
        })
    }

    public insert(kvpairs: any) {
        if (this.db) {
            let collection = this.db.collection('documents');
            collection.insertOne(kvpairs, (err: any, res: any) => {
                if (err) {
                    // console.log(err)
                    return
                }
            });
        }
    }

    public getDocument(id: string, fn: (res: any) => void) {
        var result: JSON;
        if (this.db) {
            let collection = this.db.collection('documents');
            collection.findOne({ _id: id }, (err: any, res: any) => {
                result = res
                if (!result) {
                    fn(undefined)
                }
                fn(result)
            })
        };
    }

    public getDocuments(ids: string[], fn: (res: any) => void) {
        if (this.db) {
            let collection = this.db.collection('documents');
            let cursor = collection.find({ _id: { "$in": ids } })
            cursor.toArray((err, docs) => {
                if (err) {
                    console.log(err.message);
                    console.log(err.errmsg);
                }
                fn(docs);
            })
        };
    }

    public print() {
        console.log("db says hi!")
    }
}
