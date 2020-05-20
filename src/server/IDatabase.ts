import * as mongodb from 'mongodb';
import { Transferable } from './Message';

export const DocumentsCollection = 'documents';
export const NewDocumentsCollection = 'newDocuments';
export interface IDatabase {
    update(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, upsert?: boolean, collectionName?: string): Promise<void>;
    updateMany(query: any, update: any, collectionName?: string): Promise<mongodb.WriteOpResult>;

    replace(id: string, value: any, callback: (err: mongodb.MongoError, res: mongodb.UpdateWriteOpResult) => void, upsert?: boolean, collectionName?: string): void;

    delete(query: any, collectionName?: string): Promise<mongodb.DeleteWriteOpResultObject>;
    delete(id: string, collectionName?: string): Promise<mongodb.DeleteWriteOpResultObject>;

    deleteAll(collectionName?: string, persist?: boolean): Promise<any>;

    insert(value: any, collectionName?: string): Promise<void>;

    getDocument(id: string, fn: (result?: Transferable) => void, collectionName?: string): void;
    getDocuments(ids: string[], fn: (result: Transferable[]) => void, collectionName?: string): void;
    visit(ids: string[], fn: (result: any) => string[] | Promise<string[]>, collectionName?: string): Promise<void>;

    query(query: { [key: string]: any }, projection?: { [key: string]: 0 | 1 }, collectionName?: string): Promise<mongodb.Cursor>;
}
