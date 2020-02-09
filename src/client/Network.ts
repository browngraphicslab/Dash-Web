import { Utils } from "../Utils";
import requestPromise = require('request-promise');

export namespace Networking {

    export async function FetchFromServer(relativeRoute: string) {
        return (await fetch(relativeRoute)).text();
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

    export async function PostFormDataToServer(relativeRoute: string, formData: FormData) {
        const parameters = {
            method: 'POST',
            body: formData
        };
        const response = await fetch(relativeRoute, parameters);
        return response.json();
    }

}