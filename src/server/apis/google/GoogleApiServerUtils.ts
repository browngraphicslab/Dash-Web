import { google } from "googleapis";
import { readFile } from "fs";
import { OAuth2Client, Credentials, OAuth2ClientOptions } from "google-auth-library";
import { Opt } from "../../../new_fields/Doc";
import { GlobalOptions } from "googleapis-common";
import { GaxiosResponse } from "gaxios";
import request = require('request-promise');
import * as qs from 'query-string';
import Photos = require('googlephotos');
import { Database } from "../../database";
const path = require("path");

/**
 * Server side authentication for Google Api queries.
 */
export namespace GoogleApiServerUtils {

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

    const ClientMapping = new Map<String, OAuth2Client>();

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

    export const GetEndpoint = (sector: string, userId: string) => {
        return new Promise<Opt<Endpoint>>(resolve => {
            retrieveOAuthClient(userId).then(auth => {
                let routed: Opt<Endpoint>;
                let parameters: EndpointParameters = { auth, version: "v1" };
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

    export const retrieveAccessToken = (userId: string): Promise<string> => {
        return new Promise<string>((resolve, reject) => {
            retrieveCredentials(userId).then(
                ({ access_token }) => resolve(access_token!),
                error => reject(`Error: unable to authenticate Google Photos API request.\n${error}`)
            );
        });
    };

    export const retrieveOAuthClient = (userId: string): Promise<OAuth2Client> => {
        return new Promise<OAuth2Client>((resolve, reject) => {
            retrieveCredentials(userId).then(
                credentials => {
                    const client = generateClient();
                    client.setCredentials(credentials);
                    resolve(client);
                },
                error => reject(`Error: unable to authenticate Google Photos API request.\n${error}`)
            );
        });
    };

    let installed: OAuth2ClientOptions;
    let worker: OAuth2Client;

    export const loadClientSecret = async () => {
        return new Promise<void>((resolve, reject) => {
            readFile(path.join(__dirname, "../../credentials/google_docs_credentials.json"), async (err, credentials) => {
                if (err) {
                    reject(err);
                    return console.log('Error loading client secret file:', err);
                }
                installed = parseBuffer(credentials).installed;
                worker = generateClient();
                resolve();
            });
        });
    };

    const generateClient = () => new google.auth.OAuth2(installed);

    export const generateAuthenticationUrl = async () => {
        return worker.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES.map(relative => prefix + relative),
        });
    };

    export interface GoogleAuthenticationResult {
        access_token: string;
        avatar: string;
        name: string;
    }
    export const processNewUser = async (userId: string, authenticationCode: string): Promise<GoogleAuthenticationResult> => {
        return new Promise<GoogleAuthenticationResult>((resolve, reject) => {
            worker.getToken(authenticationCode, async (err, token) => {
                if (err || !token) {
                    reject(err);
                    return console.error('Error retrieving access token', err);
                }
                const enriched = injectUserInfo(token);
                await Database.Auxiliary.GoogleAuthenticationToken.Write(userId, enriched);
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

    const retrieveCredentials = async (userId: string): Promise<Credentials> => {
        return new Promise<Credentials>((resolve, reject) => {
            Database.Auxiliary.GoogleAuthenticationToken.Fetch(userId).then(credentials => {
                if (!credentials) {
                    return reject();
                }
                if (credentials!.expiry_date! < new Date().getTime()) {
                    // Token has expired, so submitting a request for a refreshed access token
                    return refreshAccessToken(credentials!, userId).then(resolve, reject);
                }
                // Authentication successful!
                resolve(credentials);
            });
        });
    };

    const refreshEndpoint = "https://oauth2.googleapis.com/token";
    const refreshAccessToken = (credentials: Credentials, userId: string) => {
        return new Promise<Credentials>(resolve => {
            let headerParameters = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
            let queryParameters = {
                refreshToken: credentials.refresh_token,
                ...installed,
                grant_type: "refresh_token"
            };
            let url = `${refreshEndpoint}?${qs.stringify(queryParameters)}`;
            request.post(url, headerParameters).then(async response => {
                let { access_token, expires_in } = JSON.parse(response);
                const expiry_date = new Date().getTime() + (expires_in * 1000);
                await Database.Auxiliary.GoogleAuthenticationToken.Update(userId, access_token, expiry_date);
                credentials.access_token = access_token;
                credentials.expiry_date = expiry_date;
                resolve(credentials);
            });
        });
    };

}