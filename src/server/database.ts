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
            collection.update({ _id: id }, { $set: value });
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

    public insert(kvpairs: any) {
        this.MongoClient.connect(this.url, { bufferMaxEntries: 1 }, (err, db) => {
            // console.log(kvpairs)
            let collection = db.db().collection('documents');
            collection.insertOne(kvpairs, (err: any, res: any) => {
                if (err) {
                    // console.log(err)
                    return
                }
                // console.log(kvpairs)
                // console.log("1 document inserted")
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

    public print() {
        console.log("db says hi!")
    }
}
