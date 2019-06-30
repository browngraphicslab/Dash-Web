import { Database } from "./database";
import { Cursor } from "mongodb";
import { Search } from "./Search";
import pLimit from 'p-limit';

const suffixMap: { [type: string]: (string | [string, string | ((json: any) => any)]) } = {
    "number": "_n",
    "string": "_t",
    "boolean": "_b",
    "image": ["_t", "url"],
    "video": ["_t", "url"],
    "pdf": ["_t", "url"],
    "audio": ["_t", "url"],
    "web": ["_t", "url"],
    "date": ["_d", value => new Date(value.date).toISOString()],
    "proxy": ["_i", "fieldId"],
    "list": ["_l", list => {
        const results = [];
        for (const value of list.fields) {
            const term = ToSearchTerm(value);
            if (term) {
                results.push(term.value);
            }
        }
        return results.length ? results : null;
    }]
};

function ToSearchTerm(val: any): { suffix: string, value: any } | undefined {
    if (val === null || val === undefined) {
        return;
    }
    const type = val.__type || typeof val;
    let suffix = suffixMap[type];
    if (!suffix) {
        return;
    }

    if (Array.isArray(suffix)) {
        const accessor = suffix[1];
        if (typeof accessor === "function") {
            val = accessor(val);
        } else {
            val = val[accessor];
        }
        suffix = suffix[0];
    }

    return { suffix, value: val };
}

function getSuffix(value: string | [string, any]): string {
    return typeof value === "string" ? value : value[0];
}

const limit = pLimit(5);
async function update() {
    // await new Promise(res => setTimeout(res, 5));
    console.log("update");
    await Search.Instance.clear();
    const cursor = await Database.Instance.query({});
    console.log("Cleared");
    const updates: any[] = [];
    let numDocs = 0;
    function updateDoc(doc: any) {
        numDocs++;
        if ((numDocs % 50) === 0) {
            console.log("updateDoc " + numDocs);
        }
        console.log("doc " + numDocs);
        if (doc.__type !== "Doc") {
            return;
        }
        const fields = doc.fields;
        if (!fields) {
            return;
        }
        const update: any = { id: doc._id };
        let dynfield = false;
        for (const key in fields) {
            const value = fields[key];
            const term = ToSearchTerm(value);
            if (term !== undefined) {
                let { suffix, value } = term;
                update[key + suffix] = value;
                dynfield = true;
            }
        }
        if (dynfield) {
            updates.push(update);
            console.log(updates.length);
        }
    }
    await cursor.forEach(updateDoc);
    await Promise.all(updates.map(update => {
        return limit(() => Search.Instance.updateDocument(update));
    }));
    cursor.close();
}

update();