import { unlinkSync, createWriteStream, readFileSync, rename, writeFile, existsSync } from 'fs';
import { Utils } from '../Utils';
import * as path from 'path';
import * as sharp from 'sharp';
import request = require('request-promise');
import { ExifImage } from 'exif';
import { Opt } from '../fields/Doc';
import { AcceptibleMedia, Upload } from './SharedMediaTypes';
import { filesDirectory, publicDirectory } from '.';
import { File } from 'formidable';
import { basename } from "path";
import { createIfNotExists } from './ActionUtilities';
import { ParsedPDF } from "../server/PdfTypes";
const parse = require('pdf-parse');
import { Directory, serverPathToFile, clientPathToFile, pathToDirectory } from './ApiManagers/UploadManager';
import { red } from 'colors';
import { Stream } from 'stream';
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

    const { imageFormats, videoFormats, applicationFormats, audioFormats } = AcceptibleMedia;

    export async function upload(file: File): Promise<Upload.FileResponse> {
        const { type, path, name } = file;
        const types = type.split("/");

        const category = types[0];
        let format = `.${types[1]}`;

        switch (category) {
            case "image":
                if (imageFormats.includes(format)) {
                    const result = await UploadImage(path, basename(path));
                    return { source: file, result };
                }
            case "video":
                if (videoFormats.includes(format)) {
                    return MoveParsedFile(file, Directory.videos);
                }
            case "application":
                if (applicationFormats.includes(format)) {
                    return UploadPdf(file);
                }
            case "audio":
                const components = format.split(";");
                if (components.length > 1) {
                    format = components[0];
                }
                if (audioFormats.includes(format)) {
                    return UploadAudio(file, format);
                }
        }

        console.log(red(`Ignoring unsupported file (${name}) with upload type (${type}).`));
        return { source: file, result: new Error(`Could not upload unsupported file (${name}) with upload type (${type}).`) };
    }

    async function UploadPdf(file: File) {
        const { path: sourcePath } = file;
        const dataBuffer = readFileSync(sourcePath);
        const result: ParsedPDF = await parse(dataBuffer);
        await new Promise<void>((resolve, reject) => {
            const name = path.basename(sourcePath);
            const textFilename = `${name.substring(0, name.length - 4)}.txt`;
            const writeStream = createWriteStream(serverPathToFile(Directory.text, textFilename));
            writeStream.write(result.text, error => error ? reject(error) : resolve());
        });
        return MoveParsedFile(file, Directory.pdfs);
    }

    const manualSuffixes = [".webm"];

    async function UploadAudio(file: File, format: string) {
        const suffix = manualSuffixes.includes(format) ? format : undefined;
        return MoveParsedFile(file, Directory.audio, suffix);
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
     * @returns {ImageUploadInformation | Error} This method returns
     * 1) the paths to the uploaded images (plural due to resizing)
     * 2) the exif data embedded in the image, or the error explaining why exif couldn't be parsed
     * 3) the size of the image, in bytes (4432130)
     * 4) the content type of the image, i.e. image/(jpeg | png | ...)
     */
    export const UploadImage = async (source: string, filename?: string, prefix: string = ""): Promise<Upload.ImageInformation | Error> => {
        const metadata = await InspectImage(source);
        if (metadata instanceof Error) {
            return metadata;
        }
        return UploadInspectedImage(metadata, filename || metadata.filename, prefix);
    };

    export async function buildFileDirectories() {
        if (!existsSync(publicDirectory)) {
            console.error("\nPlease ensure that the following directory exists...\n");
            console.log(publicDirectory);
            process.exit(0);
        }
        if (!existsSync(filesDirectory)) {
            console.error("\nPlease ensure that the following directory exists...\n");
            console.log(filesDirectory);
            process.exit(0);
        }
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
    export const InspectImage = async (source: string): Promise<Upload.InspectionResults | Error> => {
        let rawMatches: RegExpExecArray | null;
        let filename: string | undefined;
        /**
         * Just more edge case handling: this if clause handles the case where an image onto the canvas that
         * is represented by a base64 encoded data uri, rather than a proper file. We manually write it out
         * to the server and then carry on as if it had been put there by the Formidable form / file parser.
         */
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
        /**
         * At this point, we want to take whatever url we have and make sure it's requestable.
         * Anything that's hosted by some other website already is, but if the url is a local file url
         * (locates the file on this server machine), we have to resolve the client side url by cutting out the
         * basename subtree (i.e. /images/<some_guid>.<ext>) and put it on the end of the server's url.
         * 
         * This can always be localhost, regardless of whether this is on the server or not, since we (the server, not the client)
         * will be the ones making the request, and from the perspective of dash-release or dash-web, localhost:1050 refers to the same thing
         * as the full dash-release.eastus.cloudapp.azure.com:1050.
         */
        const matches = isLocal().exec(source);
        if (matches === null) {
            resolvedUrl = source;
        } else {
            resolvedUrl = `http://localhost:1050/${matches[1].split("\\").join("/")}`;
        }
        // See header comments: not all image files have exif data (I believe only JPG is the only format that can have it)
        const exifData = await parseExifData(resolvedUrl);
        const results = {
            exifData,
            requestable: resolvedUrl
        };
        // Use the request library to parse out file level image information in the headers
        const { headers } = (await new Promise<any>((resolve, reject) => {
            request.head(resolvedUrl, (error, res) => error ? reject(error) : resolve(res));
        }).catch(error => console.error(error)));
        // Compute the native width and height ofthe image with an npm module
        const { width: nativeWidth, height: nativeHeight }: RequestedImageSize = await requestImageSize(resolvedUrl);
        // Bundle up the information into an object
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

    /**
     * Basically just a wrapper around rename, which 'deletes'
     * the file at the old path and 'moves' it to the new one. For simplicity, the
     * caller just has to pass in the name of the target directory, and this function
     * will resolve the actual target path from that.
     * @param file The file to move
     * @param destination One of the specific media asset directories into which to move it
     * @param suffix If the file doesn't have a suffix and you want to provide it one
     * to appear in the new location
     */
    export async function MoveParsedFile(file: File, destination: Directory, suffix: string | undefined = undefined): Promise<Upload.FileResponse> {
        const { path: sourcePath } = file;
        let name = path.basename(sourcePath);
        suffix && (name += suffix);
        return new Promise(resolve => {
            const destinationPath = serverPathToFile(destination, name);
            rename(sourcePath, destinationPath, error => {
                resolve({
                    source: file,
                    result: error ? error : {
                        accessPaths: {
                            agnostic: getAccessPaths(destination, name)
                        }
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

    export const UploadInspectedImage = async (metadata: Upload.InspectionResults, filename?: string, prefix = "", cleanUp = true): Promise<Upload.ImageInformation> => {
        const { requestable, source, ...remaining } = metadata;
        const resolved = filename || `${prefix}upload_${Utils.GenerateGuid()}.${remaining.contentType.split("/")[1].toLowerCase()}`;
        const { images } = Directory;
        const information: Upload.ImageInformation = {
            accessPaths: {
                agnostic: getAccessPaths(images, resolved)
            },
            ...metadata
        };
        const writtenFiles = await outputResizedImages(() => request(requestable), resolved, pathToDirectory(Directory.images));
        for (const suffix of Object.keys(writtenFiles)) {
            information.accessPaths[suffix] = getAccessPaths(images, writtenFiles[suffix]);
        }
        if (isLocal().test(source) && cleanUp) {
            unlinkSync(source);
        }
        return information;
    };

    const bufferConverterRec = (layer: any) => {
        for (const key of Object.keys(layer)) {
            const val: any = layer[key];
            if (val instanceof Buffer) {
                layer[key] = val.toString();
            } else if (Array.isArray(val) && typeof val[0] === "number") {
                layer[key] = Buffer.from(val).toString();
            } else if (typeof val === "object") {
                bufferConverterRec(val);
            }
        }
    };

    const parseExifData = async (source: string): Promise<Upload.EnrichedExifData> => {
        const image = await request.get(source, { encoding: null });
        const { data, error } = await new Promise(resolve => {
            new ExifImage({ image }, (error, data) => {
                let reason: Opt<string> = undefined;
                if (error) {
                    reason = (error as any).code;
                }
                resolve({ data, error: reason });
            });
        });
        data && bufferConverterRec(data);
        return { data, error };
    };

    const { pngs, jpgs, webps, tiffs } = AcceptibleMedia;
    const pngOptions = {
        compressionLevel: 9,
        adaptiveFiltering: true,
        force: true
    };

    export async function outputResizedImages(streamProvider: () => Stream | Promise<Stream>, outputFileName: string, outputDirectory: string) {
        const writtenFiles: { [suffix: string]: string } = {};
        for (const { resizer, suffix } of resizers(path.extname(outputFileName))) {
            const outputPath = path.resolve(outputDirectory, writtenFiles[suffix] = InjectSize(outputFileName, suffix));
            await new Promise<void>(async (resolve, reject) => {
                const source = streamProvider();
                let readStream: Stream;
                if (source instanceof Promise) {
                    readStream = await source;
                } else {
                    readStream = source;
                }
                if (resizer) {
                    readStream = readStream.pipe(resizer.withMetadata());
                }
                readStream.pipe(createWriteStream(outputPath)).on("close", resolve).on("error", reject);
            });
        }
        return writtenFiles;
    }

    function resizers(ext: string): DashUploadUtils.ImageResizer[] {
        return [
            { suffix: SizeSuffix.Original },
            ...Object.values(DashUploadUtils.Sizes).map(({ suffix, width }) => {
                let initial: sharp.Sharp | undefined = sharp().resize(width, undefined, { withoutEnlargement: true });
                if (pngs.includes(ext)) {
                    initial = initial.png(pngOptions);
                } else if (jpgs.includes(ext)) {
                    initial = initial.jpeg();
                } else if (webps.includes(ext)) {
                    initial = initial.webp();
                } else if (tiffs.includes(ext)) {
                    initial = initial.tiff();
                } else if (ext === ".gif") {
                    initial = undefined;
                }
                return {
                    resizer: initial,
                    suffix
                };
            })
        ];
    }

}