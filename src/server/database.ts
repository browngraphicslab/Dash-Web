import { action, configure } from 'mobx';
import * as mongodb from 'mongodb';
import { ObjectID } from 'mongodb';
import { Transferable } from './Message';
import { Utils } from '../Utils';

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

    public update(id: string, value: any) {
        if (this.db) {
            let collection = this.db.collection('documents');
            collection.update({ _id: id }, { $set: value }, {
                upsert: true
            });
        }
    }

    public delete(id: string) {
        if (this.db) {
            let collection = this.db.collection('documents');
            collection.remove({ _id: id });
        }
    }

    public deleteAll() {
        if (this.db) {
            let collection = this.db.collection('documents');
            collection.deleteMany({});
        }
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
                    console.log("Error");
                    console.log(err.message);
                    console.log(err.errmsg);
                    console.log(ids);
                    console.log(["afca93a8-c6bd-4b58-967e-07784c5b12c8"]);
                    console.log("MAKES SENSE: " + (ids instanceof Array));
                }
                console.log(typeof ids);
                console.log("DATABASE: " + docs);
                fn(docs);
            })
        };
    }

    public print() {
        console.log("db says hi!")
    }
}
