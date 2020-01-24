import * as fs from 'fs';
import { Utils } from '../Utils';
import * as path from 'path';
import * as sharp from 'sharp';
import request = require('request-promise');
import { ExifData, ExifImage } from 'exif';
import { Opt } from '../new_fields/Doc';
import { AcceptibleMedia } from './SharedMediaTypes';
import { filesDirectory } from '.';
import { File } from 'formidable';
import { basename } from "path";
import { createIfNotExists } from './ActionUtilities';
import { ParsedPDF } from "../server/PdfTypes";
const parse = require('pdf-parse');
import { Directory, serverPathToFile, clientPathToFile, pathToDirectory } from './ApiManagers/UploadManager';
import { red } from 'colors';
const requestImageSize = require("../client/util/request-image-size");

export enum SizeSuffix {
    Small = "_s",
    Medium = "_m",
    Large = "_l",
    Original = "_o"
}

export function InjectSize(filename: string, size: SizeSuffix) {
    const extension = path.extname(filename).toLowerCase();
    return filename.substring(0, filename.length - extension.length) + size + extension;
}

export namespace DashUploadUtils {

    export interface Size {
        width: number;
        suffix: SizeSuffix;
    }

    export interface ImageFileResponse {
        name: string;
        path: string;
        type: string;
        exif: Opt<DashUploadUtils.EnrichedExifData>;
    }

    export const Sizes: { [size: string]: Size } = {
        SMALL: { width: 100, suffix: SizeSuffix.Small },
        MEDIUM: { width: 400, suffix: SizeSuffix.Medium },
        LARGE: { width: 900, suffix: SizeSuffix.Large },
    };

    export function validateExtension(url: string) {
        return AcceptibleMedia.imageFormats.includes(path.extname(url).toLowerCase());
    }

    const size = "content-length";
    const type = "content-type";

    export interface ImageUploadInformation {
        clientAccessPath: string;
        serverAccessPaths: { [key: string]: string };
        exifData: EnrichedExifData;
        contentSize?: number;
        contentType?: string;
    }

    const { imageFormats, videoFormats, applicationFormats } = AcceptibleMedia;

    export async function upload(file: File): Promise<any> {
        const { type, path, name } = file;
        const types = type.split("/");

        const category = types[0];
        const format = `.${types[1]}`;

        switch (category) {
            case "image":
                if (imageFormats.includes(format)) {
                    const results = await UploadImage(path, basename(path), format);
                    return { ...results, name, type };
                }
            case "video":
                if (videoFormats.includes(format)) {
                    return MoveParsedFile(path, Directory.videos);
                }
            case "application":
                if (applicationFormats.includes(format)) {
                    return UploadPdf(path);
                }
        }

        console.log(red(`Ignoring unsupported file (${name}) with upload type (${type}).`));
        return { clientAccessPath: undefined };
    }

    async function UploadPdf(absolutePath: string) {
        const dataBuffer = fs.readFileSync(absolutePath);
        const result: ParsedPDF = await parse(dataBuffer);
        const parsedName = basename(absolutePath);
        await new Promise<void>((resolve, reject) => {
            const textFilename = `${parsedName.substring(0, parsedName.length - 4)}.txt`;
            const writeStream = fs.createWriteStream(serverPathToFile(Directory.text, textFilename));
            writeStream.write(result.text, error => error ? reject(error) : resolve());
        });
        return MoveParsedFile(absolutePath, Directory.pdfs);
    }

    const generate = (prefix: string, url: string) => `${prefix}upload_${Utils.GenerateGuid()}${sanitizeExtension(url)}`;
    const sanitizeExtension = (source: string) => {
        let extension = path.extname(source);
        extension = extension.toLowerCase();
        extension = extension.split("?")[0];
        return extension;
    };

    /**
     * Uploads an image specified by the @param source to Dash's /public/files/
     * directory, and returns information generated during that upload 
     * 
     * @param {string} source is either the absolute path of an already uploaded image or
     * the url of a remote image
     * @param {string} filename dictates what to call the image. If not specified,
     * the name {@param prefix}_upload_{GUID}
     * @param {string} prefix is a string prepended to the generated image name in the
     * event that @param filename is not specified
     * 
     * @returns {ImageUploadInformation} This method returns
     * 1) the paths to the uploaded images (plural due to resizing)
     * 2) the file name of each of the resized images
     * 3) the size of the image, in bytes (4432130)
     * 4) the content type of the image, i.e. image/(jpeg | png | ...)
     */
    export const UploadImage = async (source: string, filename?: string, format?: string, prefix: string = ""): Promise<ImageUploadInformation> => {
        const metadata = await InspectImage(source);
        return UploadInspectedImage(metadata, filename, format, prefix);
    };

    export interface InspectionResults {
        source: string;
        requestable: string;
        exifData: EnrichedExifData;
        contentSize: number;
        contentType: string;
        nativeWidth: number;
        nativeHeight: number;
    }

    export interface EnrichedExifData {
        data: ExifData;
        error?: string;
    }

    export async function buildFileDirectories() {
        const pending = Object.keys(Directory).map(sub => createIfNotExists(`${filesDirectory}/${sub}`));
        return Promise.all(pending);
    }

    export interface RequestedImageSize {
        width: number;
        height: number;
        type: string;
    }

    /**
     * Based on the url's classification as local or remote, gleans
     * as much information as possible about the specified image
     * 
     * @param source is the path or url to the image in question
     */
    export const InspectImage = async (source: string): Promise<InspectionResults> => {
        const url = convert(source);
        const exifData = await parseExifData(url);
        const results = {
            exifData,
            requestable: url
        };
        const { headers } = (await new Promise<any>((resolve, reject) => {
            request.head(url, (error, res) => error ? reject(error) : resolve(res));
        }).catch(error => console.error(error)));
        const { width: nativeWidth, height: nativeHeight }: RequestedImageSize = await requestImageSize(url);
        return {
            source,
            contentSize: parseInt(headers[size]),
            contentType: headers[type],
            nativeWidth,
            nativeHeight,
            ...results
        };
    };

    export async function MoveParsedFile(absolutePath: string, destination: Directory): Promise<{ clientAccessPath: Opt<string> }> {
        return new Promise<{ clientAccessPath: Opt<string> }>(resolve => {
            const filename = basename(absolutePath);
            const destinationPath = serverPathToFile(destination, filename);
            fs.rename(absolutePath, destinationPath, error => {
                resolve({ clientAccessPath: error ? undefined : clientPathToFile(destination, filename) });
            });
        });
    }

    export const UploadInspectedImage = async (metadata: InspectionResults, filename?: string, format?: string, prefix = ""): Promise<ImageUploadInformation> => {
        const { requestable, source, contentSize, contentType, exifData } = metadata;
        const resolved = filename || generate(prefix, requestable);
        const extension = format || sanitizeExtension(requestable || resolved);
        const information: ImageUploadInformation = {
            clientAccessPath: clientPathToFile(Directory.images, resolved),
            serverAccessPaths: {},
            exifData,
            contentSize,
            contentType,
        };
        const { pngs, jpgs } = AcceptibleMedia;
        return new Promise<ImageUploadInformation>(async (resolve, reject) => {
            const resizers = [
                { resizer: sharp().rotate(), suffix: SizeSuffix.Original },
                ...Object.values(Sizes).map(size => ({
                    resizer: sharp().resize(size.width, undefined, { withoutEnlargement: true }).rotate(),
                    suffix: size.suffix
                }))
            ];
            if (pngs.includes(extension)) {
                resizers.forEach(element => element.resizer = element.resizer.png());
            } else if (jpgs.includes(extension)) {
                resizers.forEach(element => element.resizer = element.resizer.jpeg());
            }
            for (const { resizer, suffix } of resizers) {
                await new Promise<void>(resolve => {
                    const filename = InjectSize(resolved, suffix);
                    information.serverAccessPaths[suffix] = serverPathToFile(Directory.images, filename);
                    request(requestable).pipe(resizer).pipe(fs.createWriteStream(serverPathToFile(Directory.images, filename)))
                        .on('close', resolve)
                        .on('error', reject);
                });
            }
            if (source.includes("Dash-Web")) {
                await new Promise<boolean>(resolve => {
                    fs.unlink(source, error => resolve(error === null));
                });
            }
            resolve(information);
        });
    };

    const convert = (url: string) => {
        let resolved: string;
        const matches = /Dash-Web[\\\/]src[\\\/]server[\\\/]public[\\\/](.*)/.exec(url);
        if (matches === null) {
            resolved = url;
        } else {
            resolved = `http://localhost:1050/${matches[1].split("\\").join("/")}`;
        }
        return resolved;
    };

    const parseExifData = async (source: string): Promise<EnrichedExifData> => {
        return new Promise<EnrichedExifData>(resolve => {
            new ExifImage(source, (error, data) => {
                let reason: Opt<string> = undefined;
                if (error) {
                    reason = (error as any).code;
                }
                resolve({ data, error: reason });
            });
        });
    };

}