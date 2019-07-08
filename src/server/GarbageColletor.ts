import { Database } from './database';

function addDoc(doc: any, ids: string[]) {
    for (const key in doc) {
        if (!doc.hasOwnProperty(key)) {
            continue;
        }
        const field = doc[key];
        if (!(field instanceof Object)) {
            continue;
        }
        if (field.__type === "proxy") {
            ids.push(field.fieldId);
        } else if (field.__type === "list") {
            addDoc(field.fields, ids);
        }
    }
}

async function GarbageCollect() {
    // await new Promise(res => setTimeout(res, 3000));
    const cursor = await Database.Instance.query({}, 'users');
    const users = await cursor.toArray();
    const ids: string[] = users.map(user => user.userDocumentId);
    const visited = new Set<string>();

    while (ids.length) {
        const id = ids.pop()!;
        if (visited.has(id)) continue;
        const doc = await new Promise<{ [key: string]: any }>(res => Database.Instance.getDocument(id, res, "newDocuments"));
        if (doc === undefined) {
            console.log(`Couldn't find field with Id ${id}`);
            continue;
        }
        visited.add(id);
        addDoc(doc.fields, ids);
        console.log(`To Go: ${ids.length}, visited: ${visited.size}`);
    }

    console.log(`Done: ${visited.size}`);

    cursor.close();

    const toDeleteCursor = await Database.Instance.query({ _id: { $nin: Array.from(visited) } });
    const toDelete = (await toDeleteCursor.toArray()).map(doc => doc._id);
    toDeleteCursor.close();
    const result = await Database.Instance.delete({ _id: { $in: toDelete } }, "newDocuments");
    console.log(`${result.deletedCount} documents deleted`);
}

GarbageCollect();
