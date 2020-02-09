import { readdirSync, writeFile, mkdirSync, createWriteStream, createReadStream, unlinkSync } from "fs";
import * as path from "path";
import { red, cyan, yellow } from "colors";
import { Utils } from "../../../Utils";
import rimraf = require("rimraf");
const StreamZip = require('node-stream-zip');
import * as sharp from 'sharp';
import { SizeSuffix, DashUploadUtils, InjectSize } from "../../../server/DashUploadUtils";
import { AcceptibleMedia } from "../../../server/SharedMediaTypes";

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

interface DocumentContents {
    body: string;
    images: string[];
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

namespace Utilities {

    export function numberValue(raw: string) {
        const transformed = Number(raw);
        if (isNaN(transformed)) {
            return { error: `${transformed} cannot be parsed to a numeric value.` };
        }
        return { transformed };
    }

    export function collectUniqueTokens(raw: string) {
        return { transformed: Array.from(new Set(raw.replace(/,|\s+and\s+/g, " ").split(/\s+/).map(token => token.toLowerCase().trim()))).map(capitalize).sort() };
    }

    export function correctSentences(raw: string) {
        raw = raw.replace(/\./g, ". ").replace(/\:/g, ": ").replace(/\,/g, ", ").replace(/\?/g, "? ").trimRight();
        raw = raw.replace(/\s{2,}/g, " ");
        return { transformed: raw };
    }

    export function tryGetValidCapture(matches: RegExpExecArray | null, matchIndex: number): string | undefined {
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

    export function capitalize(word: string): string {
        const clean = word.trim();
        if (!clean.length) {
            return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

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
        transformer: Utilities.numberValue
    }],
    ["primaryKey", {
        exp: /Primary:\s+(.*)(Secondary|Additional):/,
        transformer: Utilities.collectUniqueTokens
    }],
    ["secondaryKey", {
        exp: /(Secondary|Additional):\s+([^\{\}]*)Links/,
        transformer: Utilities.collectUniqueTokens,
        matchIndex: 2
    }],
    ["originalPrice", {
        exp: /Original Price \(USD\)\:\s+\$([0-9\.]+)/,
        transformer: Utilities.numberValue
    }],
    ["degreesOfFreedom", {
        exp: /Degrees of Freedom:\s+([0-9]+)/,
        transformer: Utilities.numberValue
    }],
    ["dimensions", {
        exp: /Dimensions\s+\(L x W x H\):\s+([0-9\.]+\s+x\s+[0-9\.]+\s+x\s+[0-9\.]+\s\([A-Za-z]+\))/,
        transformer: (raw: string) => {
            const [length, width, group] = raw.split(" x ");
            const [height, unit] = group.split(" ");
            return {
                transformed: {
                    dim_length: Number(length),
                    dim_width: Number(width),
                    dim_height: Number(height),
                    dim_unit: unit.replace(/[\(\)]+/g, "")
                }
            };
        }
    }],
    ["shortDescription", {
        exp: /Short Description:\s+(.*)Bill Buxton[’']s Notes/,
        transformer: Utilities.correctSentences
    }],
    ["longDescription", {
        exp: /Bill Buxton[’']s Notes(.*)Device Details/,
        transformer: Utilities.correctSentences
    }],
]);

const outDir = path.resolve(__dirname, "json");
const imageDir = path.resolve(__dirname, "../../../server/public/files/images/buxton");
const successOut = "buxton.json";
const failOut = "incomplete.json";
const deviceKeys = Array.from(RegexMap.keys());

export default async function executeImport() {
    [outDir, imageDir].forEach(dir => {
        rimraf.sync(dir);
        mkdirSync(dir);
    });
    return parseFiles();
}

async function parseFiles(): Promise<DeviceDocument[]> {
    const sourceDirectory = path.resolve(`${__dirname}/source`);

    const candidates = readdirSync(sourceDirectory).filter(file => file.endsWith(".doc") || file.endsWith(".docx")).map(file => `${sourceDirectory}/${file}`);
    const imported = await Promise.all(candidates.map(async path => ({ path, body: await extractFileContents(path) })));
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

async function extractFileContents(pathToDocument: string): Promise<{ body: string, images: string[] }> {
    const zip = new StreamZip({ file: pathToDocument, storeEntries: true });
    const contents = await new Promise<string>((resolve, reject) => {
        zip.on('ready', () => {
            let body = "";
            zip.stream("word/document.xml", (error: any, stream: any) => {
                if (error) {
                    reject(error);
                }
                stream.on('data', (chunk: any) => body += chunk.toString());
                stream.on('end', () => resolve(body));
            });
        });
    });
    const images = await writeImages(zip);
    zip.close();
    let body = "";
    const components = contents.toString().split('<w:t');
    for (const component of components) {
        const tags = component.split('>');
        const content = tags[1].replace(/<.*$/, "");
        body += content;
    }
    return { body, images };
}

async function writeImages(zip: any): Promise<string[]> {
    const entryNames = Object.values<any>(zip.entries()).map(({ name }) => name);
    const resolved: { mediaPath: string, ext: string }[] = [];
    entryNames.forEach(name => {
        const matches = /^word\/media\/\w+(\.jpeg|jpg|png|gif)/.exec(name);
        matches && resolved.push({ mediaPath: name, ext: matches[1] });
    });
    const outNames: string[] = [];
    for (const { mediaPath, ext } of resolved) {
        const outName = `upload_${Utils.GenerateGuid()}${ext}`;
        const initialWritePath = path.resolve(imageDir, outName);
        await new Promise<void>((resolve, reject) => {
            zip.stream(mediaPath, (error: any, stream: any) => {
                if (error) {
                    console.error(error);
                    return reject(error);
                }
                const writeStream = createWriteStream(initialWritePath);
                stream.on('end', resolve);
                stream.on('error', reject);
                stream.pipe(writeStream);
            });
        });
        const resizers = [
            { resizer: sharp().rotate(), suffix: SizeSuffix.Original },
            ...Object.values(DashUploadUtils.Sizes).map(size => ({
                resizer: sharp().resize(size.width, undefined, { withoutEnlargement: true }).rotate(),
                suffix: size.suffix
            }))
        ];
        const { pngs, jpgs } = AcceptibleMedia;
        const lower = ext.toLowerCase();
        if (pngs.includes(lower)) {
            resizers.forEach(element => element.resizer = element.resizer.png());
        } else if (jpgs.includes(lower)) {
            resizers.forEach(element => element.resizer = element.resizer.jpeg());
        } else {
            throw new Error(red(initialWritePath + " " + lower));
        }
        for (const { resizer, suffix } of resizers) {
            await new Promise<void>(resolve => {
                const filename = InjectSize(outName, suffix);
                createReadStream(initialWritePath).pipe(resizer).on('error', error => {
                    console.log(red(error.message) + filename);
                    resolve();
                }).pipe(createWriteStream(path.resolve(imageDir, filename)))
                    .on('close', resolve)
                    .on('error', error => {
                        console.log(red(error));
                        resolve();
                    });
            });
        }
        unlinkSync(initialWritePath);
        outNames.push(`http://localhost:1050/files/images/buxton/${outName}`);
    }
    return outNames;
}

function analyze(pathToDocument: string, { body, images }: DocumentContents): AnalysisResult {
    const filename = path.basename(pathToDocument).replace("Bill_Notes_", "");
    console.log(`Parsing ${filename}...`);

    const device: any = {};
    const errors: any = { filename };

    for (const key of deviceKeys) {
        const { exp, transformer, matchIndex } = RegexMap.get(key)!;
        const matches = exp.exec(body);

        let captured = Utilities.tryGetValidCapture(matches, matchIndex ?? 1);
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

    device.__images = images;

    return { device };
}

async function writeOutputFile(relativePath: string, data: any[], total: number, success: boolean) {
    console.log(yellow(`Encountered ${data.length} ${success ? "valid" : "invalid"} documents out of ${total} candidates. Writing ${relativePath}...`));
    return new Promise<void>((resolve, reject) => {
        const destination = path.resolve(outDir, relativePath);
        const contents = JSON.stringify(data, undefined, 4);
        writeFile(destination, contents, err => err ? reject(err) : resolve());
    });
}