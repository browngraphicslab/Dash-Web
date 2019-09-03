import request = require('request-promise');
import { Authorization } from './GooglePhotosServerUtils';

export namespace GooglePhotosUploadUtils {

    interface UploadInformation {
        title: string;
        url: URL;
    }

    const apiEndpoint = "https://photoslibrary.googleapis.com/v1/uploads";

    export const SubmitUpload = async (parameters: Authorization & UploadInformation) => {
        let MEDIA_BINARY_DATA = binary(parameters.url.href);

        let options = {
            headers: {
                'Content-Type': 'application/octet-stream',
                Authorization: { 'bearer': parameters.token },
                'X-Goog-Upload-File-Name': parameters.title,
                'X-Goog-Upload-Protocol': 'raw'
            },
            body: { MEDIA_BINARY_DATA },
            json: true
        };
        const result = await request.post(apiEndpoint, options);
        return result;
    };

    const binary = (source: string) => {
        const image = document.createElement("img");
        image.src = source;
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        return dataUrl.replace(/^data:image\/(png|jpg);base64,/, "");
    };

}