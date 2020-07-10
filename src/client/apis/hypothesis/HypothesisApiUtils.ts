import { StrCast } from "../../../fields/Types";
import HypothesisAuthenticationManager from "../HypothesisAuthenticationManager";

export namespace Hypothesis {

    const getCredentials = async () => HypothesisAuthenticationManager.Instance.fetchAccessToken();

    export const fetchAnnotation = async (annotationId: string) => {
        const response = await fetch(`https://api.hypothes.is/api/annotations/${annotationId}`);
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('DASH: Error in fetchAnnotation GET request');
        }
    };

    /**
     * Searches for annotations authored by the current user that contain @param searchKeyWord 
     */
    export const searchAnnotation = async (searchKeyWord: string) => {
        const credentials = await getCredentials();
        const base = 'https://api.hypothes.is/api/search';
        const request = base + `?user=acct:${credentials.username}@hypothes.is&text=${searchKeyWord}`;
        console.log("DASH Querying " + request);
        const response = await fetch(request);
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('DASH: Error in searchAnnotation GET request');
        }
    };

    export const fetchUser = async (apiKey: string) => {
        const response = await fetch('https://api.hypothes.is/api/profile', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('DASH: Error in fetchUser GET request');
        }
    };

    // Find the most recent placeholder annotation created, and return its ID
    export const getPlaceholderId = async (searchKeyWord: string) => {
        const getResponse = await Hypothesis.searchAnnotation(searchKeyWord);
        const id = getResponse.rows.length > 0 ? getResponse.rows[0].id : undefined;
        const uri = getResponse.rows.length > 0 ? getResponse.rows[0].uri : undefined;
        return id ? { id, uri } : undefined;
    };

    // Send request to Hypothes.is client to modify a placeholder annotation into a hyperlink to Dash
    export const dispatchLinkRequest = async (title: string, url: string, annotationId: string) => {
        const credentials = await getCredentials();
        const oldAnnotation = await fetchAnnotation(annotationId);
        const oldText = StrCast(oldAnnotation.text);
        const newHyperlink = `[${title}\n](${url})`;
        const newText = oldText === "placeholder" ? newHyperlink : oldText + '\n\n' + newHyperlink;

        console.log("DASH dispatching linkRequest");
        document.dispatchEvent(new CustomEvent<{ newText: string, id: string, apiKey: string }>("linkRequest", {
            detail: { newText: newText, id: annotationId, apiKey: credentials.apiKey },
            bubbles: true
        }));
    };

    // Construct an URL which will scroll the web page to a specific annotation's position
    export const makeAnnotationUrl = (annotationId: string, baseUrl: string) => {
        return `https://hyp.is/${annotationId}/${baseUrl}`; // embeds the generic version of Hypothes.is client, not the Dash version
        // return baseUrl + '#annotations:' + annotationId;
    };

    // Extract username from Hypothe.is's userId format
    export const extractUsername = (userid: string) => {
        const exp: RegExp = /(?<=\:)(.*?)(?=\@)/;
        return exp.exec(userid)![0];
    };
}