import * as mongodb from 'mongodb';
import { Transferable } from './Message';
import { Opt } from '../new_fields/Doc';
import { Utils, emptyFunction } from '../Utils';
import { DashUploadUtils } from './DashUploadUtils';
import { Credentials } from 'google-auth-library';
import { GoogleApiServerUtils } from './apis/google/GoogleApiServerUtils';
import { IDatabase } from './IDatabase';
import { MemoryDatabase } from './MemoryDatabase';
import * as mongoose from 'mongoose';

export namespace Database {

    export let disconnect: Function;
    const schema = 'Dash';
    const port = 27017;
    export const url = `mongodb://localhost:${port}/${schema}`;

    enum ConnectionStates {
        disconnected = 0,
        connected = 1,
        connecting = 2,
        disconnecting = 3,
        uninitialized = 99,
    }

    export async function tryInitializeConnection() {
        try {
            const { connection } = mongoose;
            disconnect = async () => new Promise<any>(resolve => connection.close(resolve));
            if (connection.readyState === ConnectionStates.disconnected) {
                await new Promise<void>((resolve, reject) => {
                    connection.on('error', reject);
                    connection.on('connected', () => {
                        console.log(`mongoose established default connection at ${url}`);
                        resolve();
                    });
                    mongoose.connect(url, { useNewUrlParser: true });
                });
            }
        } catch (e) {
            console.error(`Mongoose FAILED to establish default connection at ${url} with the following error:`);
            console.error(e);
            console.log('Since a valid database connection is required to use Dash, the server process will now exit.\nPlease try again later.');
            process.exit(1);
        }
    }

    class Database implements IDatabase {
        public static DocumentsCollection = 'documents';
        private MongoClient = mongodb.MongoClient;
        private currentWrites: { [id: string]: Promise<void> } = {};
        private db?: mongodb.Db;
        private onConnect: (() => void)[] = [];

        constructor() {
            this.MongoClient.connect(url, (_err, client) => {
                if (!client) {
                    console.error("\nPlease start MongoDB by running 'mongod' in a terminal before continuing...\n");
                    process.exit(0);
                }
                this.db = client.db();
                this.onConnect.forEach(fn => fn());
            });
        }

        public async update(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, upsert = true, collectionName = Database.DocumentsCollection) {
            if (this.db) {
                const collection = this.db.collection(collectionName);
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
                const collection = this.db.collection(collectionName);
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

        public getDocument(id: string, fn: (result?: Transferable) => void, collectionName = "newDocuments") {
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

        public async visit(ids: string[], fn: (result: any) => string[] | Promise<string[]>, collectionName = "newDocuments"): Promise<void> {
            if (this.db) {
                const visited = new Set<string>();
                while (ids.length) {
                    const count = Math.min(ids.length, 1000);
                    const index = ids.length - count;
                    const fetchIds = ids.splice(index, count).filter(id => !visited.has(id));
                    if (!fetchIds.length) {
                        continue;
                    }
                    const docs = await new Promise<{ [key: string]: any }[]>(res => this.getDocuments(fetchIds, res, collectionName));
                    for (const doc of docs) {
                        const id = doc.id;
                        visited.add(id);
                        ids.push(...(await fn(doc)));
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

    function getDatabase() {
        switch (process.env.DB) {
            case "MEM":
                return new MemoryDatabase();
            default:
                return new Database();
        }
    }

    export const Instance: IDatabase = getDatabase();

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

        const SanitizedSingletonQuery = async <T>(query: { [key: string]: any }, collection: string, removeId = true): Promise<Opt<T>> => {
            const results = await SanitizedCappedQuery(query, collection, 1, removeId);
            return results.length ? results[0] : undefined;
        };

        export const QueryUploadHistory = async (contentSize: number) => {
            return SanitizedSingletonQuery<DashUploadUtils.ImageUploadInformation>({ contentSize }, AuxiliaryCollections.GooglePhotosUploadHistory);
        };

        export namespace GoogleAuthenticationToken {

            const GoogleAuthentication = "googleAuthentication";

            export type StoredCredentials = Credentials & { _id: string };

            export const Fetch = async (userId: string, removeId = true): Promise<Opt<StoredCredentials>> => {
                return SanitizedSingletonQuery<StoredCredentials>({ userId }, GoogleAuthentication, removeId);
            };

            export const Write = async (userId: string, enrichedCredentials: GoogleApiServerUtils.EnrichedCredentials) => {
                return Instance.insert({ userId, canAccess: [], ...enrichedCredentials }, GoogleAuthentication);
            };

            export const Update = async (userId: string, access_token: string, expiry_date: number) => {
                const entry = await Fetch(userId, false);
                if (entry) {
                    const parameters = { $set: { access_token, expiry_date } };
                    return Instance.update(entry._id, parameters, emptyFunction, true, GoogleAuthentication);
                }
            };

            export const DeleteAll = () => Instance.deleteAll(GoogleAuthentication, false);

        }

        export const LogUpload = async (information: DashUploadUtils.ImageUploadInformation) => {
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
