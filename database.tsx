import { action, configure } from 'mobx';
import * as mongodb from 'mongodb';

export class database {
    private MongoClient = mongodb.MongoClient;
    private url = 'mongodb://localhost:27017/website';

    public async update(id: string, field: string, value: string) {
        this.MongoClient.connect(this.url, (err, db) => {
            let collection = db.collection('documents');
            collection.update({ "id": id }, { $set: { field: value } });
            db.close();
        });
    }
}
