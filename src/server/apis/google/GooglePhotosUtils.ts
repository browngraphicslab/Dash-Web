import request = require('request-promise');
import { Album } from './Typings/albums';

const apiEndpoint = "https://photoslibrary.googleapis.com";

export namespace GooglePhotos {

    export type Query = Album.Query;

    export const ExecuteQuery = async (authToken: string, query: GooglePhotos.Query) => {
        let options = {
            headers: { 'Content-Type': 'application/json' },
            auth: { 'bearer': authToken },
            body: query.body,
            json: true
        };
        const result = await request.post(apiEndpoint + '/v1/albums', options);
        return result;
    };

}
