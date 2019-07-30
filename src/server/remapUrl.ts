import { Database } from "./database";
import { Search } from "./Search";
import * as path from 'path';

const suffixMap: { [type: string]: true } = {
    "video": true,
    "pdf": true,
    "audio": true,
    "web": true
};

async function update() {
    await new Promise(res => setTimeout(res, 10));
    console.log("update");
    const cursor = await Database.Instance.query({});
    console.log("Cleared");
    const updates: [string, any][] = [];
    function updateDoc(doc: any) {
        if (doc.__type !== "Doc") {
            return;
        }
        const fields = doc.fields;
        if (!fields) {
            return;
        }
        const update: any = {
        };
        let dynfield = false;
        for (const key in fields) {
            const value = fields[key];
            if (value && value.__type && suffixMap[value.__type]) {
                const url = new URL(value.url);
                if (url.href.includes("localhost")) {
                    dynfield = true;

                    update.$set = { ["fields." + key + ".url"]: `${url.protocol}//http://dash-web.eastus2.cloudapp.azure.com:1050${url.pathname}` };
                }
            }
        }
        if (dynfield) {
            updates.push([doc._id, update]);
        }
    }
    await cursor.forEach(updateDoc);
    await Promise.all(updates.map(doc => {
        console.log(doc[0], doc[1]);
        return new Promise(res => Database.Instance.update(doc[0], doc[1], () => {
            console.log("wrote " + JSON.stringify(doc[1]));
            res();
        }, false, "newDocuments"));
    }));
    console.log("Done");
    // await Promise.all(updates.map(update => {
    //     return limit(() => Search.Instance.updateDocument(update));
    // }));
    cursor.close();
}

update();
