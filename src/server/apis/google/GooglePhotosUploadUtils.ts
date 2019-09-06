import request = require('request-promise');
import { GoogleApiServerUtils } from './GoogleApiServerUtils';
import * as fs from 'fs';
import { Utils } from '../../../Utils';
import * as path from 'path';
import { Opt } from '../../../new_fields/Doc';

export namespace GooglePhotosUploadUtils {

    export interface Paths {
        uploadDirectory: string;
        credentialsPath: string;
        tokenPath: string;
    }

    export interface MediaInput {
        description: string;
        source: string;
    }

    export interface DownloadInformation {
        mediaPath: string;
        contentType?: string;
        contentSize?: string;
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

    export const DispatchGooglePhotosUpload = async (filename: string) => {
        let body: Buffer;
        if (filename.includes('upload_')) {
            const mediaPath = Paths.uploadDirectory + filename;
            body = await new Promise<Buffer>((resolve, reject) => {
                fs.readFile(mediaPath, (error, data) => error ? reject(error) : resolve(data));
            });
        } else {
            body = await request(filename, { encoding: null });
        }
        const parameters = {
            method: 'POST',
            headers: {
                ...headers('octet-stream'),
                'X-Goog-Upload-File-Name': filename,
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

    export namespace IOUtils {

        export const Download = async (url: string): Promise<Opt<DownloadInformation>> => {
            const filename = `temporary_upload_${Utils.GenerateGuid()}${path.extname(url).toLowerCase()}`;
            const temporaryDirectory = Paths.uploadDirectory + "temporary/";
            const mediaPath = temporaryDirectory + filename;

            if (!(await createIfNotExists(temporaryDirectory))) {
                return undefined;
            }

            return new Promise<DownloadInformation>((resolve, reject) => {
                request.head(url, (error, res) => {
                    if (error) {
                        return reject(error);
                    }
                    const information: DownloadInformation = {
                        mediaPath,
                        contentType: res.headers['content-type'],
                        contentSize: res.headers['content-length'],
                    };
                    request(url).pipe(fs.createWriteStream(mediaPath)).on('close', () => resolve(information));
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

}