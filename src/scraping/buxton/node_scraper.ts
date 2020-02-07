import { readdirSync, writeFile, existsSync, mkdirSync } from "fs";
import * as path from "path";
import { red, cyan, yellow, green } from "colors";
import { Database } from "../../server/database";
import { Opt } from "../../new_fields/Doc";
import { Utils } from "../../Utils";
const StreamZip = require('node-stream-zip');

export interface DeviceDocument {
    title: string;
    shortDescription: string;
    longDescription: string;
    company: string;
    year: number;
    originalPrice: number;
    degreesOfFreedom: number;
    dimensions: string;
    primaryKey: string;
    secondaryKey: string;
}

interface AnalysisResult {
    device?: DeviceDocument;
    errors?: any;
}

type Converter<T> = (raw: string) => { transformed?: T, error?: string };

interface Processor<T> {
    exp: RegExp;
    matchIndex?: number;
    transformer?: Converter<T>;
}

const RegexMap = new Map<keyof DeviceDocument, Processor<any>>([
    ["title", {
        exp: /contact\s+(.*)Short Description:/
    }],
    ["company", {
        exp: /Company:\s+([^\|]*)\s+\|/,
        transformer: (raw: string) => ({ transformed: raw.replace(/\./g, "") })
    }],
    ["year", {
        exp: /Year:\s+([^\|]*)\s+\|/,
        transformer: numberValue
    }],
    ["primaryKey", {
        exp: /Primary:\s+(.*)(Secondary|Additional):/,
        transformer: collectUniqueTokens
    }],
    ["secondaryKey", {
        exp: /(Secondary|Additional):\s+([^\{\}]*)Links/,
        transformer: collectUniqueTokens,
        matchIndex: 2
    }],
    ["originalPrice", {
        exp: /Original Price \(USD\)\:\s+\$([0-9\.]+)/,
        transformer: numberValue
    }],
    ["degreesOfFreedom", {
        exp: /Degrees of Freedom:\s+([0-9]+)/,
        transformer: numberValue
    }],
    ["dimensions", {
        exp: /Dimensions\s+\(L x W x H\):\s+([0-9\.]+\s+x\s+[0-9\.]+\s+x\s+[0-9\.]+\s\([A-Za-z]+\))/,
        transformer: (raw: string) => {
            const [length, width, group] = raw.split(" x ");
            const [height, unit] = group.split(" ");
            return {
                transformed: {
                    length: Number(length),
                    width: Number(width),
                    height: Number(height),
                    unit: unit.replace(/[\(\)]+/g, "")
                }
            };
        }
    }],
    ["shortDescription", {
        exp: /Short Description:\s+(.*)Bill Buxton[’']s Notes/,
        transformer: correctSentences
    }],
    ["longDescription", {
        exp: /Bill Buxton[’']s Notes(.*)Device Details/,
        transformer: correctSentences
    }],
]);

function numberValue(raw: string) {
    const transformed = Number(raw);
    if (isNaN(transformed)) {
        return { error: `${transformed} cannot be parsed to a numeric value.` };
    }
    return { transformed };
}

function collectUniqueTokens(raw: string) {
    return { transformed: Array.from(new Set(raw.replace(/,|\s+and\s+/g, " ").split(/\s+/).map(token => token.toLowerCase().trim()))).map(capitalize).sort() };
}

function correctSentences(raw: string) {
    raw = raw.replace(/\./g, ". ").replace(/\:/g, ": ").replace(/\,/g, ", ").replace(/\?/g, "? ").trimRight();
    raw = raw.replace(/\s{2,}/g, " ");
    return { transformed: raw };
}

const targetMongoCollection = "newDocuments";
const outDir = path.resolve(__dirname, "json");
const successOut = "buxton.json";
const failOut = "incomplete.json";
const deviceKeys = Array.from(RegexMap.keys());

function printEntries(zip: any) {
    const { entriesCount } = zip;
    console.log(`Recognized ${entriesCount} entr${entriesCount === 1 ? "y" : "ies"}.`);
    for (const entry of Object.values<any>(zip.entries())) {
        const desc = entry.isDirectory ? 'directory' : `${entry.size} bytes`;
        console.log(`${entry.name}: ${desc}`);
    }
}

export async function wordToPlainText(pathToDocument: string): Promise<string> {
    const zip = new StreamZip({ file: pathToDocument, storeEntries: true });
    const contents = await new Promise<string>((resolve, reject) => {
        zip.on('ready', () => {
            let body = "";
            zip.stream("word/document.xml", (error: any, stream: any) => {
                if (error) {
                    reject(error);
                }
                stream.on('data', (chunk: any) => body += chunk.toString());
                stream.on('end', () => {
                    resolve(body);
                    zip.close();
                });
            });
        });
    });
    let body = "";
    const components = contents.toString().split('<w:t');
    for (const component of components) {
        const tags = component.split('>');
        const content = tags[1].replace(/<.*$/, "");
        body += content;
    }
    return body;
}

function tryGetValidCapture(matches: RegExpExecArray | null, matchIndex: number): Opt<string> {
    let captured: string;
    if (!matches || !(captured = matches[matchIndex])) {
        return undefined;
    }
    const lower = captured.toLowerCase();
    if (/to come/.test(lower)) {
        return undefined;
    }
    if (lower.includes("xxx")) {
        return undefined;
    }
    if (!captured.toLowerCase().replace(/[….\s]+/g, "").length) {
        return undefined;
    }
    return captured;
}

function capitalize(word: string): string {
    const clean = word.trim();
    if (!clean.length) {
        return word;
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
}

export function analyze(path: string, body: string): AnalysisResult {
    const device: any = {};

    const segments = path.split("/");
    const filename = segments[segments.length - 1].replace("Bill_Notes_", "");

    const errors: any = { filename };

    for (const key of deviceKeys) {
        const { exp, transformer, matchIndex } = RegexMap.get(key)!;
        const matches = exp.exec(body);

        let captured = tryGetValidCapture(matches, matchIndex ?? 1);
        if (!captured) {
            errors[key] = `ERR__${key.toUpperCase()}__: outer match ${matches === null ? "wasn't" : "was"} captured.`;
            continue;
        }

        captured = captured.replace(/\s{2,}/g, " ");
        if (transformer) {
            const { error, transformed } = transformer(captured);
            if (error) {
                errors[key] = `__ERR__${key.toUpperCase()}__TRANSFORM__: ${error}`;
                continue;
            }
            captured = transformed;
        }

        device[key] = captured;
    }

    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 1) {
        console.log(red(`\n@ ${cyan(filename.toUpperCase())}...`));
        errorKeys.forEach(key => key !== "filename" && console.log(red(errors[key])));
        return { errors };
    }

    return { device };
}

async function parseFiles(): Promise<DeviceDocument[]> {
    const sourceDirectory = path.resolve(`${__dirname}/source`);
    const candidates = readdirSync(sourceDirectory).filter(file => file.endsWith(".doc") || file.endsWith(".docx")).map(file => `${sourceDirectory}/${file}`);
    const imported = await Promise.all(candidates.map(async path => ({ path, body: await wordToPlainText(path) })));
    // const imported = [{ path: candidates[10], body: await extract(candidates[10]) }];
    const data = imported.map(({ path, body }) => analyze(path, body));
    const masterDevices: DeviceDocument[] = [];
    const masterErrors: any[] = [];
    data.forEach(({ device, errors }) => {
        if (device) {
            masterDevices.push(device);
        } else {
            masterErrors.push(errors);
        }
    });
    const total = candidates.length;
    if (masterDevices.length + masterErrors.length !== total) {
        throw new Error(`Encountered a ${masterDevices.length} to ${masterErrors.length} mismatch in device / error split!`);
    }
    console.log();
    await writeOutputFile(successOut, masterDevices, total, true);
    await writeOutputFile(failOut, masterErrors, total, false);
    console.log();

    return masterDevices;
}

async function writeOutputFile(relativePath: string, data: any[], total: number, success: boolean) {
    console.log(yellow(`Encountered ${data.length} ${success ? "valid" : "invalid"} documents out of ${total} candidates. Writing ${relativePath}...`));
    return new Promise<void>((resolve, reject) => {
        const destination = path.resolve(outDir, relativePath);
        const contents = JSON.stringify(data, undefined, 4);
        writeFile(destination, contents, err => err ? reject(err) : resolve());
    });
}

namespace Doc {

    export async function create<T = any>(fields: T, viewType?: number) {
        const dataDocId = Utils.GenerateGuid();
        const dataDoc = {
            _id: dataDocId,
            fields: {
                ...fields,
                isPrototype: true,
                author: "Bill Buxton"
            },
            __type: "Doc"
        };
        const viewDocId = Utils.GenerateGuid();
        const viewDoc = {
            _id: viewDocId,
            fields: {
                proto: protofy(dataDocId),
                x: 10,
                y: 10,
                _width: 900,
                _height: 600,
                _panX: 0,
                _panY: 0,
                zIndex: 2,
                libraryBrush: false,
                _viewType: viewType || 4,
                _LODdisable: true
            },
            __type: "Doc"
        };
        await Database.Instance.insert(viewDoc, targetMongoCollection);
        await Database.Instance.insert(dataDoc, targetMongoCollection);
        return viewDocId;
    }

    export function protofy(id: string) {
        return {
            fieldId: id,
            __type: "proxy"
        };
    }

    export function proxifyGuids(ids: string[]) {
        return ids.map(id => ({
            fieldId: id,
            __type: "prefetch_proxy"
        }));
    }

    export function listify(fields: any[]) {
        return {
            fields: fields,
            __type: "list"
        };
    }

}

async function main() {
    if (!existsSync(outDir)) {
        mkdirSync(outDir);
    }

    const devices = await parseFiles();
    await Database.tryInitializeConnection();

    const { create, protofy, proxifyGuids, listify } = Doc;
    const parentGuid = await Doc.create({
        proto: protofy("collectionProto"),
        title: "The Buxton Collection",
        data: listify(proxifyGuids(await Promise.all(devices.map(create))))
    });
    Database.Instance.updateMany(
        { "fields.title": "Collection 1" },
        { "$push": { "fields.data.fields": { "fieldId": parentGuid, "__type": "proxy" } } },
        targetMongoCollection
    );

    console.log(green(`\nSuccessfully inserted ${devices.length} devices into ${targetMongoCollection}.`));

    Database.disconnect();
    process.exit(0);
}

main();