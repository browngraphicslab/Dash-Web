import request = require('request-promise');
import { Album } from './typings/albums';
import * as qs from 'query-string';

const apiEndpoint = "https://photoslibrary.googleapis.com/v1/";

export interface Authorization {
    token: string;
}

export namespace GooglePhotos {

    export type Query = Album.Query;
    export type QueryParameters = { query: GooglePhotos.Query };
    interface DispatchParameters {
        required: boolean;
        method: "GET" | "POST";
        ignore?: boolean;
    }

    export const ExecuteQuery = async (parameters: Authorization & QueryParameters): Promise<any> => {
        let action = parameters.query.action;
        let dispatch = SuffixMap.get(action)!;
        let suffix = Suffix(parameters, dispatch, action);
        if (suffix) {
            let query: any = parameters.query;
            let options: any = {
                headers: { 'Content-Type': 'application/json' },
                auth: { 'bearer': parameters.token },
            };
            if (query.body) {
                options.body = query.body;
                options.json = true;
            }
            let queryParameters = query.parameters;
            if (queryParameters) {
                suffix += `?${qs.stringify(queryParameters)}`;
            }
            let dispatcher = dispatch.method === "POST" ? request.post : request.get;
            return dispatcher(apiEndpoint + suffix, options);
        }
    };

    const Suffix = (parameters: QueryParameters, dispatch: DispatchParameters, action: Album.Action) => {
        let query: any = parameters.query;
        let id = query.albumId;
        let suffix = 'albums';
        if (dispatch.required) {
            if (!id) {
                return undefined;
            }
            suffix += `/${id}${dispatch.ignore ? "" : `:${action}`}`;
        }
        return suffix;
    };

    const SuffixMap = new Map<Album.Action, DispatchParameters>([
        [Album.Action.AddEnrichment, { required: true, method: "POST" }],
        [Album.Action.BatchAddMediaItems, { required: true, method: "POST" }],
        [Album.Action.BatchRemoveMediaItems, { required: true, method: "POST" }],
        [Album.Action.Create, { required: false, method: "POST" }],
        [Album.Action.Get, { required: true, ignore: true, method: "GET" }],
        [Album.Action.List, { required: false, method: "GET" }],
        [Album.Action.Share, { required: true, method: "POST" }],
        [Album.Action.Unshare, { required: true, method: "POST" }]
    ]);

}
