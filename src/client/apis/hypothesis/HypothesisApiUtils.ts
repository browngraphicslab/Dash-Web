import { StrCast } from "../../../fields/Types";

export namespace Hypothesis {
    export const getAnnotation = async (username: String, searchKeyWord: String) => {
        const base = 'https://api.hypothes.is/api/search';
        const request = base + `?user=acct:${username}@hypothes.is&text=${searchKeyWord}`;
        console.log("DASH Querying " + request);
        const response = await fetch(request);
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('DASH: Error in GET request');
        }
    };

    export const getPlaceholderId = async (username: String, searchKeyWord: String) => {
        const getResponse = await Hypothesis.getAnnotation(username, searchKeyWord);
        const id = getResponse.rows.length > 0 ? getResponse.rows[0].id : undefined;
        return StrCast(id);
    };

    // Send request to Hypothes.is client to modify a placeholder annotation into a hyperlink to Dash
    export const dispatchLinkRequest = (title: string, url: string, annotationId: string) => {
        console.log("DASH dispatching linkRequest");
        document.dispatchEvent(new CustomEvent<{ url: string, title: string, id: string }>("linkRequest", {
            detail: { url: url, title: title, id: annotationId },
            bubbles: true
        }));
    };

    // Construct an URL which will scroll the web page to a specific annotation's position
    export const makeAnnotationUrl = (annotationId: string, baseUrl: string) => {
        return `https://hyp.is/${annotationId}/${baseUrl}`;
    };

    // export const checkValidApiKey = async (apiKey: string) => {
    //     const response = await fetch("https://api.hypothes.is/api/profile", {

    //     });
    // };
}