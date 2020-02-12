import ApiManager, { Registration } from "./ApiManager";
import { Method, _error, _success, _invalid } from "../RouteManager";
import * as path from "path";
import { GoogleApiServerUtils } from "../apis/google/GoogleApiServerUtils";
import { BatchedArray, TimeUnit } from "array-batcher";
import { GooglePhotosUploadUtils } from "../apis/google/GooglePhotosUploadUtils";
import { Opt } from "../../new_fields/Doc";
import { DashUploadUtils, InjectSize, SizeSuffix } from "../DashUploadUtils";
import { Database } from "../database";

const authenticationError = "Unable to authenticate Google credentials before uploading to Google Photos!";
const mediaError = "Unable to convert all uploaded bytes to media items!";
const UploadError = (count: number) => `Unable to upload ${count} images to Dash's server`;
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
const prefix = "google_photos_";

/**
 * This manager handles the creation of routes for google photos functionality.
 */
export default class GooglePhotosManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.POST,
            subscription: "/googlePhotosMediaUpload",
            secureHandler: async ({ user, req, res }) => {
                const { media } = req.body;
                const token = await GoogleApiServerUtils.retrieveAccessToken(user.id);
                if (!token) {
                    return _error(res, authenticationError);
                }
                const failed: GooglePhotosUploadFailure[] = [];
                const batched = BatchedArray.from<GooglePhotosUploadUtils.UploadSource>(media, { batchSize: 25 });
                const newMediaItems = await batched.batchedMapPatientInterval<NewMediaItem>(
                    { magnitude: 100, unit: TimeUnit.Milliseconds },
                    async (batch: any, collector: any, { completedBatches }: any) => {
                        for (let index = 0; index < batch.length; index++) {
                            const { url, description } = batch[index];
                            const fail = (reason: string) => failed.push({ reason, batch: completedBatches + 1, index, url });
                            const uploadToken = await GooglePhotosUploadUtils.DispatchGooglePhotosUpload(token, InjectSize(url, SizeSuffix.Original)).catch(fail);
                            if (!uploadToken) {
                                fail(`${path.extname(url)} is not an accepted extension`);
                            } else {
                                collector.push({
                                    description,
                                    simpleMediaItem: { uploadToken }
                                });
                            }
                        }
                    }
                );
                const failedCount = failed.length;
                if (failedCount) {
                    console.error(`Unable to upload ${failedCount} image${failedCount === 1 ? "" : "s"} to Google's servers`);
                    console.log(failed.map(({ reason, batch, index, url }) => `@${batch}.${index}: ${url} failed:\n${reason}`).join('\n\n'));
                }
                return GooglePhotosUploadUtils.CreateMediaItems(token, newMediaItems, req.body.album).then(
                    results => _success(res, { results, failed }),
                    error => _error(res, mediaError, error)
                );
            }
        });

        register({
            method: Method.POST,
            subscription: "/googlePhotosMediaDownload",
            secureHandler: async ({ req, res }) => {
                const { mediaItems } = req.body as { mediaItems: MediaItem[] };
                let failed = 0;
                if (mediaItems) {
                    const completed: Opt<DashUploadUtils.ImageUploadInformation>[] = [];
                    for (const { baseUrl } of mediaItems) {
                        const results = await DashUploadUtils.InspectImage(baseUrl);
                        if (results instanceof Error) {
                            failed++;
                            continue;
                        }
                        const { contentSize, ...attributes } = results;
                        const found: Opt<DashUploadUtils.ImageUploadInformation> = await Database.Auxiliary.QueryUploadHistory(contentSize);
                        if (!found) {
                            const upload = await DashUploadUtils.UploadInspectedImage({ contentSize, ...attributes }, undefined, prefix, false).catch(error => _error(res, downloadError, error));
                            if (upload) {
                                completed.push(upload);
                                await Database.Auxiliary.LogUpload(upload);
                            } else {
                                failed++;
                            }
                        } else {
                            completed.push(found);
                        }
                    }
                    if (failed) {
                        return _error(res, UploadError(failed));
                    }
                    return _success(res, completed);
                }
                _invalid(res, requestError);
            }
        });

    }
}