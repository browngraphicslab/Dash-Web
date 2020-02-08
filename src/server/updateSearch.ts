import { Database } from "./database";
import { Search } from "./Search";
import { log_execution } from "./ActionUtilities";
import { cyan, green, yellow, red } from "colors";

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

async function update() {
    console.log(green("Beginning update..."));
    await log_execution<void>({
        startMessage: "Clearing existing Solr information...",
        endMessage: "Solr information successfully cleared",
        action: Search.clear,
        color: cyan
    });
    const cursor = await log_execution({
        startMessage: "Connecting to and querying for all documents from database...",
        endMessage: ({ result, error }) => {
            const success = error === null && result !== undefined;
            if (!success) {
                console.log(red("Unable to connect to the database."));
                process.exit(0);
            }
            return "Connection successful and query complete";
        },
        action: () => Database.Instance.query({}),
        color: yellow
    });
    const updates: any[] = [];
    let numDocs = 0;
    function updateDoc(doc: any) {
        numDocs++;
        if ((numDocs % 50) === 0) {
            console.log(`Batch of 50 complete, total of ${numDocs}`);
        }
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
                const { suffix, value } = term;
                update[key + suffix] = value;
                dynfield = true;
            }
        }
        if (dynfield) {
            updates.push(update);
        }
    }
    await cursor?.forEach(updateDoc);
    const result = await log_execution({
        startMessage: `Dispatching updates for ${updates.length} documents`,
        endMessage: "Dispatched updates complete",
        action: () => Search.updateDocuments(updates),
        color: cyan
    });
    try {
        if (result) {
            const { status } = JSON.parse(result).responseHeader;
            console.log(status ? red(`Failed with status code (${status})`) : green("Success!"));
        } else {
            console.log(red("Solr is likely not running!"));
        }
    } catch (e) {
        console.log(red("Error:"));
        console.log(e);
        console.log("\n");
    }
    await cursor?.close();
    process.exit(0);
}

update(); 