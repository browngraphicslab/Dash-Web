import request = require('request-promise');
import { GoogleApiServerUtils } from './GoogleApiServerUtils';
import * as fs from 'fs';
import { Utils } from '../../../Utils';
import * as path from 'path';
import { Opt } from '../../../new_fields/Doc';
import * as sharp from 'sharp';
import { MediaItemCreationResult } from './SharedTypes';
import { NewMediaItem } from "../../index";
import BatchedArray, { FixedBatcher, TimeUnit, Interval } from "array-batcher";

const uploadDirectory = path.join(__dirname, "../../public/files/");

export namespace GooglePhotosUploadUtils {

    export interface Paths {
        uploadDirectory: string;
        credentialsPath: string;
        tokenPath: string;
    }

    export interface MediaInput {
        url: string;
        description: string;
    }

    const prepend = (extension: string) => `https://photoslibrary.googleapis.com/v1/${extension}`;
    const headers = (type: string) => ({
        'Content-Type': `application/${type}`,
        'Authorization': Bearer,
    });

    let Bearer: string;
    let Paths: Paths;

    export const initialize = async (paths: Paths) => {
        Paths = paths;
        const { tokenPath, credentialsPath } = paths;
        const token = await GoogleApiServerUtils.RetrieveAccessToken({ tokenPath, credentialsPath });
        Bearer = `Bearer ${token}`;
    };

    export const DispatchGooglePhotosUpload = async (url: string) => {
        const body = await request(url, { encoding: null });
        const parameters = {
            method: 'POST',
            headers: {
                ...headers('octet-stream'),
                'X-Goog-Upload-File-Name': path.basename(url),
                'X-Goog-Upload-Protocol': 'raw'
            },
            uri: prepend('uploads'),
            body
        };
        return new Promise<any>((resolve, reject) => request(parameters, (error, _response, body) => {
            if (error) {
                console.log(error);
                return reject(error);
            }
            resolve(body);
        }));
    };

    export const CreateMediaItems = async (newMediaItems: NewMediaItem[], album?: { id: string }): Promise<MediaItemCreationResult> => {
        const newMediaItemResults = await BatchedArray.from(newMediaItems).batchedMapInterval({
            batcher: { batchSize: 50 },
            interval: { magnitude: 100, unit: TimeUnit.Milliseconds },
            converter: async (batch: NewMediaItem[]) => {
                const parameters = {
                    method: 'POST',
                    headers: headers('json'),
                    uri: prepend('mediaItems:batchCreate'),
                    body: { newMediaItems: batch } as any,
                    json: true
                };
                album && (parameters.body.albumId = album.id);
                return (await new Promise<MediaItemCreationResult>((resolve, reject) => {
                    request(parameters, (error, _response, body) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(body);
                        }
                    });
                })).newMediaItemResults;
            }
        });
        return { newMediaItemResults };
    };

}

export namespace DownloadUtils {

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
    const imageFormats = [...pngs, ...jpgs, ...gifs];
    const videoFormats = [".mov", ".mp4"];

    const size = "content-length";
    const type = "content-type";

    export interface UploadInformation {
        mediaPaths: string[];
        fileNames: { [key: string]: string };
        contentSize?: number;
        contentType?: string;
    }

    const generate = (prefix: string, url: string) => `${prefix}upload_${Utils.GenerateGuid()}${path.extname(url).toLowerCase()}`;
    const sanitize = (filename: string) => filename.replace(/\s+/g, "_");

    export interface InspectionResults {
        isLocal: boolean;
        stream: any;
        normalizedUrl: string;
        contentSize?: number;
        contentType?: string;
    }

    export const InspectImage = async (url: string): Promise<InspectionResults> => {
        const { isLocal, stream, normalized: normalizedUrl } = classify(url);
        const results = {
            isLocal,
            stream,
            normalizedUrl
        };
        if (isLocal) {
            return results;
        }
        const metadata = (await new Promise<any>((resolve, reject) => {
            request.head(url, async (error, res) => {
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

    export const UploadImage = async (metadata: InspectionResults, filename?: string, prefix = ""): Promise<Opt<UploadInformation>> => {
        const { isLocal, stream, normalizedUrl, contentSize, contentType } = metadata;
        const resolved = filename ? sanitize(filename) : generate(prefix, normalizedUrl);
        let extension = path.extname(normalizedUrl) || path.extname(resolved);
        extension && (extension = extension.toLowerCase());
        let information: UploadInformation = {
            mediaPaths: [],
            fileNames: { clean: resolved },
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

    export const createIfNotExists = async (path: string) => {
        if (await new Promise<boolean>(resolve => fs.exists(path, resolve))) {
            return true;
        }
        return new Promise<boolean>(resolve => fs.mkdir(path, error => resolve(error === null)));
    };

    export const Destroy = (mediaPath: string) => new Promise<boolean>(resolve => fs.unlink(mediaPath, error => resolve(error === null)));
}