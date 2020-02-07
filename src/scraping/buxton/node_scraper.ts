import { readdirSync, writeFile, existsSync, mkdirSync } from "fs";
import * as path from "path";
import { red, cyan, yellow } from "colors";
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
        transformer: correctWordParagraphs
    }],
    ["longDescription", {
        exp: /Bill Buxton[’']s Notes(.*)Device Details/,
        transformer: correctWordParagraphs
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

function correctWordParagraphs(raw: string) {
    raw = raw.replace(/\./g, ". ").replace(/\:/g, ": ").replace(/\,/g, ", ").replace(/\?/g, "? ").trimRight();
    raw = raw.replace(/\s{2,}/g, " ");
    return { transformed: raw };
}

const outDir = path.resolve(__dirname, "json");
const successOut = "buxton.json";
const failOut = "incomplete.json";
const deviceKeys = Array.from(RegexMap.keys());

function printEntries(zip: any) {
    console.log("READY!", zip.entriesCount);
    for (const entry of Object.values(zip.entries()) as any[]) {
        const desc = entry.isDirectory ? 'directory' : `${entry.size} bytes`;
        console.log(`Entry ${entry.name}: ${desc}`);
    }
}

export async function open(path: string) {
    const zip = new StreamZip({
        file: path,
        storeEntries: true
    });
    return new Promise<string>((resolve, reject) => {
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
}

export async function extract(path: string) {
    const contents = await open(path);
    let body = "";
    const components = contents.toString().split('<w:t');
    for (const component of components) {
        const tags = component.split('>');
        const content = tags[1].replace(/<.*$/, "");
        body += content;
    }
    return body;
}

function tryGetValidCapture(matches: RegExpExecArray | null, matchIndex: number) {
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

function capitalize(word: string) {
    const clean = word.trim();
    if (!clean.length) {
        return word;
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
}

export function analyze(path: string, body: string): { device?: DeviceDocument, errors?: any } {
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

async function parse() {
    const sourceDirectory = path.resolve(`${__dirname}/source`);
    const candidates = readdirSync(sourceDirectory).filter(file => file.endsWith(".doc") || file.endsWith(".docx")).map(file => `${sourceDirectory}/${file}`);
    const imported = await Promise.all(candidates.map(async path => ({ path, body: await extract(path) })));
    // const imported = [{ path: candidates[10], body: await extract(candidates[10]) }];
    const data = imported.map(({ path, body }) => analyze(path, body));
    const masterdevices: DeviceDocument[] = [];
    const masterErrors: any[] = [];
    data.forEach(({ device, errors }) => {
        if (device) {
            masterdevices.push(device);
        } else {
            masterErrors.push(errors);
        }
    });
    const total = candidates.length;
    if (masterdevices.length + masterErrors.length !== total) {
        throw new Error(`Encountered a ${masterdevices.length} to ${masterErrors.length} mismatch in device / error split!`);
    }
    console.log();
    await writeOutputFile(successOut, masterdevices, total, true);
    await writeOutputFile(failOut, masterErrors, total, false);
    console.log();
}

async function writeOutputFile(relativePath: string, data: any[], total: number, success: boolean) {
    console.log(yellow(`Encountered ${data.length} ${success ? "valid" : "invalid"} documents out of ${total} candidates. Writing ${relativePath}...`));
    return new Promise<void>((resolve, reject) => {
        const destination = path.resolve(outDir, relativePath);
        const contents = JSON.stringify(data, undefined, 4);
        writeFile(destination, contents, err => err ? reject(err) : resolve());
    });
}

if (!existsSync(outDir)) {
    mkdirSync(outDir);
}

parse();