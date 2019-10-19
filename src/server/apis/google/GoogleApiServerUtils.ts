import { google } from "googleapis";
import { createInterface } from "readline";
import { readFile, writeFile } from "fs";
import { OAuth2Client, Credentials } from "google-auth-library";
import { Opt } from "../../../new_fields/Doc";
import { GlobalOptions } from "googleapis-common";
import { GaxiosResponse } from "gaxios";
import request = require('request-promise');
import * as qs from 'query-string';
import Photos = require('googlephotos');
import { Database } from "../../database";
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
        'photoslibrary.appendonly',
        'photoslibrary.sharing',
        'userinfo.profile'
    ];

    export const parseBuffer = (data: Buffer) => JSON.parse(data.toString());

    export enum Service {
        Documents = "Documents",
        Slides = "Slides"
    }

    export interface CredentialInformation {
        credentialsPath: string;
        userId: string;
    }

    export type ApiResponse = Promise<GaxiosResponse>;
    export type ApiRouter = (endpoint: Endpoint, parameters: any) => ApiResponse;
    export type ApiHandler = (parameters: any, methodOptions?: any) => ApiResponse;
    export type Action = "create" | "retrieve" | "update";

    export type Endpoint = { get: ApiHandler, create: ApiHandler, batchUpdate: ApiHandler };
    export type EndpointParameters = GlobalOptions & { version: "v1" };

    export const GetEndpoint = (sector: string, paths: CredentialInformation) => {
        return new Promise<Opt<Endpoint>>(resolve => {
            RetrieveCredentials(paths).then(authentication => {
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

    export const RetrieveAccessToken = (information: CredentialInformation) => {
        return new Promise<string>((resolve, reject) => {
            RetrieveCredentials(information).then(
                credentials => resolve(credentials.token.access_token!),
                error => reject(`Error: unable to authenticate Google Photos API request.\n${error}`)
            );
        });
    };

    const RetrieveOAuthClient = async (information: CredentialInformation) => {
        return new Promise<OAuth2Client>((resolve, reject) => {
            readFile(information.credentialsPath, async (err, credentials) => {
                if (err) {
                    reject(err);
                    return console.log('Error loading client secret file:', err);
                }
                const { client_secret, client_id, redirect_uris } = parseBuffer(credentials).installed;
                resolve(new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]));
            });
        });
    };

    export const GenerateAuthenticationUrl = async (information: CredentialInformation) => {
        const client = await RetrieveOAuthClient(information);
        return client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES.map(relative => prefix + relative),
        });
    };

    export interface GoogleAuthenticationResult {
        access_token: string;
        avatar: string;
        name: string;
    }
    export const ProcessClientSideCode = async (information: CredentialInformation, authenticationCode: string): Promise<GoogleAuthenticationResult> => {
        const oAuth2Client = await RetrieveOAuthClient(information);
        return new Promise<GoogleAuthenticationResult>((resolve, reject) => {
            oAuth2Client.getToken(authenticationCode, async (err, token) => {
                if (err || !token) {
                    reject(err);
                    return console.error('Error retrieving access token', err);
                }
                oAuth2Client.setCredentials(token);
                const enriched = injectUserInfo(token);
                await Database.Auxiliary.GoogleAuthenticationToken.Write(information.userId, enriched);
                const { given_name, picture } = enriched.userInfo;
                resolve({
                    access_token: enriched.access_token!,
                    avatar: picture,
                    name: given_name
                });
            });
        });
    };

    /**
     * It's pretty cool: the credentials id_token is split into thirds by periods.
     * The middle third contains a base64-encoded JSON string with all the
     * user info contained in the interface below. So, we isolate that middle third,
     * base64 decode with atob and parse the JSON. 
     * @param credentials the client credentials returned from OAuth after the user
     * has executed the authentication routine
     */
    const injectUserInfo = (credentials: Credentials): EnrichedCredentials => {
        const userInfo = JSON.parse(atob(credentials.id_token!.split(".")[1]));
        return { ...credentials, userInfo };
    };

    export type EnrichedCredentials = Credentials & { userInfo: UserInfo };
    export interface UserInfo {
        at_hash: string;
        aud: string;
        azp: string;
        exp: number;
        family_name: string;
        given_name: string;
        iat: number;
        iss: string;
        locale: string;
        name: string;
        picture: string;
        sub: string;
    }

    export const RetrieveCredentials = (information: CredentialInformation) => {
        return new Promise<TokenResult>((resolve, reject) => {
            readFile(information.credentialsPath, async (err, credentials) => {
                if (err) {
                    reject(err);
                    return console.log('Error loading client secret file:', err);
                }
                authorize(parseBuffer(credentials), information.userId).then(resolve, reject);
            });
        });
    };

    export const RetrievePhotosEndpoint = (paths: CredentialInformation) => {
        return new Promise<any>((resolve, reject) => {
            RetrieveAccessToken(paths).then(
                token => resolve(new Photos(token)),
                reject
            );
        });
    };

    type TokenResult = { token: Credentials, client: OAuth2Client };
    /**
     * Create an OAuth2 client with the given credentials, and returns the promise resolving to the authenticated client
     * @param {Object} credentials The authorization client credentials.
     */
    export function authorize(credentials: any, userId: string): Promise<TokenResult> {
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        return new Promise<TokenResult>((resolve, reject) => {
            // Attempting to authorize user (${userId})
            Database.Auxiliary.GoogleAuthenticationToken.Fetch(userId).then(token => {
                if (token!.expiry_date! < new Date().getTime()) {
                    // Token has expired, so submitting a request for a refreshed access token
                    return refreshToken(token!, client_id, client_secret, oAuth2Client, userId).then(resolve, reject);
                }
                // Authentication successful!
                oAuth2Client.setCredentials(token!);
                resolve({ token: token!, client: oAuth2Client });
            });
        });
    }

    const refreshEndpoint = "https://oauth2.googleapis.com/token";
    const refreshToken = (credentials: Credentials, client_id: string, client_secret: string, oAuth2Client: OAuth2Client, userId: string) => {
        return new Promise<TokenResult>(resolve => {
            let headerParameters = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
            let queryParameters = {
                refreshToken: credentials.refresh_token,
                client_id,
                client_secret,
                grant_type: "refresh_token"
            };
            let url = `${refreshEndpoint}?${qs.stringify(queryParameters)}`;
            request.post(url, headerParameters).then(async response => {
                let { access_token, expires_in } = JSON.parse(response);
                const expiry_date = new Date().getTime() + (expires_in * 1000);
                await Database.Auxiliary.GoogleAuthenticationToken.Update(userId, access_token, expiry_date);
                credentials.access_token = access_token;
                credentials.expiry_date = expiry_date;
                oAuth2Client.setCredentials(credentials);
                resolve({ token: credentials, client: oAuth2Client });
            });
        });
    };

}