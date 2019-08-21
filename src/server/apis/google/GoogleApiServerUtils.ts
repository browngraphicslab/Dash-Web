import { google, docs_v1 } from "googleapis";
import { createInterface } from "readline";
import { readFile, writeFile } from "fs";
import { OAuth2Client } from "google-auth-library";

/**
 * Server side authentication for Google Api queries.
 */
export namespace GoogleApiServerUtils {

    // If modifying these scopes, delete token.json.
    const prefix = 'https://www.googleapis.com/auth/';
    const SCOPES = [
        'documents.readonly',
        'documents',
        'drive',
        'drive.file',
    ];
    // The file token.json stores the user's access and refresh tokens, and is
    // created automatically when the authorization flow completes for the first
    // time.
    export const parseBuffer = (data: Buffer) => JSON.parse(data.toString());

    export namespace Docs {

        export interface CredentialPaths {
            credentials: string;
            token: string;
        }

        export type Endpoint = docs_v1.Docs;

        export const GetEndpoint = async (paths: CredentialPaths) => {
            return new Promise<Endpoint>((resolve, reject) => {
                readFile(paths.credentials, (err, credentials) => {
                    if (err) {
                        reject(err);
                        return console.log('Error loading client secret file:', err);
                    }
                    return authorize(parseBuffer(credentials), paths.token).then(auth => {
                        resolve(google.docs({ version: "v1", auth }));
                    });
                });
            });
        };

    }

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