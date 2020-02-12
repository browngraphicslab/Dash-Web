import { readdirSync, writeFile, mkdirSync } from "fs";
import * as path from "path";
import { red, cyan, yellow } from "colors";
import { Utils } from "../../../Utils";
import rimraf = require("rimraf");
import { DashUploadUtils } from "../../../server/DashUploadUtils";
const StreamZip = require('node-stream-zip');
const createImageSizeStream = require("image-size-stream");
import { parseXml } from "libxmljs";
import { strictEqual } from "assert";
import { BatchedArray, TimeUnit } from "array-batcher";

interface DocumentContents {
    body: string;
    imageUrls: string[];
    hyperlinks: string[];
    captions: string[];
    embeddedFileNames: string[];
}

export interface DeviceDocument {
    title: string;
    shortDescription: string;
    longDescription: string;
    company: string;
    year: number;
    originalPrice: number;
    degreesOfFreedom: number;
    dimensions?: string;
    primaryKey: string;
    secondaryKey: string;
    attribute: string;
}

interface AnalysisResult {
    device?: DeviceDocument;
    errors?: any;
}

type Transformer<T> = (raw: string) => { transformed?: T, error?: string };

interface Processor<T> {
    exp: RegExp;
    matchIndex?: number;
    transformer?: Transformer<T>;
    required?: boolean;
}

namespace Utilities {

    export function numberValue(raw: string) {
        const transformed = Number(raw);
        if (isNaN(transformed)) {
            return { error: `${raw} cannot be parsed to a numeric value.` };
        }
        return { transformed };
    }

    export function collectUniqueTokens(raw: string) {
        const pieces = raw.replace(/,|\s+and\s+/g, " ").split(/\s+/).filter(piece => piece.length);
        const unique = new Set(pieces.map(token => token.toLowerCase().trim()));
        return { transformed: Array.from(unique).map(capitalize).sort() };
    }

    export function correctSentences(raw: string) {
        raw = raw.replace(/\./g, ". ").replace(/\:/g, ": ").replace(/\,/g, ", ").replace(/\?/g, "? ").trimRight();
        raw = raw.replace(/\s{2,}/g, " ");
        return { transformed: raw };
    }

    export function capitalize(word: string): string {
        const clean = word.trim();
        if (!clean.length) {
            return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

    export async function readAndParseXml(zip: any, relativePath: string) {
        console.log(`Text streaming ${relativePath}`);
        const contents = await new Promise<string>((resolve, reject) => {
            let body = "";
            zip.stream(relativePath, (error: any, stream: any) => {
                if (error) {
                    reject(error);
                }
                console.log(stream);
                stream.on('data', (chunk: any) => body += chunk.toString());
                stream.on('end', () => resolve(body));
            });
        });

        return parseXml(contents);
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
        transformer: raw => ({ transformed: Utilities.collectUniqueTokens(raw).transformed[0] })
    }],
    ["secondaryKey", {
        exp: /(Secondary|Additional):\s+(.*)Attributes?:/,
        transformer: raw => ({ transformed: Utilities.collectUniqueTokens(raw).transformed[0] }),
        matchIndex: 2
    }],
    ["attribute", {
        exp: /Attributes?:\s+(.*)Links/,
        transformer: raw => ({ transformed: Utilities.collectUniqueTokens(raw).transformed[0] }),
    }],
    ["originalPrice", {
        exp: /Original Price \(USD\)\:\s+(\$[0-9]+\.[0-9]+|NFS)/,
        transformer: (raw: string) => {
            if (raw === "NFS") {
                return { transformed: -1 };
            }
            return Utilities.numberValue(raw.slice(1));
        }
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
        },
        required: false
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

const sourceDir = path.resolve(__dirname, "source");
const outDir = path.resolve(__dirname, "json");
const imageDir = path.resolve(__dirname, "../../../server/public/files/images/buxton");
const successOut = "buxton.json";
const failOut = "incomplete.json";
const deviceKeys = Array.from(RegexMap.keys());

export default async function executeImport() {
    try {
        const contents = readdirSync(sourceDir);
        const wordDocuments = contents.filter(file => /.*\.docx?$/.test(file)).map(file => `${sourceDir}/${file}`);
        [outDir, imageDir].forEach(dir => {
            rimraf.sync(dir);
            mkdirSync(dir);
        });
        return parseFiles(wordDocuments);
    } catch (e) {
        const message = [
            "Unable to find a source directory.",
            "Please ensure that the following directory exists and is populated with Word documents:",
            `${sourceDir}`
        ].join('\n');
        console.log(red(message));
        return { error: message };
    }
}

async function parseFiles(wordDocuments: string[]): Promise<DeviceDocument[]> {
    const imported = await BatchedArray.from(wordDocuments, { batchSize: 8 }).batchedMapPatientInterval<{ fileName: string, contents: DocumentContents }>({ magnitude: 10, unit: TimeUnit.Seconds }, async (batch, collector) => {
        for (const filePath of batch) {
            const fileName = path.basename(filePath).replace("Bill_Notes_", "");
            console.log(cyan(`\nExtracting contents from ${fileName}...`));
            collector.push({ fileName, contents: await extractFileContents(filePath) });
        }
    });
    console.log(yellow("\nAnalyzing the extracted document text...\n"));
    const results = imported.map(({ fileName, contents }) => analyze(fileName, contents));

    const masterDevices: DeviceDocument[] = [];
    const masterErrors: any[] = [];
    results.forEach(({ device, errors }) => {
        if (device) {
            masterDevices.push(device);
        } else {
            masterErrors.push(errors);
        }
    });

    const total = wordDocuments.length;
    if (masterDevices.length + masterErrors.length !== total) {
        throw new Error(`Encountered a ${masterDevices.length} to ${masterErrors.length} mismatch in device / error split!`);
    }

    console.log();
    await writeOutputFile(successOut, masterDevices, total, true);
    await writeOutputFile(failOut, masterErrors, total, false);
    console.log();

    return masterDevices;
}

const tableCellXPath = '//*[name()="w:tbl"]/*[name()="w:tr"]/*[name()="w:tc"]';
const hyperlinkXPath = '//*[name()="Relationship" and contains(@Type, "hyperlink")]';

async function extractFileContents(pathToDocument: string): Promise<DocumentContents> {
    console.log('Extracting text...');
    const zip = new StreamZip({ file: pathToDocument, storeEntries: true });
    console.log(zip);
    await new Promise<void>(resolve => zip.on('ready', resolve));
    console.log("Zip ready!");

    // extract the body of the document and, specifically, its captions
    const document = await Utilities.readAndParseXml(zip, "word/document.xml");
    const body = document.root()?.text() ?? "No body found. Check the import script's XML parser.";
    const captions: string[] = [];
    const embeddedFileNames: string[] = [];
    const captionTargets = document.find(tableCellXPath).map(node => node.text());

    const { length } = captionTargets;
    strictEqual(length > 3, true, "No captions written.");
    strictEqual(length % 3 === 0, true, "Improper caption formatting.");

    for (let i = 3; i < captionTargets.length; i += 3) {
        const [image, fileName, caption] = captionTargets.slice(i, i + 3);
        strictEqual(image, "", `The image cell in one row was not the empty string: ${image}`);
        captions.push(caption);
        embeddedFileNames.push(fileName);
    }

    // extract all hyperlinks embedded in the document
    const rels = await Utilities.readAndParseXml(zip, "word/_rels/document.xml.rels");
    const hyperlinks = rels.find(hyperlinkXPath).map(el => el.attrs()[2].value());
    console.log("Text extracted.");

    console.log("Beginning image extraction...");
    const imageUrls = await writeImages(zip);
    console.log(`Extracted ${imageUrls.length} images.`);

    zip.close();

    return { body, imageUrls, captions, embeddedFileNames, hyperlinks };
}

const imageEntry = /^word\/media\/\w+\.(jpeg|jpg|png|gif)/;

interface Dimensions {
    width: number;
    height: number;
    type: string;
}

async function writeImages(zip: any): Promise<string[]> {
    const allEntries = Object.values<any>(zip.entries()).map(({ name }) => name);
    const imageEntries = allEntries.filter(name => imageEntry.test(name));

    const imageUrls: string[] = [];
    for (const mediaPath of imageEntries) {
        console.log(`Considering ${mediaPath}`);
        const streamImage = () => new Promise<any>((resolve, reject) => {
            zip.stream(mediaPath, (error: any, stream: any) => error ? reject(error) : resolve(stream));
        });

        const { width, height, type } = await new Promise<Dimensions>(async resolve => {
            const sizeStream = createImageSizeStream().on('size', resolve);
            (await streamImage()).pipe(sizeStream);
        });
        if (Math.abs(width - height) < 10) {
            continue;
        }

        console.log(`Streaming!`);
        const ext = `.${type}`.toLowerCase();
        const generatedFileName = `upload_${Utils.GenerateGuid()}${ext}`;

        await DashUploadUtils.outputResizedImages(streamImage, imageDir, generatedFileName, ext);

        imageUrls.push(`/files/images/buxton/${generatedFileName}`);
    }

    return imageUrls;
}

function analyze(fileName: string, contents: DocumentContents): AnalysisResult {
    const { body, imageUrls, captions, hyperlinks, embeddedFileNames } = contents;
    const device: any = {
        hyperlinks,
        captions,
        embeddedFileNames,
        __images: imageUrls
    };
    const errors: any = { fileName };

    for (const key of deviceKeys) {
        const { exp, transformer, matchIndex, required } = RegexMap.get(key)!;
        const matches = exp.exec(body);

        let captured: string;
        if (matches && (captured = matches[matchIndex ?? 1])) {
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
        } else if (required ?? true) {
            errors[key] = `ERR__${key.toUpperCase()}__: outer match ${matches === null ? "wasn't" : "was"} captured.`;
            continue;
        }
    }

    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 1) {
        console.log(red(`@ ${cyan(fileName.toUpperCase())}...`));
        errorKeys.forEach(key => key !== "filename" && console.log(red(errors[key])));
        return { errors };
    }

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