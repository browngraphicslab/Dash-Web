import * as mongodb from 'mongodb';
import { Transferable } from './Message';
import { Opt } from '../new_fields/Doc';
import { Utils, emptyFunction } from '../Utils';
import { DashUploadUtils } from './DashUploadUtils';

export namespace Database {

    class Database {
        public static DocumentsCollection = 'documents';
        private MongoClient = mongodb.MongoClient;
        private url = 'mongodb://localhost:27017/Dash';
        private currentWrites: { [id: string]: Promise<void> } = {};
        private db?: mongodb.Db;
        private onConnect: (() => void)[] = [];

        constructor() {
            this.MongoClient.connect(this.url, (err, client) => {
                this.db = client.db();
                this.onConnect.forEach(fn => fn());
            });
        }

        public async update(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, upsert = true, collectionName = Database.DocumentsCollection) {
            if (this.db) {
                let collection = this.db.collection(collectionName);
                const prom = this.currentWrites[id];
                let newProm: Promise<void>;
                const run = (): Promise<void> => {
                    return new Promise<void>(resolve => {
                        collection.updateOne({ _id: id }, value, { upsert }
                            , (err, res) => {
                                if (this.currentWrites[id] === newProm) {
                                    delete this.currentWrites[id];
                                }
                                resolve();
                                callback(err, res);
                            });
                    });
                };
                newProm = prom ? prom.then(run) : run();
                this.currentWrites[id] = newProm;
                return newProm;
            } else {
                this.onConnect.push(() => this.update(id, value, callback, upsert, collectionName));
            }
        }

        public replace(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, upsert = true, collectionName = Database.DocumentsCollection) {
            if (this.db) {
                let collection = this.db.collection(collectionName);
                const prom = this.currentWrites[id];
                let newProm: Promise<void>;
                const run = (): Promise<void> => {
                    return new Promise<void>(resolve => {
                        collection.replaceOne({ _id: id }, value, { upsert }
                            , (err, res) => {
                                if (this.currentWrites[id] === newProm) {
                                    delete this.currentWrites[id];
                                }
                                resolve();
                                callback(err, res);
                            });
                    });
                };
                newProm = prom ? prom.then(run) : run();
                this.currentWrites[id] = newProm;
            } else {
                this.onConnect.push(() => this.replace(id, value, callback, upsert, collectionName));
            }
        }

        public delete(query: any, collectionName?: string): Promise<mongodb.DeleteWriteOpResultObject>;
        public delete(id: string, collectionName?: string): Promise<mongodb.DeleteWriteOpResultObject>;
        public delete(id: any, collectionName = Database.DocumentsCollection) {
            if (typeof id === "string") {
                id = { _id: id };
            }
            if (this.db) {
                const db = this.db;
                return new Promise(res => db.collection(collectionName).deleteMany(id, (err, result) => res(result)));
            } else {
                return new Promise(res => this.onConnect.push(() => res(this.delete(id, collectionName))));
            }
        }

        public async deleteAll(collectionName = Database.DocumentsCollection, persist = true): Promise<any> {
            return new Promise(resolve => {
                const executor = async (database: mongodb.Db) => {
                    if (persist) {
                        await database.collection(collectionName).deleteMany({});
                    } else {
                        await database.dropCollection(collectionName);
                    }
                    resolve();
                };
                if (this.db) {
                    executor(this.db);
                } else {
                    this.onConnect.push(() => this.db && executor(this.db));
                }
            });
        }

        public async insert(value: any, collectionName = Database.DocumentsCollection) {
            if (this.db) {
                if ("id" in value) {
                    value._id = value.id;
                    delete value.id;
                }
                const id = value._id;
                const collection = this.db.collection(collectionName);
                const prom = this.currentWrites[id];
                let newProm: Promise<void>;
                const run = (): Promise<void> => {
                    return new Promise<void>(resolve => {
                        collection.insertOne(value, (err, res) => {
                            if (this.currentWrites[id] === newProm) {
                                delete this.currentWrites[id];
                            }
                            resolve();
                        });
                    });
                };
                newProm = prom ? prom.then(run) : run();
                this.currentWrites[id] = newProm;
                return newProm;
            } else {
                this.onConnect.push(() => this.insert(value, collectionName));
            }
        }

        public getDocument(id: string, fn: (result?: Transferable) => void, collectionName = Database.DocumentsCollection) {
            if (this.db) {
                this.db.collection(collectionName).findOne({ _id: id }, (err, result) => {
                    if (result) {
                        result.id = result._id;
                        delete result._id;
                        fn(result);
                    } else {
                        fn(undefined);
                    }
                });
            } else {
                this.onConnect.push(() => this.getDocument(id, fn, collectionName));
            }
        }

        public getDocuments(ids: string[], fn: (result: Transferable[]) => void, collectionName = Database.DocumentsCollection) {
            if (this.db) {
                this.db.collection(collectionName).find({ _id: { "$in": ids } }).toArray((err, docs) => {
                    if (err) {
                        console.log(err.message);
                        console.log(err.errmsg);
                    }
                    fn(docs.map(doc => {
                        doc.id = doc._id;
                        delete doc._id;
                        return doc;
                    }));
                });
            } else {
                this.onConnect.push(() => this.getDocuments(ids, fn, collectionName));
            }
        }

        public async visit(ids: string[], fn: (result: any) => string[], collectionName = "newDocuments"): Promise<void> {
            if (this.db) {
                const visited = new Set<string>();
                while (ids.length) {
                    const count = Math.min(ids.length, 1000);
                    const index = ids.length - count;
                    const fetchIds = ids.splice(index, count).filter(id => !visited.has(id));
                    if (!fetchIds.length) {
                        continue;
                    }
                    const docs = await new Promise<{ [key: string]: any }[]>(res => Instance.getDocuments(fetchIds, res, "newDocuments"));
                    for (const doc of docs) {
                        const id = doc.id;
                        visited.add(id);
                        ids.push(...fn(doc));
                    }
                }

            } else {
                return new Promise(res => {
                    this.onConnect.push(() => {
                        this.visit(ids, fn, collectionName);
                        res();
                    });
                });
            }
        }

        public query(query: { [key: string]: any }, projection?: { [key: string]: 0 | 1 }, collectionName = "newDocuments"): Promise<mongodb.Cursor> {
            if (this.db) {
                let cursor = this.db.collection(collectionName).find(query);
                if (projection) {
                    cursor = cursor.project(projection);
                }
                return Promise.resolve<mongodb.Cursor>(cursor);
            } else {
                return new Promise<mongodb.Cursor>(res => {
                    this.onConnect.push(() => res(this.query(query, projection, collectionName)));
                });
            }
        }

        public updateMany(query: any, update: any, collectionName = "newDocuments") {
            if (this.db) {
                const db = this.db;
                return new Promise<mongodb.WriteOpResult>(res => db.collection(collectionName).update(query, update, (_, result) => res(result)));
            } else {
                return new Promise<mongodb.WriteOpResult>(res => {
                    this.onConnect.push(() => this.updateMany(query, update, collectionName).then(res));
                });
            }
        }

        public print() {
            console.log("db says hi!");
        }
    }

    export const Instance = new Database();

    export namespace Auxiliary {

        export enum AuxiliaryCollections {
            GooglePhotosUploadHistory = "uploadedFromGooglePhotos"
        }


        const SanitizedCappedQuery = async (query: { [key: string]: any }, collection: string, cap: number, removeId = true) => {
            const cursor = await Instance.query(query, undefined, collection);
            const results = await cursor.toArray();
            const slice = results.slice(0, Math.min(cap, results.length));
            return removeId ? slice.map(result => {
                delete result._id;
                return result;
            }) : slice;
        };

        const SanitizedSingletonQuery = async (query: { [key: string]: any }, collection: string, removeId = true) => {
            const results = await SanitizedCappedQuery(query, collection, 1, removeId);
            return results.length ? results[0] : undefined;
        };

        export const QueryUploadHistory = async (contentSize: number): Promise<Opt<DashUploadUtils.UploadInformation>> => {
            return SanitizedSingletonQuery({ contentSize }, AuxiliaryCollections.GooglePhotosUploadHistory);
        };

        export namespace GoogleAuthenticationToken {

            const GoogleAuthentication = "googleAuthentication";

            export const Fetch = async (userId: string, removeId = true) => {
                return SanitizedSingletonQuery({ userId }, GoogleAuthentication, removeId);
            };

            export const Write = async (userId: string, token: any) => {
                return Instance.insert({ userId, ...token }, GoogleAuthentication);
            };

            export const Update = async (userId: string, access_token: string, expiry_date: number) => {
                const entry = await Fetch(userId, false);
                if (entry) {
                    const parameters = { $set: { access_token, expiry_date } };
                    return Instance.update(entry._id, parameters, emptyFunction, true, GoogleAuthentication);
                }
            };

        }

        export const LogUpload = async (information: DashUploadUtils.UploadInformation) => {
            const bundle = {
                _id: Utils.GenerateDeterministicGuid(String(information.contentSize!)),
                ...information
            };
            return Instance.insert(bundle, AuxiliaryCollections.GooglePhotosUploadHistory);
        };

        export const DeleteAll = async (persist = false) => {
            const collectionNames = Object.values(AuxiliaryCollections);
            const pendingDeletions = collectionNames.map(name => Instance.deleteAll(name, persist));
            return Promise.all(pendingDeletions);
        };

    }

}