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
import { Readable, PassThrough } from "stream";

/**
 * This is an arbitrary bundle of data that gets populated
 * in extractFileContents
 */
interface DocumentContents {
    body: string;
    imageData: ImageData[];
    hyperlinks: string[];
    captions: string[];
    embeddedFileNames: string[];
    longDescription: string;
}

/**
 * A rough schema for everything that Bill has
 * included for each document
 */
export interface DeviceDocument {
    title: string;
    shortDescription: string;
    longDescription: string;
    company: string;
    year: number;
    originalPrice?: number;
    degreesOfFreedom?: number;
    dimensions?: string;
    primaryKey: string;
    secondaryKey: string;
    attribute: string;
    __images: ImageData[];
    hyperlinks: string[];
    captions: string[]; // from the table column
    embeddedFileNames: string[]; // from the table column
}

/**
 * A layer of abstraction around a single parsing
 * attempt. The error is not a TypeScript error, but
 * rather an invalidly formatted value for a given key.
 */
export interface AnalysisResult {
    device?: DeviceDocument;
    invalid?: { [deviceProperty: string]: string };
}

/**
 * A mini API that takes in a string and returns
 * either the given T or an error indicating that the
 * transformation was rejected.
 */
type Transformer<T> = (raw: string) => TransformResult<T>;
interface TransformResult<T> {
    transformed?: T;
    error?: string;
}

/**
 * Simple bundle counting successful and failed imports
 */
export interface ImportResults {
    deviceCount: number;
    errorCount: number;
}

/**
 * Definitions for callback functions. Such instances are
 * just invoked by when a single document has been parsed
 * or the entire import is over. As of this writing, these
 * callbacks are supplied by WebSocket.ts and used to inform
 * the client of these events.
 */
type ResultCallback = (result: AnalysisResult) => void;
type TerminatorCallback = (result: ImportResults) => void;

/**
 * Defines everything needed to define how a single key should be
 * formatted within the plain body text. The association between
 * keys and their format definitions is stored FormatMap
 */
interface ValueFormatDefinition<T> {
    exp: RegExp; // the expression that the key's value should match
    matchIndex?: number; // defaults to 0, but can be overridden to account for grouping in @param exp
    transformer?: Transformer<T>; // if desirable, how to transform the Regex match
    required?: boolean; // defaults to true, confirms that for a whole document to be counted successful,
    // all of its required values should be present and properly formatted
}

/**
 * The basic data we extract from each image in the document
 */
interface ImageData {
    url: string;
    nativeWidth: number;
    nativeHeight: number;
}

namespace Utilities {

    /**
     * Numeric 'try parse', fits with the Transformer API
     * @param raw the serialized number
     */
    export function numberValue(raw: string): TransformResult<number> {
        const transformed = Number(raw);
        if (isNaN(transformed)) {
            return { error: `${raw} cannot be parsed to a numeric value.` };
        }
        return { transformed };
    }

    /**
     * A simple tokenizer that splits along 'and' and commas, and removes duplicates
     * Helpful mainly for attribute and primary key lists
     * @param raw the string to tokenize
     */
    export function collectUniqueTokens(raw: string): TransformResult<string[]> {
        const pieces = raw.replace(/,|\s+and\s+/g, " ").split(/\s+/).filter(piece => piece.length);
        const unique = new Set(pieces.map(token => token.toLowerCase().trim()));
        return { transformed: Array.from(unique).map(capitalize).sort() };
    }

    /**
     * Tries to correct XML text parsing artifact where some sentences lose their separating space,
     * and others gain excess whitespace
     * @param raw 
     */
    export function correctSentences(raw: string): TransformResult<string> {
        raw = raw.replace(/\./g, ". ").replace(/\:/g, ": ").replace(/\,/g, ", ").replace(/\?/g, "? ").trimRight();
        raw = raw.replace(/\s{2,}/g, " ");
        return { transformed: raw };
    }

    /**
     * Simple capitalization
     * @param word to capitalize
     */
    export function capitalize(word: string): string {
        const clean = word.trim();
        if (!clean.length) {
            return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

    /**
     * Streams the requeted file at the relative path to the
     * root of the zip, then parses it with a library
     * @param zip the zip instance data source
     * @param relativePath the path to a .xml file within the zip to parse
     */
    export async function readAndParseXml(zip: any, relativePath: string) {
        console.log(`Text streaming ${relativePath}`);
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
}

/**
 * Defines how device values should be formatted. As you can see, the formatting is
 * not super consistent and has changed over time as edge cases have been found, but this
 * at least imposes some constraints, and will notify you if a document doesn't match the specifications
 * in this map.
 */
const FormatMap = new Map<keyof DeviceDocument, ValueFormatDefinition<any>>([
    ["title", {
        exp: /contact\s+(.*)Short Description:/
    }],
    ["company", {
        exp: /Company:\s+([^\|]*)\s+\|/,
        transformer: (raw: string) => ({ transformed: raw.replace(/\./g, "") })
    }],
    ["year", {
        exp: /Year:\s+([^\|]*)\s+\|/,
        transformer: (raw: string) => Utilities.numberValue(/[0-9]{4}/.exec(raw)![0])
    }],
    ["primaryKey", {
        exp: /Primary:\s+(.*)(Secondary|Additional):/,
        transformer: raw => {
            const { transformed, error } = Utilities.collectUniqueTokens(raw);
            return transformed ? { transformed: transformed[0] } : { error };
        }
    }],
    ["secondaryKey", {
        exp: /(Secondary|Additional):\s+(.*)Attributes?:/,
        transformer: raw => {
            const { transformed, error } = Utilities.collectUniqueTokens(raw);
            return transformed ? { transformed: transformed[0] } : { error };
        },
        matchIndex: 2
    }],
    ["attribute", {
        exp: /Attributes?:\s+(.*)Links/,
        transformer: raw => {
            const { transformed, error } = Utilities.collectUniqueTokens(raw);
            return transformed ? { transformed: transformed[0] } : { error };
        },
    }],
    ["originalPrice", {
        exp: /Original Price \(USD\)\:\s+(\$[0-9\,]+\.[0-9]+|NFS)/,
        transformer: (raw: string) => {
            raw = raw.replace(/\,/g, "");
            if (raw === "NFS") {
                return { transformed: -1 };
            }
            return Utilities.numberValue(raw.slice(1));
        },
        required: false
    }],
    ["degreesOfFreedom", {
        exp: /Degrees of Freedom:\s+([0-9]+)/,
        transformer: Utilities.numberValue,
        required: false
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
]);

const sourceDir = path.resolve(__dirname, "source"); // where the Word documents are assumed to be stored
const outDir = path.resolve(__dirname, "json"); // where the JSON output of these device documents will be written
const imageDir = path.resolve(__dirname, "../../../server/public/files/images/buxton"); // where, in the server, these images will be written
const successOut = "buxton.json"; // the JSON list representing properly formatted documents
const failOut = "incomplete.json"; // the JSON list representing improperly formatted documents
const deviceKeys = Array.from(FormatMap.keys()); // a way to iterate through all keys of the DeviceDocument interface

/**
 * Starts by REMOVING ALL EXISTING BUXTON RESOURCES. This might need to be
 * changed going forward
 * @param emitter the callback when each document is completed
 * @param terminator the callback when the entire import is completed
 */
export default async function executeImport(emitter: ResultCallback, terminator: TerminatorCallback) {
    try {
        // get all Word documents in the source directory
        const contents = readdirSync(sourceDir);
        const wordDocuments = contents.filter(file => /.*\.docx?$/.test(file)).map(file => `${sourceDir}/${file}`);
        // removal takes place here
        [outDir, imageDir].forEach(dir => {
            rimraf.sync(dir);
            mkdirSync(dir);
        });
        return parseFiles(wordDocuments, emitter, terminator);
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

/**
 * Parse every Word document in the directory, notifying any callers as needed
 * at each iteration via the emitter.
 * @param wordDocuments the string list of Word document names to parse
 * @param emitter the callback when each document is completed
 * @param terminator the callback when the entire import is completed
 */
async function parseFiles(wordDocuments: string[], emitter: ResultCallback, terminator: TerminatorCallback): Promise<DeviceDocument[]> {
    // execute parent-most parse function
    const results: AnalysisResult[] = [];
    for (const filePath of wordDocuments) {
        const fileName = path.basename(filePath).replace("Bill_Notes_", ""); // not strictly needed, but cleaner
        console.log(cyan(`\nExtracting contents from ${fileName}...`));
        const result = analyze(fileName, await extractFileContents(filePath));
        emitter(result);
        results.push(result);
    }

    // collect information about errors and successes
    const masterDevices: DeviceDocument[] = [];
    const masterErrors: { [key: string]: string }[] = [];
    results.forEach(({ device, invalid: errors }) => {
        if (device) {
            masterDevices.push(device);
        } else if (errors) {
            masterErrors.push(errors);
        }
    });

    // something went wrong, since errors and successes should sum to total inputs
    const total = wordDocuments.length;
    if (masterDevices.length + masterErrors.length !== total) {
        throw new Error(`Encountered a ${masterDevices.length} to ${masterErrors.length} mismatch in device / error split!`);
    }

    // write the external JSON representations of this import
    console.log();
    await writeOutputFile(successOut, masterDevices, total, true);
    await writeOutputFile(failOut, masterErrors, total, false);
    console.log();

    // notify the caller that the import has finished
    terminator({ deviceCount: masterDevices.length, errorCount: masterErrors.length });

    return masterDevices;
}

/**
 * XPath definitions for desired XML targets in respective hierarchies.
 * 
 * For table cells, can be read as: "find me anything that looks like <w:tc> in XML, whose
 * parent looks like <w:tr>, whose parent looks like <w:tbl>"
 * 
 * <w:tbl>
 *      <w:tr>
 *           <w:tc>
 * 
 * These are found by trial and error, and using an online XML parser / prettifier
 * to inspect the structure, since the Node XML library does not expose the parsed
 * structure very well for searching, say in the debug console.
 */
const xPaths = {
    paragraphs: '//*[name()="w:p"]',
    tableCells: '//*[name()="w:tbl"]/*[name()="w:tr"]/*[name()="w:tc"]',
    hyperlinks: '//*[name()="Relationship" and contains(@Type, "hyperlink")]'
};

/**
 * The meat of the script, images and text content are extracted here
 * @param pathToDocument the path to the document relative to the root of the zip
 */
async function extractFileContents(pathToDocument: string): Promise<DocumentContents> {
    console.log('Extracting text...');
    const zip = new StreamZip({ file: pathToDocument, storeEntries: true });
    await new Promise<void>(resolve => zip.on('ready', resolve));

    // extract the body of the document and, specifically, its captions
    const document = await Utilities.readAndParseXml(zip, "word/document.xml");
    // get plain text
    const body = document.root()?.text() ?? "No body found. Check the import script's XML parser.";
    const captions: string[] = [];
    const embeddedFileNames: string[] = [];

    // preserve paragraph formatting and line breaks that would otherwise get lost in the plain text parsing
    // of the XML hierarchy
    const paragraphs = document.find(xPaths.paragraphs).map(node => Utilities.correctSentences(node.text()).transformed!);
    const start = paragraphs.indexOf(paragraphs.find(el => /Bill Buxton[’']s Notes/.test(el))!) + 1;
    const end = paragraphs.indexOf("Device Details");
    const longDescription = paragraphs.slice(start, end).filter(paragraph => paragraph.length).join("\n\n");

    // extract captions from the table cells
    const tableRowsFlattened = document.find(xPaths.tableCells).map(node => node.text().trim());
    const { length } = tableRowsFlattened;
    const numCols = 3;
    strictEqual(length > numCols, true, "No captions written."); // first row has the headers, not content
    strictEqual(length % numCols === 0, true, "Improper caption formatting.");

    // break the flat list of strings into groups of numColumns. Thus, each group represents
    // a row in the table, where the first row has no text content since it's
    // the image, the second has the file name and the third has the caption (maybe additional columns
    // have been added or reordered since this was written, but follow the same appraoch)
    for (let i = numCols; i < tableRowsFlattened.length; i += numCols) {
        const row = tableRowsFlattened.slice(i, i + numCols);
        embeddedFileNames.push(row[1]);
        captions.push(row[2]);
    }

    // extract all hyperlinks embedded in the document
    const rels = await Utilities.readAndParseXml(zip, "word/_rels/document.xml.rels");
    const hyperlinks = rels.find(xPaths.hyperlinks).map(el => el.attrs()[2].value());
    console.log("Text extracted.");

    // write out the images for this document
    console.log("Beginning image extraction...");
    const imageData = await writeImages(zip);
    console.log(`Extracted ${imageData.length} images.`);

    // cleanup
    zip.close();

    return { body, longDescription, imageData, captions, embeddedFileNames, hyperlinks };
}

// zip relative path from root expression / filter used to isolate only media assets
const imageEntry = /^word\/media\/\w+\.(jpeg|jpg|png|gif)/;

/**
 * Image dimensions and file suffix, 
 */
interface ImageAttrs {
    width: number;
    height: number;
    type: string;
}

/**
 * For each image, stream the file, get its size, check if it's an icon
 * (if it is, ignore it)
 * @param zip the zip instance data source
 */
async function writeImages(zip: any): Promise<ImageData[]> {
    const allEntries = Object.values<any>(zip.entries()).map(({ name }) => name);
    const imageEntries = allEntries.filter(name => imageEntry.test(name));

    const imageUrls: ImageData[] = [];
    const valid: any[] = [];

    const getImageStream = (mediaPath: string) => new Promise<Readable>((resolve, reject) => {
        zip.stream(mediaPath, (error: any, stream: any) => error ? reject(error) : resolve(stream));
    });

    for (const mediaPath of imageEntries) {
        const { width, height, type } = await new Promise<ImageAttrs>(async resolve => {
            const sizeStream = (createImageSizeStream() as PassThrough).on('size', (dimensions: ImageAttrs) => {
                readStream.destroy();
                resolve(dimensions);
            }).on("error", () => readStream.destroy());
            const readStream = await getImageStream(mediaPath);
            readStream.pipe(sizeStream);
        });

        // if it's not an icon, by this rough heuristic, i.e. is it not square
        const number = Number(/image(\d+)/.exec(mediaPath)![1]);
        if (number > 5 || width - height > 10) {
            valid.push({ width, height, type, mediaPath, number });
        }
    }

    valid.sort((a, b) => a.number - b.number);

    const [{ width: first_w, height: first_h }, { width: second_w, height: second_h }] = valid;
    if (Math.abs(first_w / second_w - first_h / second_h) < 0.01) {
        const first_size = first_w * first_h;
        const second_size = second_w * second_h;
        const target = first_size >= second_size ? 1 : 0;
        valid.splice(target, 1);
        console.log(`Heuristically removed image with size ${target ? second_size : first_size}`);
    }

    // for each valid image, output the _o, _l, _m, and _s files
    // THIS IS WHERE THE SCRIPT SPENDS MOST OF ITS TIME
    for (const { type, width, height, mediaPath } of valid) {
        const generatedFileName = `upload_${Utils.GenerateGuid()}.${type.toLowerCase()}`;
        await DashUploadUtils.outputResizedImages(() => getImageStream(mediaPath), generatedFileName, imageDir);
        imageUrls.push({
            url: `/files/images/buxton/${generatedFileName}`,
            nativeWidth: width,
            nativeHeight: height
        });
    }

    return imageUrls;
}

/**
 * Takes the results of extractFileContents, which relative to this is sort of the
 * external media / preliminary text processing, and now tests the given file name to
 * with those value definitions to make sure the body of the document contains all
 * required fields, properly formatted
 * @param fileName the file whose body to inspect
 * @param contents the data already computed / parsed by extractFileContents
 */
function analyze(fileName: string, contents: DocumentContents): AnalysisResult {
    const { body, imageData, captions, hyperlinks, embeddedFileNames, longDescription } = contents;
    const device: any = {
        hyperlinks,
        captions,
        embeddedFileNames,
        longDescription,
        __images: imageData
    };
    const errors: { [key: string]: string } = { fileName };

    for (const key of deviceKeys) {
        const { exp, transformer, matchIndex, required } = FormatMap.get(key)!;
        const matches = exp.exec(body);

        let captured: string;
        // if we matched and we got the specific match we're after
        if (matches && (captured = matches[matchIndex ?? 1])) { // matchIndex defaults to 1
            captured = captured.replace(/\s{2,}/g, " "); // remove excess whitespace
            // if supplied, apply the required transformation (recall this is specified in FormatMap)
            if (transformer) {
                const { error, transformed } = transformer(captured);
                if (error) {
                    // we hit a snag trying to transform the valid match
                    // still counts as a fundamental error
                    errors[key] = `__ERR__${key.toUpperCase()}__TRANSFORM__: ${error}`;
                    continue;
                }
                captured = transformed;
            }
            device[key] = captured;
        } else if (required ?? true) {
            // the field was either implicitly or explicitly required, and failed to match the definition in
            // FormatMap
            errors[key] = `ERR__${key.toUpperCase()}__: outer match ${matches === null ? "wasn't" : "was"} captured.`;
            continue;
        }
    }

    // print errors - this can be removed
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 1) {
        console.log(red(`@ ${cyan(fileName.toUpperCase())}...`));
        errorKeys.forEach(key => key !== "filename" && console.log(red(errors[key])));
        return { invalid: errors };
    }

    return { device };
}

/**
 * A utility function that writes the JSON results for this import out to the desired path
 * @param relativePath where to write the JSON file
 * @param data valid device document objects, or errors
 * @param total used for more informative printing
 * @param success whether or not the caller is writing the successful parses or the failures
 */
async function writeOutputFile(relativePath: string, data: any[], total: number, success: boolean) {
    console.log(yellow(`Encountered ${data.length} ${success ? "valid" : "invalid"} documents out of ${total} candidates. Writing ${relativePath}...`));
    return new Promise<void>((resolve, reject) => {
        const destination = path.resolve(outDir, relativePath);
        const contents = JSON.stringify(data, undefined, 4); // format the JSON
        writeFile(destination, contents, err => err ? reject(err) : resolve());
    });
}