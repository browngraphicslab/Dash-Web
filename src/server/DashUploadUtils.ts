import { unlinkSync, createWriteStream, readFileSync, rename, writeFile } from 'fs';
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
import { Writable } from 'stream';
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

function isLocal() {
    return /Dash-Web[\\\/]src[\\\/]server[\\\/]public[\\\/](.*)/;
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
        accessPaths: AccessPathInfo;
        exifData: EnrichedExifData;
        contentSize?: number;
        contentType?: string;
    }

    export interface AccessPathInfo {
        [suffix: string]: { client: string, server: string };
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
                    const results = await UploadImage(path, basename(path));
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
        return { accessPaths: {} };
    }

    async function UploadPdf(absolutePath: string) {
        const dataBuffer = readFileSync(absolutePath);
        const result: ParsedPDF = await parse(dataBuffer);
        const parsedName = basename(absolutePath);
        await new Promise<void>((resolve, reject) => {
            const textFilename = `${parsedName.substring(0, parsedName.length - 4)}.txt`;
            const writeStream = createWriteStream(serverPathToFile(Directory.text, textFilename));
            writeStream.write(result.text, error => error ? reject(error) : resolve());
        });
        return MoveParsedFile(absolutePath, Directory.pdfs);
    }

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
    export const UploadImage = async (source: string, filename?: string, prefix: string = ""): Promise<ImageUploadInformation | Error> => {
        const metadata = await InspectImage(source);
        if (metadata instanceof Error) {
            return metadata;
        }
        return UploadInspectedImage(metadata, filename || metadata.filename, prefix);
    };

    export interface InspectionResults {
        source: string;
        requestable: string;
        exifData: EnrichedExifData;
        contentSize: number;
        contentType: string;
        nativeWidth: number;
        nativeHeight: number;
        filename?: string;
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

    export interface ImageResizer {
        resizer?: sharp.Sharp;
        suffix: SizeSuffix;
    }

    /**
     * Based on the url's classification as local or remote, gleans
     * as much information as possible about the specified image
     * 
     * @param source is the path or url to the image in question
     */
    export const InspectImage = async (source: string): Promise<InspectionResults | Error> => {
        let rawMatches: RegExpExecArray | null;
        let filename: string | undefined;
        if ((rawMatches = /^data:image\/([a-z]+);base64,(.*)/.exec(source)) !== null) {
            const [ext, data] = rawMatches.slice(1, 3);
            const resolved = filename = `upload_${Utils.GenerateGuid()}.${ext}`;
            const error = await new Promise<Error | null>(resolve => {
                writeFile(serverPathToFile(Directory.images, resolved), data, "base64", resolve);
            });
            if (error !== null) {
                return error;
            }
            source = `http://localhost:1050${clientPathToFile(Directory.images, resolved)}`;
        }
        let resolvedUrl: string;
        const matches = isLocal().exec(source);
        if (matches === null) {
            resolvedUrl = source;
        } else {
            resolvedUrl = `http://localhost:1050/${matches[1].split("\\").join("/")}`;
        }
        const exifData = await parseExifData(resolvedUrl);
        const results = {
            exifData,
            requestable: resolvedUrl
        };
        const { headers } = (await new Promise<any>((resolve, reject) => {
            request.head(resolvedUrl, (error, res) => error ? reject(error) : resolve(res));
        }).catch(error => console.error(error)));
        const { width: nativeWidth, height: nativeHeight }: RequestedImageSize = await requestImageSize(resolvedUrl);
        return {
            source,
            contentSize: parseInt(headers[size]),
            contentType: headers[type],
            nativeWidth,
            nativeHeight,
            filename,
            ...results
        };
    };

    export async function MoveParsedFile(absolutePath: string, destination: Directory): Promise<Opt<{ accessPaths: AccessPathInfo }>> {
        return new Promise(resolve => {
            const filename = basename(absolutePath);
            const destinationPath = serverPathToFile(destination, filename);
            rename(absolutePath, destinationPath, error => {
                resolve(error ? undefined : {
                    accessPaths: {
                        agnostic: getAccessPaths(destination, filename)
                    }
                });
            });
        });
    }

    function getAccessPaths(directory: Directory, fileName: string) {
        return {
            client: clientPathToFile(directory, fileName),
            server: serverPathToFile(directory, fileName)
        };
    }

    export const UploadInspectedImage = async (metadata: InspectionResults, filename?: string, prefix = "", cleanUp = true): Promise<ImageUploadInformation> => {
        const { requestable, source, ...remaining } = metadata;
        const extension = `.${remaining.contentType.split("/")[1].toLowerCase()}`;
        const resolved = filename || `${prefix}upload_${Utils.GenerateGuid()}${extension}`;
        const { images } = Directory;
        const information: ImageUploadInformation = {
            accessPaths: {
                agnostic: getAccessPaths(images, resolved)
            },
            ...remaining
        };
        const outputPath = pathToDirectory(Directory.images);
        const writtenFiles = await outputResizedImages(() => request(requestable), outputPath, resolved, extension);
        for (const suffix of Object.keys(writtenFiles)) {
            information.accessPaths[suffix] = getAccessPaths(images, writtenFiles[suffix]);
        }
        if (isLocal().test(source) && cleanUp) {
            unlinkSync(source);
        }
        return information;
    };

    const parseExifData = async (source: string): Promise<EnrichedExifData> => {
        const image = await request.get(source, { encoding: null });
        return new Promise<EnrichedExifData>(resolve => {
            new ExifImage({ image }, (error, data) => {
                let reason: Opt<string> = undefined;
                if (error) {
                    reason = (error as any).code;
                }
                resolve({ data, error: reason });
            });
        });
    };

    const { pngs, jpgs, webps, tiffs } = AcceptibleMedia;
    const pngOptions = {
        compressionLevel: 9,
        adaptiveFiltering: true,
        force: true
    };

    export interface ReadStreamLike {
        pipe: (dest: Writable) => Writable;
    }

    export async function outputResizedImages(readStreamSource: () => ReadStreamLike | Promise<ReadStreamLike>, outputPath: string, fileName: string, ext: string) {
        const writtenFiles: { [suffix: string]: string } = {};
        for (const { resizer, suffix } of resizers(ext)) {
            const resolved = writtenFiles[suffix] = InjectSize(fileName, suffix);
            await new Promise<void>(async (resolve, reject) => {
                const writeStream = createWriteStream(path.resolve(outputPath, resolved));
                let readStream: ReadStreamLike;
                const source = readStreamSource();
                if (source instanceof Promise) {
                    readStream = await source;
                } else {
                    readStream = source;
                }
                if (resizer) {
                    readStream = readStream.pipe(resizer.withMetadata());
                }
                const out = readStream.pipe(writeStream);
                out.on("close", resolve);
                out.on("error", reject);
            });
        }
        return writtenFiles;
    }

    function resizers(ext: string): DashUploadUtils.ImageResizer[] {
        return [
            { suffix: SizeSuffix.Original },
            ...Object.values(DashUploadUtils.Sizes).map(size => {
                let initial: sharp.Sharp | undefined = sharp().resize(size.width, undefined, { withoutEnlargement: true });
                if (pngs.includes(ext)) {
                    initial = initial.png(pngOptions);
                } else if (jpgs.includes(ext)) {
                    initial = initial.jpeg();
                } else if (webps.includes(ext)) {
                    initial = initial.webp();
                } else if (tiffs.includes(ext)) {
                    initial = initial.tiff();
                } else {
                    initial = undefined;
                }
                return {
                    resizer: initial,
                    suffix: size.suffix
                };
            })
        ];
    }

}