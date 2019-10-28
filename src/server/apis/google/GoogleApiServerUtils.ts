import { google } from "googleapis";
import { readFile } from "fs";
import { OAuth2Client, Credentials, OAuth2ClientOptions } from "google-auth-library";
import { Opt } from "../../../new_fields/Doc";
import { GlobalOptions } from "googleapis-common";
import { GaxiosResponse } from "gaxios";
import request = require('request-promise');
import * as qs from 'query-string';
import { Database } from "../../database";
import path from "path";

/**
 * 
 */
const prefix = 'https://www.googleapis.com/auth/';

/**
 * 
 */
const refreshEndpoint = "https://oauth2.googleapis.com/token";

/**
 * 
 */
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

/**
 * This namespace manages server side authentication for Google API queries, either
 * from the standard v1 APIs or the Google Photos REST API.
 */
export namespace GoogleApiServerUtils {

    /**
     * 
     */
    export interface GoogleAuthenticationResult {
        access_token: string;
        avatar: string;
        name: string;
    }

    /**
     * 
     */
    export interface CredentialsResult {
        credentials: Credentials;
        refreshed: boolean;
    }

    /**
     * 
     */
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

    /**
     * 
     */
    export enum Service {
        Documents = "Documents",
        Slides = "Slides"
    }

    /**
     * 
     */
    export interface CredentialInformation {
        credentialsPath: string;
        userId: string;
    }

    /**
     * 
     */
    let installed: OAuth2ClientOptions;

    /**
     * This is a global authorization client that is never 
     * passed around, and whose credentials are never set.
     * Its job is purely to generate new authentication urls
     * (users will follow to get to Google's permissions GUI)
     * and to use the codes returned from that process to generate the
     * initial credentials.
     */
    let worker: OAuth2Client;

    /**
     * 
     */
    export type ApiResponse = Promise<GaxiosResponse>;

    /**
     * 
     */
    export type ApiRouter = (endpoint: Endpoint, parameters: any) => ApiResponse;

    /**
     * 
     */
    export type ApiHandler = (parameters: any, methodOptions?: any) => ApiResponse;

    /**
     * 
     */
    export type Action = "create" | "retrieve" | "update";

    /**
     * 
     */
    export interface Endpoint {
        get: ApiHandler;
        create: ApiHandler;
        batchUpdate: ApiHandler;
    }

    /**
     * 
     */
    export type EndpointParameters = GlobalOptions & { version: "v1" };

    /**
     * 
     */
    export const loadClientSecret = async () => {
        return new Promise<void>((resolve, reject) => {
            readFile(path.join(__dirname, "../../credentials/google_docs_credentials.json"), async (err, projectCredentials) => {
                if (err) {
                    reject(err);
                    return console.log('Error loading client secret file:', err);
                }
                const { client_secret, client_id, redirect_uris } = JSON.parse(projectCredentials.toString()).installed;
                // initialize the global authorization client
                installed = {
                    clientId: client_id,
                    clientSecret: client_secret,
                    redirectUri: redirect_uris[0]
                };
                worker = generateClient();
                resolve();
            });
        });
    };

    /**
     * 
     */
    const authenticationClients = new Map<String, OAuth2Client>();

    /**
     * 
     * @param sector 
     * @param userId 
     */
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

    /**
     * 
     * @param userId 
     */
    export const retrieveAccessToken = (userId: string): Promise<string> => {
        return new Promise<string>((resolve, reject) => {
            retrieveCredentials(userId).then(
                ({ credentials }) => resolve(credentials.access_token!),
                error => reject(`Error: unable to authenticate Google Photos API request.\n${error}`)
            );
        });
    };

    /**
     * 
     * @param userId 
     */
    export const retrieveOAuthClient = (userId: string): Promise<OAuth2Client> => {
        return new Promise<OAuth2Client>((resolve, reject) => {
            retrieveCredentials(userId).then(
                ({ credentials, refreshed }) => {
                    let client = authenticationClients.get(userId);
                    if (!client) {
                        authenticationClients.set(userId, client = generateClient(credentials));
                    } else if (refreshed) {
                        client.setCredentials(credentials);
                    }
                    resolve(client);
                },
                error => reject(`Error: unable to instantiate and certify a new OAuth2 client.\n${error}`)
            );
        });
    };

    /**
     * 
     * @param credentials 
     */
    function generateClient(credentials?: Credentials) {
        const client = new google.auth.OAuth2(installed);
        credentials && client.setCredentials(credentials);
        return client;
    }

    /**
     * 
     */
    export const generateAuthenticationUrl = async () => {
        return worker.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES.map(relative => prefix + relative),
        });
    };

    /**
     * 
     * @param userId 
     * @param authenticationCode 
     */
    export const processNewUser = async (userId: string, authenticationCode: string): Promise<GoogleAuthenticationResult> => {
        return new Promise<GoogleAuthenticationResult>((resolve, reject) => {
            worker.getToken(authenticationCode, async (err, credentials) => {
                if (err || !credentials) {
                    reject(err);
                    return console.error('Error retrieving access token', err);
                }
                const enriched = injectUserInfo(credentials);
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
     * 
     */
    export type EnrichedCredentials = Credentials & { userInfo: UserInfo };

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

    /**
     * 
     * @param userId 
     */
    const retrieveCredentials = async (userId: string): Promise<CredentialsResult> => {
        return new Promise<CredentialsResult>((resolve, reject) => {
            Database.Auxiliary.GoogleAuthenticationToken.Fetch(userId).then(credentials => {
                if (!credentials) {
                    return reject();
                }
                if (credentials!.expiry_date! < new Date().getTime()) {
                    // Token has expired, so submitting a request for a refreshed access token
                    return refreshAccessToken(credentials!, userId).then(resolve, reject);
                }
                // Authentication successful!
                resolve({ credentials, refreshed: false });
            });
        });
    };

    /**
     * 
     * @param credentials 
     * @param userId 
     */
    const refreshAccessToken = (credentials: Credentials, userId: string) => {
        return new Promise<CredentialsResult>(resolve => {
            let headerParameters = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
            let queryParameters = {
                refreshToken: credentials.refresh_token,
                grant_type: "refresh_token",
                ...installed
            };
            let url = `${refreshEndpoint}?${qs.stringify(queryParameters)}`;
            request.post(url, headerParameters).then(async response => {
                let { access_token, expires_in } = JSON.parse(response);
                const expiry_date = new Date().getTime() + (expires_in * 1000);
                await Database.Auxiliary.GoogleAuthenticationToken.Update(userId, access_token, expiry_date);
                credentials.access_token = access_token;
                credentials.expiry_date = expiry_date;
                resolve({ credentials, refreshed: true });
            });
        });
    };

}