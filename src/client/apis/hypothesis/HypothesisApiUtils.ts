import { StrCast, Cast } from "../../../fields/Types";
import HypothesisAuthenticationManager from "../HypothesisAuthenticationManager";
import { SearchUtil } from "../../util/SearchUtil";
import { action } from "mobx";
import { Doc } from "../../../fields/Doc";
import { DocumentType } from "../../documents/DocumentTypes";
import { WebField } from "../../../fields/URLField";
import { DocumentManager } from "../../util/DocumentManager";

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
        console.log("DASH dispatching editAnnotation");
        const credentials = await getCredentials();
        document.dispatchEvent(new CustomEvent<{ newText: string, id: string, apiKey: string }>("editAnnotation", {
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

    export const deleteLink = async (annotationId: string, linkUrl: string) => {
        const annotation = await fetchAnnotation(annotationId);
        const regex = new RegExp(`\\[[^\\]]*\\]\\(${linkUrl}\\)`); // finds the link (written in [title](hyperlink) format) to be deleted
        const out = annotation.text.replace(regex, "");
        editAnnotation(annotationId, out);
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
    export const getSourceWebDoc = async (uri: string) => {
        const results: Doc[] = [];
        await SearchUtil.Search("web", true).then(action(async (res: SearchUtil.DocSearchResult) => {
            const docs = await Promise.all(res.docs.map(async doc => (await Cast(doc.extendsDoc, Doc)) || doc));
            const filteredDocs = docs.filter(doc =>
                doc.type === DocumentType.WEB && doc.data
            );
            filteredDocs.forEach(doc => {
                console.log(Cast(doc.data, WebField)?.url.href);
                if (uri === Cast(doc.data, WebField)?.url.href) results.push(doc); // TODO check history? imperfect matches?
            });
        }));

        // TODO: open & return new Web doc with given uri if no matching Web docs are found
        return results.length ? DocumentManager.Instance.getFirstDocumentView(results[0]) : undefined;
    };

    export const scrollToAnnotation = (annotationId: string) => {
        document.dispatchEvent(new CustomEvent("scrollToAnnotation", {
            detail: annotationId,
            bubbles: true
        }));
    };
}