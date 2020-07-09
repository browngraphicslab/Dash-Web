import { StrCast } from "../../../fields/Types";

export namespace Hypothesis {
    export const fetchAnnotation = async (annotationId: string) => {
        const response = await fetch(`https://api.hypothes.is/api/annotations/${annotationId}`);
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('DASH: Error in fetchAnnotation GET request');
        }
    };

    /**
     * Searches for annotations made by @param username that 
     * contain @param searchKeyWord 
     */
    export const searchAnnotation = async (username: String, searchKeyWord: String) => {
        const base = 'https://api.hypothes.is/api/search';
        const request = base + `?user=acct:${username}@hypothes.is&text=${searchKeyWord}`;
        console.log("DASH Querying " + request);
        const response = await fetch(request);
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('DASH: Error in searchAnnotation GET request');
        }
    };

    // Find the most recent placeholder annotation created, and return its ID
    export const getPlaceholderId = async (username: String, searchKeyWord: String) => {
        const getResponse = await Hypothesis.searchAnnotation(username, searchKeyWord);
        const id = getResponse.rows.length > 0 ? getResponse.rows[0].id : undefined;
        return StrCast(id);
    };

    // Send request to Hypothes.is client to modify a placeholder annotation into a hyperlink to Dash
    export const dispatchLinkRequest = async (title: string, url: string, annotationId: string) => {
        const apiKey = "6879-GHmtDG_P2kmWNKM3hcHptEUZX3VMOUePkamCaOrJbSw";

        const oldAnnotation = await fetchAnnotation(annotationId);
        const oldText = StrCast(oldAnnotation.text);
        const newHyperlink = `[${title}\n](${url})`;
        const newText = oldText === "placeholder" ? newHyperlink : oldText + '\n\n' + newHyperlink;

        console.log("DASH dispatching linkRequest");
        document.dispatchEvent(new CustomEvent<{ newText: string, id: string, apiKey: string }>("linkRequest", {
            detail: { newText: newText, id: annotationId, apiKey: apiKey },
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