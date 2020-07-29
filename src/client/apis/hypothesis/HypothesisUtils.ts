import { StrCast, Cast } from "../../../fields/Types";
import HypothesisAuthenticationManager from "../HypothesisAuthenticationManager";
import { SearchUtil } from "../../util/SearchUtil";
import { action } from "mobx";
import { Doc } from "../../../fields/Doc";
import { DocumentType } from "../../documents/DocumentTypes";
import { WebField } from "../../../fields/URLField";
import { DocumentManager } from "../../util/DocumentManager";

export namespace Hypothesis {
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

    // Send Hypothes.is client request to edit an annotation to add a Dash hyperlink
    export const makeLink = async (title: string, url: string, annotationId: string) => {
        const newHyperlink = `[${title}\n](${url})`;
        document.dispatchEvent(new CustomEvent<{ newHyperlink: string, id: string }>("addLink", {
            detail: { newHyperlink: newHyperlink, id: annotationId },
            bubbles: true
        }));
    };

    // Send Hypothes.is client request to edit an annotation to find and remove a dash hyperlink
    export const deleteLink = async (annotationId: string, linkUrl: string) => {
        document.dispatchEvent(new CustomEvent<{ targetUrl: string, id: string }>("deleteLink", {
            detail: { targetUrl: linkUrl, id: annotationId },
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
        var success = false;
        const onSuccess = () => {
            console.log("scroll success!!");
            document.removeEventListener('scrollSuccess', onSuccess);
            clearTimeout(interval);
            success = true;
        };

        const interval = setInterval(() => { // keep trying to scroll every 200ms until annotations have loaded and scrolling is successful
            console.log("send scroll");
            document.dispatchEvent(new CustomEvent('scrollToAnnotation', {
                detail: annotationId,
                bubbles: true
            }));
        }, 200);

        document.addEventListener('scrollSuccess', onSuccess); // listen for success message from client
        setTimeout(() => !success && clearTimeout(interval), 10000); // give up if no success after 10s
    };
}