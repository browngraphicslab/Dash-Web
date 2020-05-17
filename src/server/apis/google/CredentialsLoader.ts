import { readFile, readFileSync } from "fs";
import { pathFromRoot } from "../../ActionUtilities";
import { SecureContextOptions } from "tls";

export namespace GoogleCredentialsLoader {

    export interface InstalledCredentials {
        client_id: string;
        project_id: string;
        auth_uri: string;
        token_uri: string;
        auth_provider_x509_cert_url: string;
        client_secret: string;
        redirect_uris: string[];
    }

    export let ProjectCredentials: InstalledCredentials;

    export async function loadCredentials() {
        ProjectCredentials = await new Promise<InstalledCredentials>(resolve => {
            readFile(__dirname + '/google_project_credentials.json', function processClientSecrets(err, content) {
                if (err) {
                    console.log('Error loading client secret file: ' + err);
                    return;
                }
                resolve(JSON.parse(content.toString()).installed);
            });
        });
    }

}

export namespace SSLCredentialsLoader {

    export let Credentials: SecureContextOptions = {};

    export async function loadCredentials() {
        const { serverName } = process.env;
        const cert = (suffix: string) => readFileSync(pathFromRoot(`./${serverName}${suffix}`)).toString();
        Credentials.key = cert(".key");
        Credentials.cert = cert(".crt");
        Credentials.ca = cert("-ca.crt");
    }

}
