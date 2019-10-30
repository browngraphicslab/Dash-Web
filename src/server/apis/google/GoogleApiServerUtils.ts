import { google } from "googleapis";
import { readFile } from "fs";
import { OAuth2Client, Credentials, OAuth2ClientOptions } from "google-auth-library";
import { Opt } from "../../../new_fields/Doc";
import { GlobalOptions } from "googleapis-common";
import { GaxiosResponse } from "gaxios";
import request = require('request-promise');
import * as qs from 'query-string';
import { Database } from "../../database";
import * as path from "path";

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
    export interface CredentialsResult {
        credentials: Opt<Credentials>;
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
    export async function loadClientSecret(): Promise<void> {
        return new Promise((resolve, reject) => {
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
    }

    /**
     * 
     */
    const authenticationClients = new Map<String, OAuth2Client>();

    /**
     * 
     * @param sector 
     * @param userId 
     */
    export async function GetEndpoint(sector: string, userId: string): Promise<Opt<Endpoint>> {
        return new Promise(resolve => {
            retrieveOAuthClient(userId).then(auth => {
                if (!auth) {
                    return resolve();
                }
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
    }

    /**
     * 
     * @param userId 
     */
    export async function retrieveAccessToken(userId: string): Promise<string> {
        return new Promise(resolve => {
            retrieveCredentials(userId).then(
                ({ credentials }) => {
                    if (credentials) {
                        return resolve(credentials.access_token!);
                    }
                    resolve();
                }
            );
        });
    }

    /**
     * Returns an initialized OAuth2 client instance, likely to be passed into Google's
     * npm-installed API wrappers that use authenticated client instances rather than access codes for
     * security.
     * @param userId the Dash user id of the user requesting account integration
     */
    export async function retrieveOAuthClient(userId: string): Promise<OAuth2Client> {
        return new Promise((resolve, reject) => {
            retrieveCredentials(userId).then(
                ({ credentials, refreshed }) => {
                    if (!credentials) {
                        return resolve();
                    }
                    let client = authenticationClients.get(userId);
                    if (!client) {
                        authenticationClients.set(userId, client = generateClient(credentials));
                    } else if (refreshed) {
                        client.setCredentials(credentials);
                    }
                    resolve(client);
                }
            );
        });
    }

    /**
     * Creates a new OAuth2Client instance, and if provided, sets
     * the specific credentials on the client
     * @param credentials if you have access to the credentials that you'll eventually set on
     * the client, just pass them in at initialization
     */
    function generateClient(credentials?: Credentials): OAuth2Client {
        const client = new google.auth.OAuth2(installed);
        credentials && client.setCredentials(credentials);
        return client;
    }

    /**
     * Calls on the worker (which does not have and does not need
     * any credentials) to produce a url to which the user can
     * navigate to give Dash the necessary Google permissions.
     */
    export function generateAuthenticationUrl(): string {
        return worker.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES.map(relative => prefix + relative),
        });
    }

    /**
     * This is what we return to the server in processNewUser(), after the
     * worker OAuth2Client has used the user-pasted authentication code
     * to retrieve an access token and an info token. The avatar is the
     * URL to the Google-hosted mono-color, single white letter profile 'image'.
     */
    export interface GoogleAuthenticationResult {
        access_token: string;
        avatar: string;
        name: string;
    }

    /**
     * This method receives the authentication code that the
     * user pasted into the overlay in the client side and uses the worker
     * and the authentication code to fetch the full set of credentials that
     * we'll store in the database for each user. This is called once per
     * new account integration.
     * @param userId the Dash user id of the user requesting account integration, used to associate the new credentials
     * with a Dash user in the googleAuthentication table of the database.
     * @param authenticationCode the Google-provided authentication code that the user copied
     * from Google's permissions UI and pasted into the overlay.
     * @returns the information necessary to authenticate a client side google photos request
     * and display basic user information in the overlay on successful authentication. 
     * This can be expanded as needed by adding properties to the interface GoogleAuthenticationResult.
     */
    export async function processNewUser(userId: string, authenticationCode: string): Promise<GoogleAuthenticationResult> {
        const credentials = await new Promise<Credentials>((resolve, reject) => {
            worker.getToken(authenticationCode, async (err, credentials) => {
                if (err || !credentials) {
                    reject(err);
                    return;
                }
                resolve(credentials);
            });
        });
        const enriched = injectUserInfo(credentials);
        await Database.Auxiliary.GoogleAuthenticationToken.Write(userId, enriched);
        const { given_name, picture } = enriched.userInfo;
        return {
            access_token: enriched.access_token!,
            avatar: picture,
            name: given_name
        };
    }

    /**
     * This type represents the union of the full set of OAuth2 credentials
     * and all of a Google user's publically available information. This is the strucure
     * of the JSON object we ultimately store in the googleAuthentication table of the database. 
     */
    export type EnrichedCredentials = Credentials & { userInfo: UserInfo };

    /**
     * It's pretty cool: the credentials id_token is split into thirds by periods.
     * The middle third contains a base64-encoded JSON string with all the
     * user info contained in the interface below. So, we isolate that middle third,
     * base64 decode with atob and parse the JSON. 
     * @param credentials the client credentials returned from OAuth after the user
     * has executed the authentication routine
     * @returns the full set of credentials in the structure in which they'll be stored
     * in the database.
     */
    function injectUserInfo(credentials: Credentials): EnrichedCredentials {
        const userInfo = JSON.parse(atob(credentials.id_token!.split(".")[1]));
        return { ...credentials, userInfo };
    }

    /**
     * Looks in the database for any credentials object with the given user id,
     * and returns them. If the credentials are found but expired, the function will
     * automatically refresh the credentials and then resolve with the updated values.
     * @param userId the id of the Dash user requesting his/her credentials. Eventually, each user might
     * be associated with multiple different sets of Google credentials.
     * @returns the credentials and a flag indicating whether or not they were refreshed during retrieval
     */
    async function retrieveCredentials(userId: string): Promise<CredentialsResult> {
        let credentials: Opt<Credentials> = await Database.Auxiliary.GoogleAuthenticationToken.Fetch(userId);
        let refreshed = false;
        if (!credentials) {
            return { credentials: undefined, refreshed };
        }
        // if the token has expired, submit a request for a refreshed access token
        if (credentials.expiry_date! <= new Date().getTime()) {
            credentials = await refreshAccessToken(credentials, userId);
        }
        return { credentials, refreshed };
    }

    /**
     * This function submits a request to OAuth with the local refresh token
     * to revalidate the credentials for a given Google user associated with
     * the Dash user id passed in. In addition to returning the credentials, it
     * writes the diff to the database.
     * @param credentials the credentials
     * @param userId the id of the Dash user implicitly requesting that 
     * his/her credentials be refreshed
     * @returns the updated credentials
     */
    async function refreshAccessToken(credentials: Credentials, userId: string): Promise<Credentials> {
        let headerParameters = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
        let url = `${refreshEndpoint}?${qs.stringify({
            refreshToken: credentials.refresh_token,
            grant_type: "refresh_token",
            ...installed
        })}`;
        const { access_token, expires_in } = await new Promise<any>(async resolve => {
            const response = await request.post(url, headerParameters);
            resolve(JSON.parse(response));
        });
        // expires_in is in seconds, but we're building the new expiry date in milliseconds
        const expiry_date = new Date().getTime() + (expires_in * 1000);
        await Database.Auxiliary.GoogleAuthenticationToken.Update(userId, access_token, expiry_date);
        // update the relevant properties
        credentials.access_token = access_token;
        credentials.expiry_date = expiry_date;
        return credentials;
    }

}