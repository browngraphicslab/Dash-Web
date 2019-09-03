import { google } from "googleapis";
import { createInterface } from "readline";
import { readFile, writeFile } from "fs";
import { OAuth2Client, Credentials } from "google-auth-library";
import { Opt } from "../../../new_fields/Doc";
import { GlobalOptions } from "googleapis-common";
import { GaxiosResponse } from "gaxios";
import request = require('request-promise');
import * as qs from 'query-string';

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
        Slides = "Slides"
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
        return new Promise<Opt<Endpoint>>(resolve => {
            RetrieveAuthenticationInformation(paths).then(authentication => {
                let routed: Opt<Endpoint>;
                let parameters: EndpointParameters = { auth: authentication.client, version: "v1" };
                switch (sector) {
                    case Service.Documents:
                        routed = google.docs(parameters).documents;
                        break;
                    case Service.Slides:
                        routed = google.slides(parameters).presentations;
                        break;
                }
                resolve(routed);
            });
        });
    };

    export const RetrieveAuthenticationInformation = async (paths: CredentialPaths) => {
        return new Promise<TokenResult>((resolve, reject) => {
            readFile(paths.credentials, async (err, credentials) => {
                if (err) {
                    reject(err);
                    return console.log('Error loading client secret file:', err);
                }
                authorize(parseBuffer(credentials), paths.token).then(resolve, reject);
            });
        });
    };

    type TokenResult = { token: Credentials, client: OAuth2Client };
    /**
     * Create an OAuth2 client with the given credentials, and returns the promise resolving to the authenticated client
     * @param {Object} credentials The authorization client credentials.
     */
    export function authorize(credentials: any, token_path: string): Promise<TokenResult> {
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);

        return new Promise<TokenResult>((resolve, reject) => {
            readFile(token_path, (err, token) => {
                // Check if we have previously stored a token.
                if (err) {
                    return getNewToken(oAuth2Client, token_path).then(resolve, reject);
                }
                let parsed: Credentials = parseBuffer(token);
                if (parsed.expiry_date! < new Date().getTime()) {
                    return refreshToken(parsed, client_id, client_secret, oAuth2Client, token_path).then(resolve, reject);
                }
                oAuth2Client.setCredentials(parsed);
                resolve({ token: parsed, client: oAuth2Client });
            });
        });
    }

    const refreshEndpoint = "https://oauth2.googleapis.com/token";
    const refreshToken = (credentials: Credentials, client_id: string, client_secret: string, oAuth2Client: OAuth2Client, token_path: string) => {
        return new Promise<TokenResult>((resolve, reject) => {
            let headerParameters = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
            let queryParameters = {
                refreshToken: credentials.refresh_token,
                client_id,
                client_secret,
                grant_type: "refresh_token"
            };
            let url = `${refreshEndpoint}?${qs.stringify(queryParameters)}`;
            request.post(url, headerParameters).then(response => {
                let parsed = JSON.parse(response);
                credentials.access_token = parsed.access_token;
                credentials.expiry_date = new Date().getTime() + parsed.expires_in;
                writeFile(token_path, JSON.stringify(credentials), (err) => {
                    if (err) {
                        console.error(err);
                        reject(err);
                    }
                    console.log('Refreshed token stored to', token_path);
                    oAuth2Client.setCredentials(credentials);
                    resolve({ token: credentials, client: oAuth2Client });
                });
            });
        });
    };

    /**
     * Get and store new token after prompting for user authorization, and then
     * execute the given callback with the authorized OAuth2 client.
     * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
     * @param {getEventsCallback} callback The callback for the authorized client.
     */
    function getNewToken(oAuth2Client: OAuth2Client, token_path: string) {
        return new Promise<TokenResult>((resolve, reject) => {
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
                    resolve({ token, client: oAuth2Client });
                });
            });
        });
    }
}