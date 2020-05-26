import ApiManager, { Registration } from "./ApiManager";
import { Method, _error, _success, _invalid } from "../RouteManager";
import * as path from "path";
import { GoogleApiServerUtils } from "../apis/google/GoogleApiServerUtils";
import { BatchedArray, TimeUnit } from "array-batcher";
import { Opt } from "../../fields/Doc";
import { DashUploadUtils, InjectSize, SizeSuffix } from "../DashUploadUtils";
import { Database } from "../database";
import { red } from "colors";
import { Upload } from "../SharedMediaTypes";
import request = require('request-promise');
import { NewMediaItemResult } from "../apis/google/SharedTypes";

const prefix = "google_photos_";
const remoteUploadError = "None of the preliminary uploads to Google's servers was successful.";
const authenticationError = "Unable to authenticate Google credentials before uploading to Google Photos!";
const mediaError = "Unable to convert all uploaded bytes to media items!";
const localUploadError = (count: number) => `Unable to upload ${count} images to Dash's server`;
const requestError = "Unable to execute download: the body's media items were malformed.";
const downloadError = "Encountered an error while executing downloads.";

interface GooglePhotosUploadFailure {
    batch: number;
    index: number;
    url: string;
    reason: string;
}

interface MediaItem {
    baseUrl: string;
}

interface NewMediaItem {
    description: string;
    simpleMediaItem: {
        uploadToken: string;
    };
}

/**
 * This manager handles the creation of routes for google photos functionality.
 */
export default class GooglePhotosManager extends ApiManager {

    protected initialize(register: Registration): void {

        /**
         * This route receives a list of urls that point to images stored
         * on Dash's file system, and, in a two step process, uploads them to Google's servers and
         * returns the information Google generates about the associated uploaded remote images. 
         */
        register({
            method: Method.POST,
            subscription: "/googlePhotosMediaPost",
            secureHandler: async ({ user, req, res }) => {
                const { media } = req.body;

                // first we need to ensure that we know the google account to which these photos will be uploaded
                const token = await GoogleApiServerUtils.retrieveAccessToken(user.id);
                if (!token) {
                    return _error(res, authenticationError);
                }

                // next, having one large list or even synchronously looping over things trips a threshold
                // set on Google's servers, and would instantly return an error. So, we ease things out and send the photos to upload in
                // batches of 25, where the next batch is sent 100 millieconds after we receive a response from Google's servers.
                const failed: GooglePhotosUploadFailure[] = [];
                const batched = BatchedArray.from<Uploader.UploadSource>(media, { batchSize: 25 });
                const interval = { magnitude: 100, unit: TimeUnit.Milliseconds };
                const newMediaItems = await batched.batchedMapPatientInterval<NewMediaItem>(
                    interval,
                    async (batch, collector, { completedBatches }) => {
                        for (let index = 0; index < batch.length; index++) {
                            const { url, description } = batch[index];
                            // a local function used to record failure of an upload
                            const fail = (reason: string) => failed.push({ reason, batch: completedBatches + 1, index, url });
                            // see image resizing - we store the size-agnostic url in our logic, but write out size-suffixed images to the file system
                            // so here, given a size agnostic url, we're just making that conversion so that the file system knows which bytes to actually upload
                            const imageToUpload = InjectSize(url, SizeSuffix.Original);
                            // STEP 1/2: send the raw bytes of the image from our server to Google's servers. We'll get back an upload token
                            // which acts as a pointer to those bytes that we can use to locate them later on
                            const uploadToken = await Uploader.SendBytes(token, imageToUpload).catch(fail);
                            if (!uploadToken) {
                                fail(`${path.extname(url)} is not an accepted extension`);
                            } else {
                                // gather the upload token return from Google (a pointer they give us to the raw, currently useless bytes
                                // we've uploaded to their servers) and put in the JSON format that the API accepts for image creation (used soon, below)
                                collector.push({
                                    description,
                                    simpleMediaItem: { uploadToken }
                                });
                            }
                        }
                    }
                );

                // inform the developer / server console of any failed upload attempts
                // does not abort the operation, since some subset of the uploads may have been successful
                const { length } = failed;
                if (length) {
                    console.error(`Unable to upload ${length} image${length === 1 ? "" : "s"} to Google's servers`);
                    console.log(failed.map(({ reason, batch, index, url }) => `@${batch}.${index}: ${url} failed:\n${reason}`).join('\n\n'));
                }

                // if none of the preliminary uploads was successful, no need to try and create images
                // report the failure to the client and return
                if (!newMediaItems.length) {
                    console.error(red(`${remoteUploadError} Thus, aborting image creation. Please try again.`));
                    _error(res, remoteUploadError);
                    return;
                }

                // STEP 2/2: create the media items and return the API's response to the client, along with any failures
                return Uploader.CreateMediaItems(token, newMediaItems, req.body.album).then(
                    results => _success(res, { results, failed }),
                    error => _error(res, mediaError, error)
                );
            }
        });

        /**
         * This route receives a list of urls that point to images
         * stored on Google's servers and (following a *rough* heuristic)
         * uploads each image to Dash's server if it hasn't already been uploaded.
         * Unfortunately, since Google has so many of these images on its servers,
         * these user content urls expire every 6 hours. So we can't store the url of a locally uploaded
         * Google image and compare the candidate url to it to figure out if we already have it,
         * since the same bytes on their server might now be associated with a new, random url.
         * So, we do the next best thing and try to use an intrinsic attribute of those bytes as
         * an identifier: the precise content size. This works in small cases, but has the obvious flaw of failing to upload
         * an image locally if we already have uploaded another Google user content image with the exact same content size.   
         */
        register({
            method: Method.POST,
            subscription: "/googlePhotosMediaGet",
            secureHandler: async ({ req, res }) => {
                const { mediaItems } = req.body as { mediaItems: MediaItem[] };
                if (!mediaItems) {
                    // non-starter, since the input was in an invalid format
                    _invalid(res, requestError);
                    return;
                }
                let failed = 0;
                const completed: Opt<Upload.ImageInformation>[] = [];
                for (const { baseUrl } of mediaItems) {
                    // start by getting the content size of the remote image
                    const results = await DashUploadUtils.InspectImage(baseUrl);
                    if (results instanceof Error) {
                        // if something went wrong here, we can't hope to upload it, so just move on to the next
                        failed++;
                        continue;
                    }
                    const { contentSize, ...attributes } = results;
                    // check to see if we have uploaded a Google user content image *specifically via this route* already
                    // that has this exact content size
                    const found: Opt<Upload.ImageInformation> = await Database.Auxiliary.QueryUploadHistory(contentSize);
                    if (!found) {
                        // if we haven't, then upload it locally to Dash's server
                        const upload = await DashUploadUtils.UploadInspectedImage({ contentSize, ...attributes }, undefined, prefix, false).catch(error => _error(res, downloadError, error));
                        if (upload) {
                            completed.push(upload);
                            // inform the heuristic that we've encountered an image with this content size,
                            // to be later checked against in future uploads
                            await Database.Auxiliary.LogUpload(upload);
                        } else {
                            // make note of a failure to upload locallys
                            failed++;
                        }
                    } else {
                        // if we have, the variable 'found' is handily the upload information of the 
                        // existing image, so we add it to the list as if we had just uploaded it now without actually
                        // making a duplicate write
                        completed.push(found);
                    }
                }
                // if there are any failures, report a general failure to the client
                if (failed) {
                    return _error(res, localUploadError(failed));
                }
                // otherwise, return the image upload information list corresponding to the newly (or previously)
                // uploaded images
                _success(res, completed);
            }
        });

    }
}

/**
 * This namespace encompasses the logic
 * necessary to upload images to Google's server,
 * and then initialize / create those images in the Photos
 * API given the upload tokens returned from the initial
 * uploading process.
 * 
 * https://developers.google.com/photos/library/reference/rest/v1/mediaItems/batchCreate
 */
export namespace Uploader {

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
    export const SendBytes = async (bearerToken: string, url: string, filename?: string): Promise<any> => {
        // check if the url points to a non-image or an unsupported format
        if (!DashUploadUtils.validateExtension(url)) {
            return undefined;
        }
        const body = await request(url, { encoding: null }); // returns a readable stream with the unencoded binary image data
        const parameters = {
            method: 'POST',
            uri: prepend('uploads'),
            headers: {
                ...headers('octet-stream', bearerToken),
                'X-Goog-Upload-File-Name': filename || path.basename(url),
                'X-Goog-Upload-Protocol': 'raw'
            },
            body
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
            async (batch: NewMediaItem[], collector): Promise<void> => {
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