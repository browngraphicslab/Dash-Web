import { action, configure } from 'mobx';
import * as mongodb from 'mongodb';

export class database {
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/website';

    public update(id: string, field: string, value: string) {
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.db().collection('documents');
            collection.update({ "id": id }, { $set: { field: value } });
            db.close();
        });
    }

    public delete(id: string) {
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.db().collection('documents');
            collection.remove({ "id": id });
            db.close();
        });
    }

    public insert(kvpairs: JSON) {
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.db().collection('documents');
            collection.insert(kvpairs, () => { });
            db.close();
        });
    }

    public getDocument(id: string) {
        var result: Array<JSON>;
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.db().collection('documents');
            collection.find({ "id": id }).toArray((err, db) => { result = db });
            db.close();
            return result[0];
        });
    }
}
