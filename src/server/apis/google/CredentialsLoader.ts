import { readFile, readFileSync } from "fs";
import { pathFromRoot } from "../../ActionUtilities";
import { SecureContextOptions } from "tls";
import { blue, red } from "colors";

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

export namespace SSL {

    export let Credentials: SecureContextOptions = {};
    export let Loaded = false;

    const suffixes = {
        privateKey: ".key",
        certificate: ".crt",
        caBundle: "-ca.crt"
    };

    export async function loadCredentials() {
        const { serverName } = process.env;
        const cert = (suffix: string) => readFileSync(pathFromRoot(`./${serverName}${suffix}`)).toString();
        try {
            Credentials.key = cert(suffixes.privateKey);
            Credentials.cert = cert(suffixes.certificate);
            Credentials.ca = cert(suffixes.caBundle);
            Loaded = true;
        } catch (e) {
            Credentials = {};
            Loaded = false;
        }
    }

    export function exit() {
        console.log(red("Running this server in release mode requires the following SSL credentials in the project root:"));
        const serverName = process.env.serverName ? process.env.serverName : "{process.env.serverName}";
        Object.values(suffixes).forEach(suffix => console.log(blue(`${serverName}${suffix}`)));
        console.log(red("Please ensure these files exist and restart, or run this in development mode."));
        process.exit(0);
    }

}
