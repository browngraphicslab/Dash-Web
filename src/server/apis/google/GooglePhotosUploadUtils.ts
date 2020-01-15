
import request = require('request-promise');
import * as path from 'path';
import { NewMediaItemResult } from './SharedTypes';
import { BatchedArray, TimeUnit } from 'array-batcher';
import { DashUploadUtils } from '../../DashUploadUtils';

/**
 * This namespace encompasses the logic
 * necessary to upload images to Google's server,
 * and then initialize / create those images in the Photos
 * API given the upload tokens returned from the initial
 * uploading process.
 * 
 * https://developers.google.com/photos/library/reference/rest/v1/mediaItems/batchCreate
 */
export namespace GooglePhotosUploadUtils {

    /**
     * Specifies the structure of the object
     * necessary to upload bytes to Google's servers.
     * The url is streamed to access the image's bytes,
     * and the description is what appears in Google Photos'
     * description field.
     */
    export interface UploadSource {
        url: string;
        description: string;
    }

    /**
     * This is the format needed to pass
     * into the BatchCreate API request
     * to take a reference to raw uploaded bytes
     * and actually create an image in Google Photos.
     * 
     * So, to instantiate this interface you must have already dispatched an upload
     * and received an upload token.
     */
    export interface NewMediaItem {
        description: string;
        simpleMediaItem: {
            uploadToken: string;
        };
    }

    /**
     * A utility function to streamline making
     * calls to the API's url - accentuates
     * the relative path in the caller.
     * @param extension the desired
     * subset of the API
     */
    function prepend(extension: string): string {
        return `https://photoslibrary.googleapis.com/v1/${extension}`;
    }

    /**
     * Factors out the creation of the API request's
     * authentication elements stored in the header.
     * @param type the contents of the request
     * @param token the user-specific Google access token
     */
    function headers(type: string, token: string) {
        return {
            'Content-Type': `application/${type}`,
            'Authorization': `Bearer ${token}`,
        };
    }

    /**
     * This is the first step in the remote image creation process.
     * Here we upload the raw bytes of the image to Google's servers by
     * setting authentication and other required header properties and including
     * the raw bytes to the image, to be uploaded, in the body of the request.
     * @param bearerToken the user-specific Google access token, specifies the account associated
     * with the eventual image creation
     * @param url the url of the image to upload
     * @param filename an optional name associated with the uploaded image - if not specified
     * defaults to the filename (basename) in the url
     */
    export const DispatchGooglePhotosUpload = async (bearerToken: string, url: string, filename?: string): Promise<any> => {
        // check if the url points to a non-image or an unsupported format
        if (!DashUploadUtils.validateExtension(url)) {
            return undefined;
        }
        const parameters = {
            method: 'POST',
            uri: prepend('uploads'),
            headers: {
                ...headers('octet-stream', bearerToken),
                'X-Goog-Upload-File-Name': filename || path.basename(url),
                'X-Goog-Upload-Protocol': 'raw'
            },
            body: await request(url, { encoding: null }) // returns a readable stream with the unencoded binary image data
        };
        return new Promise((resolve, reject) => request(parameters, (error, _response, body) => {
            if (error) {
                // on rejection, the server logs the error and the offending image
                return reject(error);
            }
            resolve(body);
        }));
    };

    /**
     * This is the second step in the remote image creation process: having uploaded
     * the raw bytes of the image and received / stored pointers (upload tokens) to those
     * bytes, we can now instruct the API to finalize the creation of those images by
     * submitting a batch create request with the list of upload tokens and the description
     * to be associated with reach resulting new image.
     * @param bearerToken the user-specific Google access token, specifies the account associated
     * with the eventual image creation
     * @param newMediaItems a list of objects containing a description and, effectively, the
     * pointer to the uploaded bytes
     * @param album if included, will add all of the newly created remote images to the album
     * with the specified id
     */
    export const CreateMediaItems = async (bearerToken: string, newMediaItems: NewMediaItem[], album?: { id: string }): Promise<NewMediaItemResult[]> => {
        // it's important to note that the API can't handle more than 50 items in each request and
        // seems to need at least some latency between requests (spamming it synchronously has led to the server returning errors)...
        const batched = BatchedArray.from(newMediaItems, { batchSize: 50 });
        // ...so we execute them in delayed batches and await the entire execution
        return batched.batchedMapPatientInterval(
            { magnitude: 100, unit: TimeUnit.Milliseconds },
            async (batch: NewMediaItem[], collector: any): Promise<any> => {
                const parameters = {
                    method: 'POST',
                    headers: headers('json', bearerToken),
                    uri: prepend('mediaItems:batchCreate'),
                    body: { newMediaItems: batch } as any,
                    json: true
                };
                // register the target album, if provided
                album && (parameters.body.albumId = album.id);
                collector.push(...(await new Promise<NewMediaItemResult[]>((resolve, reject) => {
                    request(parameters, (error, _response, body) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(body.newMediaItemResults);
                        }
                    });
                })));
            }
        );
    };

}