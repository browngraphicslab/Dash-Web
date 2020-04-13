import { Utils } from "../Utils";
import requestPromise = require('request-promise');
import { Upload } from "../server/SharedMediaTypes";

export namespace Networking {

    const EnvVarCache = new Map<string, string>();

    export async function FetchFromServer(relativeRoute: string) {
        return (await fetch(relativeRoute)).text();
    }

    export async function FetchEnvironmentVariable(varNameLiteral: string) {
        let resolved = EnvVarCache.get(varNameLiteral);
        if (!resolved) {
            resolved = await FetchFromServer(`/environment/${varNameLiteral}`);
            if (resolved !== undefined) {
                EnvVarCache.set(varNameLiteral, resolved);
            }
        }
        return resolved;
    }

    export async function PostToServer(relativeRoute: string, body?: any) {
        const options = {
            uri: Utils.prepend(relativeRoute),
            method: "POST",
            body,
            json: true
        };
        return requestPromise.post(options);
    }

    export async function UploadFilesToServer<T extends Upload.FileInformation = Upload.FileInformation>(files: File | File[]): Promise<Upload.FileResponse<T>[]> {
        const formData = new FormData();
        if (Array.isArray(files)) {
            if (!files.length) {
                return [];
            }
            files.forEach(file => formData.append(Utils.GenerateGuid(), file));
        } else {
            formData.append(Utils.GenerateGuid(), files);
        }
        const parameters = {
            method: 'POST',
            body: formData
        };
        const response = await fetch("/uploadFormData", parameters);
        return response.json();
    }

}