import { action, configure } from 'mobx';
import * as mongodb from 'mongodb';
import { ObjectID } from 'mongodb';
import { Transferable } from './Message';
import { Utils } from '../Utils';

export class Database {
    public static Instance = new Database()
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/Dash';

    public update(id: string, value: any) {
        this.MongoClient.connect(this.url, { bufferMaxEntries: 1 }, (err, db) => {
            let collection = db.db().collection('documents');
            collection.update({ _id: id }, { $set: value }, {
                upsert: true
            });
            db.close();
        });
    }

    public delete(id: string) {
        this.MongoClient.connect(this.url, { bufferMaxEntries: 1 }, (err, db) => {
            let collection = db.db().collection('documents');
            collection.remove({ _id: id });
            db.close();
        });
    }

    public deleteAll() {
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.db().collection('documents');
            collection.deleteMany({});
        })
    }

    public insert(kvpairs: any) {
        this.MongoClient.connect(this.url, { bufferMaxEntries: 1 }, (err, db) => {
            let collection = db.db().collection('documents');
            collection.insertOne(kvpairs, (err: any, res: any) => {
                if (err) {
                    // console.log(err)
                    return
                }
            });
            db.close();
        });
    }

    public getDocument(id: string, fn: (res: any) => void) {
        var result: JSON;
        this.MongoClient.connect(this.url, {
            bufferMaxEntries: 1
        }, (err, db) => {
            if (err) {
                console.log(err)
                return undefined
            }
            let collection = db.db().collection('documents');
            collection.findOne({ _id: id }, (err: any, res: any) => {
                result = res
                if (!result) {
                    fn(undefined)
                }
                fn(result)
            })
            db.close();
        });
    }

    public getDocuments(ids: string[], fn: (res: any) => void) {
        var result: JSON;
        this.MongoClient.connect(this.url, {
            bufferMaxEntries: 1
        }, (err, db) => {
            if (err) {
                console.log(err)
                return undefined
            }
            let collection = db.db().collection('documents');
            let cursor = collection.find({ _id: { "$in": ids } })
            cursor.toArray((err, docs) => {
                fn(docs);
            })
            db.close();
        });
    }

    public print() {
        console.log("db says hi!")
    }
}
