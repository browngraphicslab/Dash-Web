import { readdirSync, writeFile, mkdirSync, createWriteStream } from "fs";
import * as path from "path";
import { red, cyan, yellow } from "colors";
import { Utils } from "../../../Utils";
import rimraf = require("rimraf");
import * as sharp from 'sharp';
import { SizeSuffix, DashUploadUtils, InjectSize } from "../../../server/DashUploadUtils";
import { AcceptibleMedia } from "../../../server/SharedMediaTypes";
const StreamZip = require('node-stream-zip');
const createImageSizeStream = require("image-size-stream");
import { parseXml } from "libxmljs";
import { strictEqual } from "assert";

export interface DeviceDocument {
    title: string;
    shortDescription: string;
    longDescription: string;
    company: string;
    year: number;
    originalPrice: number | "NFS";
    degreesOfFreedom: number;
    dimensions: string;
    primaryKey: string;
    secondaryKey: string;
    attribute: string;
}

interface DocumentContents {
    body: string;
    imageUrls: string[];
    hyperlinks: string[];
    captions: Caption[];
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
    required?: boolean;
}

interface Caption {
    fileName: string;
    caption: string;
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
                return { transformed: raw };
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
    const source = path.resolve(`${__dirname}/source`);
    const candidates = readdirSync(source).filter(file => /.*\.docx?$/.test(file)).map(file => `${source}/${file}`);

    const imported: any[] = [];
    for (const filePath of candidates) {
        const fileName = path.basename(filePath).replace("Bill_Notes_", "");
        console.log(cyan(`\nExtracting contents from ${fileName}...`));
        imported.push({ fileName, contents: await extractFileContents(filePath) });
    }

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

async function readAndParseXml(zip: any, relativePath: string) {
    const contents = await new Promise<string>((resolve, reject) => {
        let body = "";
        zip.stream(relativePath, (error: any, stream: any) => {
            if (error) {
                reject(error);
            }
            stream.on('data', (chunk: any) => body += chunk.toString());
            stream.on('end', () => resolve(body));
        });
    });

    return parseXml(contents);
}

async function extractFileContents(pathToDocument: string): Promise<DocumentContents> {
    console.log('Extracting text...');

    const zip = new StreamZip({ file: pathToDocument, storeEntries: true });
    await new Promise<void>(resolve => zip.on('ready', resolve));

    // extract the body of the document and, specifically, its captions

    const document = await readAndParseXml(zip, "word/document.xml");
    const body = document.root()?.text() || "No body found.";
    const captions: Caption[] = [];
    const captionTargets = document.find('//*[name()="w:tbl"]/*[name()="w:tr"]/*[name()="w:tc"]').map(node => node.text());
    const { length } = captionTargets;

    strictEqual(length > 3, true, "No captions written.");
    strictEqual(length % 3 === 0, true, "Improper caption formatting.");

    for (let i = 3; i < captionTargets.length; i += 3) {
        const [image, fileName, caption] = captionTargets.slice(i, i + 3);
        strictEqual(image, "", `The image cell in one row was not the empty string: ${image}`);
        captions.push({ fileName, caption });
    }

    // extract all hyperlinks embedded in the document
    const rels = await readAndParseXml(zip, "word/_rels/document.xml.rels");
    const hyperlinks = rels.find('//*[name()="Relationship" and contains(@Type, "hyperlink")]').map(el => el.attrs()[2].value());
    console.log("Text extracted.");

    console.log("Beginning image extraction...");
    const imageUrls = await writeImages(zip);
    console.log(`Extracted ${imageUrls.length} images.`);

    zip.close();

    return { body, imageUrls, captions, hyperlinks };
}

const imageEntry = /^word\/media\/\w+\.(jpeg|jpg|png|gif)/;
const { pngs, jpgs } = AcceptibleMedia;
const pngOptions = {
    compressionLevel: 9,
    adaptiveFiltering: true,
    force: true
};
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

        const ext = `.${type}`;
        const generatedFileName = `upload_${Utils.GenerateGuid()}${ext}`;
        for (const { resizer, suffix } of resizers(ext)) {
            const resizedPath = path.resolve(imageDir, InjectSize(generatedFileName, suffix));
            await new Promise<void>(async (resolve, reject) => {
                const writeStream = createWriteStream(resizedPath);
                const readStream = await streamImage();
                let source = readStream;
                if (resizer) {
                    source = readStream.pipe(resizer.withMetadata());
                }
                const out = source.pipe(writeStream);
                out.on("close", resolve);
                out.on("error", reject);
            });
        }
        imageUrls.push(`http://localhost:1050/files/images/buxton/${generatedFileName}`);
    }

    return imageUrls;
}

function resizers(ext: string): DashUploadUtils.ImageResizer[] {
    return [
        { suffix: SizeSuffix.Original },
        ...Object.values(DashUploadUtils.Sizes).map(size => {
            let initial = sharp().resize(size.width, undefined, { withoutEnlargement: true });
            if (pngs.includes(ext)) {
                initial = initial.png(pngOptions);
            } else if (jpgs.includes(ext)) {
                initial = initial.jpeg();
            }
            return {
                resizer: initial,
                suffix: size.suffix
            };
        })
    ];
}

function analyze(fileName: string, { body, imageUrls, captions, hyperlinks }: DocumentContents): AnalysisResult {
    const device: any = { hyperlinks };
    const errors: any = { fileName };

    for (const key of deviceKeys) {
        const { exp, transformer, matchIndex, required } = RegexMap.get(key)!;
        const matches = exp.exec(body);

        let captured = Utilities.tryGetValidCapture(matches, matchIndex ?? 1);
        if (captured) {
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

    device.__images = imageUrls;

    device.captions = [];
    device.fileNames = [];
    captions.forEach(({ caption, fileName }) => {
        device.captions.push(caption);
        device.fileNames.push(fileName);
    });

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