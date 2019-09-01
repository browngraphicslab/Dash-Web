import { google, docs_v1, slides_v1 } from "googleapis";
import { createInterface } from "readline";
import { readFile, writeFile } from "fs";
import { OAuth2Client } from "google-auth-library";
import { Opt } from "../../../new_fields/Doc";
import { GlobalOptions } from "googleapis-common";
import { GaxiosResponse } from "gaxios";
import Photos = require("googlephotos");

/**
 * Server side authentication for Google Api queries.
 */
export namespace GoogleApiServerUtils {

    // If modifying these scopes, delete token.json.
    const prefix = 'https://www.googleapis.com/auth/';
    const SCOPES = [
        'documents.readonly',
        'documents',
        'presentations',
        'presentations.readonly',
        'drive',
        'drive.file',
        'photoslibrary',
        'photoslibrary.sharing'
    ];

    export const parseBuffer = (data: Buffer) => JSON.parse(data.toString());

    export enum Service {
        Documents = "Documents",
        Slides = "Slides",
        Photos = "Photos"
    }

    export interface CredentialPaths {
        credentials: string;
        token: string;
    }

    export type ApiResponse = Promise<GaxiosResponse>;
    export type ApiRouter = (endpoint: Endpoint, paramters: any) => ApiResponse;
    export type ApiHandler = (parameters: any) => ApiResponse;
    export type Action = "create" | "retrieve" | "update";

    export type Endpoint = { get: ApiHandler, create: ApiHandler, batchUpdate: ApiHandler };
    export type EndpointParameters = GlobalOptions & { version: "v1" };

    export const GetEndpoint = async (sector: string, paths: CredentialPaths) => {
        return new Promise<Opt<Endpoint>>((resolve, reject) => {
            readFile(paths.credentials, (err, credentials) => {
                if (err) {
                    reject(err);
                    return console.log('Error loading client secret file:', err);
                }
                return authorize(parseBuffer(credentials), paths.token).then(async auth => {
                    let routed: Opt<Endpoint>;
                    let parameters: EndpointParameters = { auth, version: "v1" };
                    switch (sector) {
                        case Service.Documents:
                            routed = google.docs(parameters).documents;
                            break;
                        case Service.Slides:
                            routed = google.slides(parameters).presentations;
                            break;
                        case Service.Photos:
                            const photos = new Photos(auth);
                            let response = await photos.albums.list();
                            console.log("WE GOT SOMETHING!", response);
                    }
                    resolve(routed);
                });
            });
        });
    };


    /**
     * Create an OAuth2 client with the given credentials, and returns the promise resolving to the authenticated client
     * @param {Object} credentials The authorization client credentials.
     */
    export function authorize(credentials: any, token_path: string): Promise<OAuth2Client> {
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);

        return new Promise<OAuth2Client>((resolve, reject) => {
            readFile(token_path, (err, token) => {
                // Check if we have previously stored a token.
                if (err) {
                    return getNewToken(oAuth2Client, token_path).then(resolve, reject);
                }
                oAuth2Client.setCredentials(parseBuffer(token));
                resolve(oAuth2Client);
            });
        });
    }

    /**
     * Get and store new token after prompting for user authorization, and then
     * execute the given callback with the authorized OAuth2 client.
     * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
     * @param {getEventsCallback} callback The callback for the authorized client.
     */
    function getNewToken(oAuth2Client: OAuth2Client, token_path: string) {
        return new Promise<OAuth2Client>((resolve, reject) => {
            const authUrl = oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES.map(relative => prefix + relative),
            });
            console.log('Authorize this app by visiting this url:', authUrl);
            const rl = createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            rl.question('Enter the code from that page here: ', (code) => {
                rl.close();
                oAuth2Client.getToken(code, (err, token) => {
                    if (err || !token) {
                        reject(err);
                        return console.error('Error retrieving access token', err);
                    }
                    oAuth2Client.setCredentials(token);
                    // Store the token to disk for later program executions
                    writeFile(token_path, JSON.stringify(token), (err) => {
                        if (err) {
                            console.error(err);
                            reject(err);
                        }
                        console.log('Token stored to', token_path);
                    });
                    resolve(oAuth2Client);
                });
            });
        });
    }
}