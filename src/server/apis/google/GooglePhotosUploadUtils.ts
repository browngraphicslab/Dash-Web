import request = require('request-promise');
import { GoogleApiServerUtils } from './GoogleApiServerUtils';
import * as fs from 'fs';
import { Utils } from '../../../Utils';
import * as path from 'path';
import { Opt } from '../../../new_fields/Doc';
import * as sharp from 'sharp';

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
        return new Promise<any>(resolve => request(parameters, (error, _response, body) => resolve(error ? undefined : body)));
    };

    export const CreateMediaItems = (newMediaItems: any[], album?: { id: string }) => {
        return new Promise<any>((resolve, reject) => {
            const parameters = {
                method: 'POST',
                headers: headers('json'),
                uri: prepend('mediaItems:batchCreate'),
                body: { newMediaItems } as any,
                json: true
            };
            album && (parameters.body.albumId = album.id);
            request(parameters, (error, _response, body) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(body);
                }
            });
        });
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

    const png = ".png";
    const pngs = [".png", ".PNG"];
    const jpg = [".jpg", ".JPG", ".jpeg", ".JPEG"];
    const size = "content-length";
    const type = "content-type";

    export interface DownloadInformation {
        mediaPaths: string[];
        fileNames: { [key: string]: string };
        contentSize?: string;
        contentType?: string;
    }

    const generate = (prefix: string, url: string) => `${prefix}upload_${Utils.GenerateGuid()}${path.extname(url).toLowerCase()}`;
    const sanitize = (filename: string) => filename.replace(/\s+/g, "_");

    export const Download = async (url: string, filename?: string, prefix = ""): Promise<Opt<DownloadInformation>> => {
        const resolved = filename ? sanitize(filename) : generate(prefix, url);
        const extension = path.extname(url) || path.extname(resolved) || png;
        return new Promise<DownloadInformation>((resolve, reject) => {
            request.head(url, async (error, res) => {
                if (error) {
                    return reject(error);
                }
                const information: DownloadInformation = {
                    fileNames: { clean: resolved },
                    contentSize: res.headers[size],
                    contentType: res.headers[type],
                    mediaPaths: []
                };
                const resizers = [
                    { resizer: sharp().rotate(), suffix: "_o" },
                    ...Object.values(Sizes).map(size => ({
                        resizer: sharp().resize(size.width, undefined, { withoutEnlargement: true }).rotate(),
                        suffix: size.suffix
                    }))
                ];
                let validated = true;
                if (pngs.includes(extension)) {
                    resizers.forEach(element => element.resizer = element.resizer.png());
                } else if (jpg.includes(extension)) {
                    resizers.forEach(element => element.resizer = element.resizer.jpeg());
                } else {
                    validated = false;
                }
                if (validated) {
                    for (let resizer of resizers) {
                        const suffix = resizer.suffix;
                        let mediaPath: string;
                        await new Promise<void>(resolve => {
                            const filename = resolved.substring(0, resolved.length - extension.length) + suffix + extension;
                            information.mediaPaths.push(mediaPath = uploadDirectory + filename);
                            information.fileNames[suffix] = filename;
                            request(url)
                                .pipe(resizer.resizer)
                                .pipe(fs.createWriteStream(mediaPath))
                                .on('close', resolve);
                        });
                    }
                    resolve(information);
                }
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