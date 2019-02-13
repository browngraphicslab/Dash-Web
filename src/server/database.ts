import { action, configure } from 'mobx';
import * as mongodb from 'mongodb';
import { ObjectID } from 'mongodb';
import { Transferable } from './Message';
import { Utils } from '../Utils';

export class Database {
    public static Instance = new Database()
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/Dash';

    public update(id: mongodb.ObjectID, value: any) {
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.db().collection('documents');
            collection.update({ _id: id }, { $set: value });
            db.close();
        });
    }

    public delete(id: string) {
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.db().collection('documents');
            collection.remove({ _id: id });
            db.close();
        });
    }

    public insert(kvpairs: any) {
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.db().collection('documents');
            collection.insertOne(kvpairs, () => { });
            db.close();
        });
    }

    public getDocument(id: mongodb.ObjectID): string | undefined {
        var result: JSON;
        this.MongoClient.connect(this.url, (err, db) => {
            if (err) {
                console.log(err)
                return undefined
            }
            let collection = db.db().collection('documents');
            collection.findOne({ _id: Utils.GenerateDeterministicGuid(id.toHexString()) }, (err: any, res: any) => result = res)
            console.log(result)
            db.close();
            if (!result) {
                console.log("not found")
                return undefined
            }
            console.log("found")
            return result;
        });
        return undefined
    }

    public print() {
        console.log("db says hi!")
    }
}
