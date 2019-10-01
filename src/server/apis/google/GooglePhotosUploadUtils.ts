import request = require('request-promise');
import { GoogleApiServerUtils } from './GoogleApiServerUtils';
import * as path from 'path';
import { MediaItemCreationResult } from './SharedTypes';
import { NewMediaItem } from "../../index";
import { BatchedArray, TimeUnit } from 'array-batcher';

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

    export const initialize = async (information: GoogleApiServerUtils.CredentialInformation) => {
        const token = await GoogleApiServerUtils.RetrieveAccessToken(information);
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
        const newMediaItemResults = await BatchedArray.from(newMediaItems, { batchSize: 50 }).batchedMapPatientInterval(
            { magnitude: 100, unit: TimeUnit.Milliseconds },
            async (batch: NewMediaItem[]) => {
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
        );
        return { newMediaItemResults };
    };

}