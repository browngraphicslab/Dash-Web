import { Database } from './database';

import * as path from 'path';
import * as fs from 'fs';
import { Search } from './Search';

function addDoc(doc: any, ids: string[], files: { [name: string]: string[] }) {
    for (const key in doc) {
        if (!doc.hasOwnProperty(key)) {
            continue;
        }
        const field = doc[key];
        if (field === undefined || field === null) {
            continue;
        }
        if (field.__type === "proxy") {
            ids.push(field.fieldId);
        } else if (field.__type === "list") {
            addDoc(field.fields, ids, files);
        } else if (typeof field === "string") {
            const re = /"(?:dataD|d)ocumentId"\s*:\s*"([\w\-]*)"/g;
            let match: string[] | null;
            while ((match = re.exec(field)) !== null) {
                ids.push(match[1]);
            }
        } else if (field.__type === "RichTextField") {
            const re = /"href"\s*:\s*"(.*?)"/g;
            let match: string[] | null;
            while ((match = re.exec(field.Data)) !== null) {
                const urlString = match[1];
                const split = new URL(urlString).pathname.split("doc/");
                if (split.length > 1) {
                    ids.push(split[split.length - 1]);
                }
            }
            const re2 = /"src"\s*:\s*"(.*?)"/g;
            while ((match = re2.exec(field.Data)) !== null) {
                const urlString = match[1];
                const pathname = new URL(urlString).pathname;
                const ext = path.extname(pathname);
                const fileName = path.basename(pathname, ext);
                let exts = files[fileName];
                if (!exts) {
                    files[fileName] = exts = [];
                }
                exts.push(ext);
            }
        } else if (["audio", "image", "video", "pdf", "web"].includes(field.__type)) {
            const url = new URL(field.url);
            const pathname = url.pathname;
            const ext = path.extname(pathname);
            const fileName = path.basename(pathname, ext);
            let exts = files[fileName];
            if (!exts) {
                files[fileName] = exts = [];
            }
            exts.push(ext);
        }
    }
}

async function GarbageCollect() {
    // await new Promise(res => setTimeout(res, 3000));
    const cursor = await Database.Instance.query({}, { userDocumentId: 1 }, 'users');
    const users = await cursor.toArray();
    const ids: string[] = users.map(user => user.userDocumentId);
    const visited = new Set<string>();
    const files: { [name: string]: string[] } = {};

    while (ids.length) {
        const count = Math.min(ids.length, 100);
        const index = ids.length - count;
        const fetchIds = ids.splice(index, count).filter(id => !visited.has(id));
        if (!fetchIds.length) {
            continue;
        }
        const docs = await new Promise<{ [key: string]: any }[]>(res => Database.Instance.getDocuments(fetchIds, res, "newDocuments"));
        for (const doc of docs) {
            const id = doc.id;
            if (doc === undefined) {
                console.log(`Couldn't find field with Id ${id}`);
                continue;
            }
            visited.add(id);
            addDoc(doc.fields, ids, files);
        }
        console.log(`To Go: ${ids.length}, visited: ${visited.size}`);
    }

    console.log(`Done: ${visited.size}`);

    cursor.close();

    const toDeleteCursor = await Database.Instance.query({ _id: { $nin: Array.from(visited) } }, { _id: 1 });
    const toDelete: string[] = (await toDeleteCursor.toArray()).map(doc => doc._id);
    toDeleteCursor.close();
    const result = await Database.Instance.delete({ _id: { $in: toDelete } }, "newDocuments");
    console.log(`${result.deletedCount} documents deleted`);

    await Search.Instance.deleteDocuments(toDelete);
    console.log("Cleared search documents");

    const folder = "./src/server/public/files/";
    fs.readdir(folder, (_, fileList) => {
        const filesToDelete = fileList.filter(file => {
            const ext = path.extname(file);
            let base = path.basename(file, ext);
            const existsInDb = (base in files || (base = base.substring(0, base.length - 2)) in files) && files[base].includes(ext);
            return file !== ".gitignore" && !existsInDb;
        });
        console.log(`Deleting ${filesToDelete.length} files`);
        filesToDelete.forEach(file => {
            console.log(`Deleting file ${file}`);
            try {
                fs.unlinkSync(folder + file);
            } catch {
                console.warn(`Couldn't delete file ${file}`);
            }
        });
        console.log(`Deleted ${filesToDelete.length} files`);
    });
}

GarbageCollect();
