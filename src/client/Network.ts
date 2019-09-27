import { Utils } from "../Utils";
import { CurrentUserUtils } from "../server/authentication/models/current_user_utils";
import requestPromise = require('request-promise');

export namespace Identified {

    export async function FetchFromServer(relativeRoute: string) {
        return (await fetch(relativeRoute, { headers: { userId: CurrentUserUtils.id } })).text();
    }

    export async function PostToServer(relativeRoute: string, body?: any) {
        let options = {
            uri: Utils.prepend(relativeRoute),
            method: "POST",
            headers: { userId: CurrentUserUtils.id },
            body,
            json: true
        };
        return requestPromise.post(options);
    }

    export async function PostFormDataToServer(relativeRoute: string, formData: FormData) {
        const parameters = {
            method: 'POST',
            headers: { userId: CurrentUserUtils.id },
            body: formData,
        };
        const response = await fetch(relativeRoute, parameters);
        const text = await response.json();
        return text;
    }

}