import request = require('request-promise');
import { Authorization } from './GooglePhotosServerUtils';

export namespace GooglePhotosUploadUtils {

    interface UploadInformation {
        title: string;
        MEDIA_BINARY_DATA: string;
    }

    const apiEndpoint = "https://photoslibrary.googleapis.com/v1/uploads";

    export const SubmitUpload = async (parameters: Authorization & UploadInformation) => {
        let options = {
            headers: {
                'Content-Type': 'application/octet-stream',
                Authorization: `Bearer ${parameters.token}`,
                'X-Goog-Upload-File-Name': parameters.title,
                'X-Goog-Upload-Protocol': 'raw'
            },
            body: { MEDIA_BINARY_DATA: parameters.MEDIA_BINARY_DATA },
            json: true
        };
        const result = await request.post(apiEndpoint, options);
        return result;
    };

}