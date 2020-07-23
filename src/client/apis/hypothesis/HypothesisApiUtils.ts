import { StrCast, Cast } from "../../../fields/Types";
import HypothesisAuthenticationManager from "../HypothesisAuthenticationManager";
import { SearchUtil } from "../../util/SearchUtil";
import { action } from "mobx";
import { Doc } from "../../../fields/Doc";
import { DocumentType } from "../../documents/DocumentTypes";

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

    export const editAnnotation = async (annotationId: string, newText: string) => {
        console.log("DASH dispatching editRequest");
        const credentials = await getCredentials();
        document.dispatchEvent(new CustomEvent<{ newText: string, id: string, apiKey: string }>("editRequest", {
            detail: { newText: newText, id: annotationId, apiKey: credentials.apiKey },
            bubbles: true
        }));
    };

    /**
     * Edit an annotation with ID @param annotationId to add a hyperlink to a Dash document, which needs to be 
     * written in the format [@param title](@param url)
     */
    export const makeLink = async (title: string, url: string, annotationId: string) => {
        const oldAnnotation = await fetchAnnotation(annotationId);
        const oldText = StrCast(oldAnnotation.text);
        const newHyperlink = `[${title}\n](${url})`;
        const newText = oldText === "placeholder" ? newHyperlink : oldText + '\n\n' + newHyperlink; // if this is not the first link in the annotation, add link on new line
        await editAnnotation(annotationId, newText);
    };

    /**
     * Edit an annotation with ID @param annotationId to delete a hyperlink to the Dash document with URL @param linkUrl
     */
    export const deleteLink = async (annotationId: string, linkUrl: string) => {
        const annotation = await fetchAnnotation(annotationId);
        const regex = new RegExp(`(\[[^[]*)\(${linkUrl.replace('/', '\/')}\)`);
        const target = regex.exec(annotation.text); // use regex to extract the link to be deleted, which is written in [title](hyperlink) format
        target && console.log(target);
        // target && editAnnotation(annotationId, annotation.text.replace(target[0], ''));
    };

    // Finds the most recent placeholder annotation created and returns its ID
    export const getPlaceholderId = async (searchKeyWord: string) => {
        const getResponse = await Hypothesis.searchAnnotation(searchKeyWord);
        const id = getResponse.rows.length > 0 ? getResponse.rows[0].id : undefined;
        const uri = getResponse.rows.length > 0 ? getResponse.rows[0].uri : undefined;
        return id ? { id, uri } : undefined;
    };

    // Construct an URL which will scroll the web page to a specific annotation's position
    export const makeAnnotationUrl = (annotationId: string, baseUrl: string) => {
        return `https://hyp.is/${annotationId}/${baseUrl}`; // embeds the generic version of Hypothes.is client, not the Dash version
        // return baseUrl + '#annotations:' + annotationId;
    };

    // Extract username from Hypothe.is's userId format
    export const extractUsername = (userid: string) => {
        const regex = new RegExp('(?<=\:)(.*?)(?=\@)/');
        return regex.exec(userid)![0];
    };

    // Return corres
    export const getWebDocs = async (uri: string) => {
        const results: Doc[] = [];
        await SearchUtil.Search(uri, true).then(action(async (res: SearchUtil.DocSearchResult) => {
            const docs = await Promise.all(res.docs.map(async doc => (await Cast(doc.extendsDoc, Doc)) || doc));
            const filteredDocs = docs.filter(doc => doc.type === DocumentType.WEB && doc.data);

            console.log("docs", docs);
            console.log("FILTEREDDOCS: ", filteredDocs);
            filteredDocs.forEach(doc => {
                results.push(doc);
            });
        }));
        return results;
    };
}