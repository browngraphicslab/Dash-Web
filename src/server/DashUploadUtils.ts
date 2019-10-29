import * as fs from 'fs';
import { Utils } from '../Utils';
import * as path from 'path';
import * as sharp from 'sharp';
import request = require('request-promise');
import { ExifData, ExifImage } from 'exif';
import { Opt } from '../new_fields/Doc';

const uploadDirectory = path.join(__dirname, './public/files/');

export namespace DashUploadUtils {

    export interface Size {
        width: number;
        suffix: string;
    }

    export const Sizes: { [size: string]: Size } = {
        SMALL: { width: 100, suffix: "_s" },
        MEDIUM: { width: 400, suffix: "_m" },
        LARGE: { width: 900, suffix: "_l" },
    };

    const gifs = [".gif"];
    const pngs = [".png"];
    const jpgs = [".jpg", ".jpeg"];
    export const imageFormats = [...pngs, ...jpgs, ...gifs];
    const videoFormats = [".mov", ".mp4"];

    const size = "content-length";
    const type = "content-type";

    export interface UploadInformation {
        mediaPaths: string[];
        fileNames: { [key: string]: string };
        exifData: EnrichedExifData;
        contentSize?: number;
        contentType?: string;
    }

    const generate = (prefix: string, url: string) => `${prefix}upload_${Utils.GenerateGuid()}${sanitizeExtension(url)}`;
    const sanitize = (filename: string) => filename.replace(/\s+/g, "_");
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
     * @returns {UploadInformation} This method returns
     * 1) the paths to the uploaded images (plural due to resizing)
     * 2) the file name of each of the resized images
     * 3) the size of the image, in bytes (4432130)
     * 4) the content type of the image, i.e. image/(jpeg | png | ...)
     */
    export const UploadImage = async (source: string, filename?: string, prefix: string = ""): Promise<UploadInformation> => {
        const metadata = await InspectImage(source);
        return UploadInspectedImage(metadata, filename, prefix);
    };

    export interface InspectionResults {
        isLocal: boolean;
        stream: any;
        normalizedUrl: string;
        exifData: EnrichedExifData;
        contentSize?: number;
        contentType?: string;
    }

    export interface EnrichedExifData {
        data: ExifData;
        error?: string;
    }

    /**
     * Based on the url's classification as local or remote, gleans
     * as much information as possible about the specified image
     * 
     * @param source is the path or url to the image in question
     */
    export const InspectImage = async (source: string): Promise<InspectionResults> => {
        const { isLocal, stream, normalized: normalizedUrl } = classify(source);
        const exifData = await parseExifData(source);
        const results = {
            exifData,
            isLocal,
            stream,
            normalizedUrl
        };
        // stop here if local, since request.head() can't handle local paths, only urls on the web
        if (isLocal) {
            return results;
        }
        const metadata = (await new Promise<any>((resolve, reject) => {
            request.head(source, async (error, res) => {
                if (error) {
                    return reject(error);
                }
                resolve(res);
            });
        })).headers;
        return {
            contentSize: parseInt(metadata[size]),
            contentType: metadata[type],
            ...results
        };
    };

    export const UploadInspectedImage = async (metadata: InspectionResults, filename?: string, prefix = ""): Promise<UploadInformation> => {
        const { isLocal, stream, normalizedUrl, contentSize, contentType, exifData } = metadata;
        const resolved = filename ? sanitize(filename) : generate(prefix, normalizedUrl);
        const extension = sanitizeExtension(normalizedUrl || resolved);
        let information: UploadInformation = {
            mediaPaths: [],
            fileNames: { clean: resolved },
            exifData,
            contentSize,
            contentType,
        };
        return new Promise<UploadInformation>(async (resolve, reject) => {
            const resizers = [
                { resizer: sharp().rotate(), suffix: "_o" },
                ...Object.values(Sizes).map(size => ({
                    resizer: sharp().resize(size.width, undefined, { withoutEnlargement: true }).rotate(),
                    suffix: size.suffix
                }))
            ];
            let nonVisual = false;
            if (pngs.includes(extension)) {
                resizers.forEach(element => element.resizer = element.resizer.png());
            } else if (jpgs.includes(extension)) {
                resizers.forEach(element => element.resizer = element.resizer.jpeg());
            } else if (![...imageFormats, ...videoFormats].includes(extension.toLowerCase())) {
                nonVisual = true;
            }
            if (imageFormats.includes(extension)) {
                for (let resizer of resizers) {
                    const suffix = resizer.suffix;
                    let mediaPath: string;
                    await new Promise<void>(resolve => {
                        const filename = resolved.substring(0, resolved.length - extension.length) + suffix + extension;
                        information.mediaPaths.push(mediaPath = uploadDirectory + filename);
                        information.fileNames[suffix] = filename;
                        stream(normalizedUrl).pipe(resizer.resizer).pipe(fs.createWriteStream(mediaPath))
                            .on('close', resolve)
                            .on('error', reject);
                    });
                }
            }
            if (!isLocal || nonVisual) {
                await new Promise<void>(resolve => {
                    stream(normalizedUrl).pipe(fs.createWriteStream(uploadDirectory + resolved)).on('close', resolve);
                });
            }
            resolve(information);
        });
    };

    const classify = (url: string) => {
        const isLocal = /Dash-Web(\\|\/)src(\\|\/)server(\\|\/)public(\\|\/)files/g.test(url);
        return {
            isLocal,
            stream: isLocal ? fs.createReadStream : request,
            normalized: isLocal ? path.normalize(url) : url
        };
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

    export const createIfNotExists = async (path: string) => {
        if (await new Promise<boolean>(resolve => fs.exists(path, resolve))) {
            return true;
        }
        return new Promise<boolean>(resolve => fs.mkdir(path, error => resolve(error === null)));
    };

    export const Destroy = (mediaPath: string) => new Promise<boolean>(resolve => fs.unlink(mediaPath, error => resolve(error === null)));

}