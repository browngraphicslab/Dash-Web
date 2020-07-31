import { google } from "googleapis";
import { OAuth2Client, Credentials, OAuth2ClientOptions } from "google-auth-library";
import { Opt } from "../../../fields/Doc";
import { GaxiosResponse } from "gaxios";
import request = require('request-promise');
import * as qs from "query-string";
import { Database } from "../../database";
import { GoogleCredentialsLoader } from "./CredentialsLoader";

/**
 * Scopes give Google users fine granularity of control
 * over the information they make accessible via the API.
 * This is the somewhat overkill list of what Dash requests
 * from the user.
 */
const scope = [
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
].map(relative => `https://www.googleapis.com/auth/${relative}`);

/**
 * This namespace manages server side authentication for Google API queries, either
 * from the standard v1 APIs or the Google Photos REST API.
 */
export namespace GoogleApiServerUtils {

    /**
     * As we expand out to more Google APIs that are accessible from
     * the 'googleapis' module imported above, this enum will record
     * the list and provide a unified string representation of each API.
     */
    export enum Service {
        Documents = "Documents",
        Slides = "Slides",
        Hypothesis = "Hypothesis"
    }

    /**
     * Global credentials read once from a JSON file
     * before the server is started that
     * allow us to build OAuth2 clients with Dash's
     * application specific credentials.
     */
    let oAuthOptions: OAuth2ClientOptions;

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
     * This function is called once before the server is started,
     * reading in Dash's project-specific credentials (client secret
     * and client id) for later repeated access. It also sets up the
     * global, intentionally unauthenticated worker OAuth2 client instance. 
     */
    export function processProjectCredentials(): void {
        const { client_secret, client_id, redirect_uris } = GoogleCredentialsLoader.ProjectCredentials;
        // initialize the global authorization client
        oAuthOptions = {
            clientId: client_id,
            clientSecret: client_secret,
            redirectUri: redirect_uris[0]
        };
        worker = generateClient();
    }

    /**
     * A briefer format for the response from a 'googleapis' API request
     */
    export type ApiResponse = Promise<GaxiosResponse>;

    /**
     * A generic form for a handler that executes some request on the endpoint
     */
    export type ApiRouter = (endpoint: Endpoint, parameters: any) => ApiResponse;

    /**
     * A generic form for the asynchronous function that actually submits the
     * request to the API and returns the corresporing response. Helpful when
     * making an extensible endpoint definition.
     */
    export type ApiHandler = (parameters: any, methodOptions?: any) => ApiResponse;

    /**
     * A literal union type indicating the valid actions for these 'googleapis'
     * requestions
     */
    export type Action = "create" | "retrieve" | "update";

    /**
     * An interface defining any entity on which one can invoke
     * anuy of the following handlers. All 'googleapis' wrappers
     * such as google.docs().documents and google.slides().presentations
     * satisfy this interface.
     */
    export interface Endpoint {
        get: ApiHandler;
        create: ApiHandler;
        batchUpdate: ApiHandler;
    }

    /**
     * Maps the Dash user id of a given user to their single
     * associated OAuth2 client, mitigating the creation
     * of needless duplicate clients that would arise from
     * making one new client instance per request.
     */
    const authenticationClients = new Map<String, OAuth2Client>();

    /**
     * This function receives the target sector ("which G-Suite app's API am I interested in?")
     * and the id of the Dash user making the request to the API. With this information, it generates
     * an authenticated OAuth2 client and passes it into the relevant 'googleapis' wrapper.
     * @param sector the particular desired G-Suite 'googleapis' API (docs, slides, etc.)
     * @param userId the id of the Dash user making the request to the API
     * @returns the relevant 'googleapis' wrapper, if any
     */
    export async function GetEndpoint(sector: string, userId: string): Promise<Opt<Endpoint>> {
        return new Promise(async resolve => {
            const auth = await retrieveOAuthClient(userId);
            if (!auth) {
                return resolve();
            }
            let routed: Opt<Endpoint>;
            const parameters: any = { auth, version: "v1" };
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
    }

    /**
     * Manipulates a mapping such that, in the limit, each Dash user has
     * an associated authenticated OAuth2 client at their disposal. This
     * function ensures that the client's credentials always remain up to date
     * @param userId the Dash user id of the user requesting account integration
     * @returns returns an initialized OAuth2 client instance, likely to be passed into Google's
     * npm-installed API wrappers that use authenticated client instances rather than access codes for
     * security.
     */
    export async function retrieveOAuthClient(userId: string): Promise<OAuth2Client> {
        return new Promise(async resolve => {
            const { credentials, refreshed } = await retrieveCredentials(userId);
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
        });
    }

    /**
     * Creates a new OAuth2Client instance, and if provided, sets
     * the specific credentials on the client
     * @param credentials if you have access to the credentials that you'll eventually set on
     * the client, just pass them in at initialization
     * @returns the newly created, potentially certified, OAuth2 client instance
     */
    function generateClient(credentials?: Credentials): OAuth2Client {
        const client = new google.auth.OAuth2(oAuthOptions);
        credentials && client.setCredentials(credentials);
        return client;
    }

    /**
     * Calls on the worker (which does not have and does not need
     * any credentials) to produce a url to which the user can
     * navigate to give Dash the necessary Google permissions.
     * @returns the newly generated url to the authentication landing page
     */
    export function generateAuthenticationUrl(): string {
        return worker.generateAuthUrl({ scope, access_type: 'offline' });
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
     * 
     * EXAMPLE CODE: 4/sgF2A5uGg4xASHf7VQDnLtdqo3mUlfQqLSce_HYz5qf1nFtHj9YTeGs
     * 
     * @returns the information necessary to authenticate a client side google photos request
     * and display basic user information in the overlay on successful authentication. 
     * This can be expanded as needed by adding properties to the interface GoogleAuthenticationResult.
     */
    export async function processNewUser(userId: string, authenticationCode: string): Promise<EnrichedCredentials> {
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
        await Database.Auxiliary.GoogleAccessToken.Write(userId, enriched);
        return enriched;
    }

    /**
     * This type represents the union of the full set of OAuth2 credentials
     * and all of a Google user's publically available information. This is the strucure
     * of the JSON object we ultimately store in the googleAuthentication table of the database. 
     */
    export type EnrichedCredentials = Credentials & { userInfo: UserInfo };

    /**
     * This interface defines all of the information we
     * receive from parsing the base64 encoded info-token
     * for a Google user.
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
        const userInfo: UserInfo = JSON.parse(atob(credentials.id_token!.split(".")[1]));
        return { ...credentials, userInfo };
    }

    /**
     * Looks in the database for any credentials object with the given user id,
     * and returns them. If the credentials are found but expired, the function will
     * automatically refresh the credentials and then resolve with the updated values.
     * @param userId the id of the Dash user requesting his/her credentials. Eventually, each user might
     * be associated with multiple different sets of Google credentials.
     * @returns the credentials, or undefined if the user has no stored associated credentials,
     * and a flag indicating whether or not they were refreshed during retrieval
     */
    export async function retrieveCredentials(userId: string): Promise<{ credentials: Opt<EnrichedCredentials>, refreshed: boolean }> {
        let credentials = await Database.Auxiliary.GoogleAccessToken.Fetch(userId);
        let refreshed = false;
        if (!credentials) {
            return { credentials: undefined, refreshed };
        }
        // check for token expiry
        if (credentials.expiry_date! <= new Date().getTime()) {
            credentials = { ...credentials, ...(await refreshAccessToken(credentials, userId)) };
            refreshed = true;
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
        const headerParameters = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };
        const { client_id, client_secret } = GoogleCredentialsLoader.ProjectCredentials;
        const url = `https://oauth2.googleapis.com/token?${qs.stringify({
            refreshToken: credentials.refresh_token,
            client_id,
            client_secret,
            grant_type: "refresh_token"
        })}`;
        const { access_token, expires_in } = await new Promise<any>(async resolve => {
            const response = await request.post(url, headerParameters);
            resolve(JSON.parse(response));
        });
        // expires_in is in seconds, but we're building the new expiry date in milliseconds
        const expiry_date = new Date().getTime() + (expires_in * 1000);
        await Database.Auxiliary.GoogleAccessToken.Update(userId, access_token, expiry_date);
        // update the relevant properties
        credentials.access_token = access_token;
        credentials.expiry_date = expiry_date;
        return credentials;
    }

}