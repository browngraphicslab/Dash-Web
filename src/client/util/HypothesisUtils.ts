import { StrCast, Cast } from "../../fields/Types";
import { SearchUtil } from "./SearchUtil";
import { action, runInAction } from "mobx";
import { Doc, Opt } from "../../fields/Doc";
import { DocumentType } from "../documents/DocumentTypes";
import { Docs } from "../documents/Documents";
import { SelectionManager } from "./SelectionManager";
import { WebField } from "../../fields/URLField";
import { DocumentManager } from "./DocumentManager";
import { DocumentLinksButton } from "../views/nodes/DocumentLinksButton";
import { simulateMouseClick, Utils } from "../../Utils";
import { DocumentView } from "../views/nodes/DocumentView";
import { Id } from "../../fields/FieldSymbols";

export namespace Hypothesis {

    /**
     * Retrieve a WebDocument with the given url, prioritizing results that are on screen.  
     * If none exist, create and return a new WebDocument.
     */
    export const getSourceWebDoc = async (uri: string) => {
        const result = await findWebDoc(uri);
        console.log(result ? "existing doc found" : "existing doc NOT found");
        return result || Docs.Create.WebDocument(uri, { title: uri, _fitWidth: true, _nativeWidth: 850, _height: 512, _width: 400, useCors: true }); // create and return a new Web doc with given uri if no matching docs are found
    };


    /**
     * Search for a WebDocument whose url field matches the given uri, return undefined if not found
     */
    export const findWebDoc = async (uri: string) => {
        const currentDoc = SelectionManager.SelectedDocuments().length && SelectionManager.SelectedDocuments()[0].props.Document;
        if (currentDoc && Cast(currentDoc.data, WebField)?.url.href === uri) return currentDoc; // always check first whether the currently selected doc is the annotation's source, only use Search otherwise

        const results: Doc[] = [];
        await SearchUtil.Search("web", true).then(action(async (res: SearchUtil.DocSearchResult) => {
            const docs = res.docs;
            const filteredDocs = docs.filter(doc =>
                doc.author === Doc.CurrentUserEmail && doc.type === DocumentType.WEB && doc.data
            );
            filteredDocs.forEach(doc => {
                uri === Cast(doc.data, WebField)?.url.href && results.push(doc); // TODO check visited sites history? 
            });
        }));

        const onScreenResults = results.filter(doc => DocumentManager.Instance.getFirstDocumentView(doc));
        return onScreenResults.length ? onScreenResults[0] : (results.length ? results[0] : undefined); // prioritize results that are currently on the screen
    };

    /**
     * listen for event from Hypothes.is plugin to link an annotation to Dash
     */
    export const linkListener = async (e: any) => {
        const annotationId: string = e.detail.id;
        const annotationUri: string = StrCast(e.detail.uri).split("#annotations:")[0]; // clean hypothes.is URLs that reference a specific annotation 
        const sourceDoc: Doc = await getSourceWebDoc(annotationUri);

        if (!DocumentLinksButton.StartLink || sourceDoc === DocumentLinksButton.StartLink) { // start new link if there were none already started, or if the old startLink came from the same web document (prevent links to itself)
            runInAction(() => {
                DocumentLinksButton.AnnotationId = annotationId;
                DocumentLinksButton.AnnotationUri = annotationUri;
                DocumentLinksButton.StartLink = sourceDoc;
                DocumentLinksButton.StartLinkView = undefined;
            });
        } else { // if a link has already been started, complete the link to sourceDoc
            runInAction(() => {
                DocumentLinksButton.AnnotationId = annotationId;
                DocumentLinksButton.AnnotationUri = annotationUri;
            });
            const endLinkView = DocumentManager.Instance.getFirstDocumentView(sourceDoc);
            const rect = document.body.getBoundingClientRect();
            const x = rect.x + rect.width / 2;
            const y = 250;
            DocumentLinksButton.finishLinkClick(x, y, DocumentLinksButton.StartLink, sourceDoc, false, endLinkView);
        }
    };

    /**
     *  Send message to Hypothes.is client to edit an annotation to add a Dash hyperlink
     */
    export const makeLink = async (title: string, url: string, annotationId: string, annotationSourceDoc: Doc) => {
        // if the annotation's source webpage isn't currently loaded in Dash, we're not able to access and edit the annotation from the client
        // so we're loading the webpage and its annotations invisibly in a WebBox in MainView.tsx, until the editing is done
        !DocumentManager.Instance.getFirstDocumentView(annotationSourceDoc) && runInAction(() => DocumentLinksButton.invisibleWebDoc = annotationSourceDoc);

        var success = false;
        const onSuccess = action(() => {
            console.log("Edit success!!");
            success = true;
            clearTimeout(interval);
            DocumentLinksButton.invisibleWebDoc = undefined;
            document.removeEventListener("editSuccess", onSuccess);
        });

        const newHyperlink = `[${title}\n](${url})`;
        const interval = setInterval(() => // keep trying to edit until annotations have loaded and editing is successful
            !success && document.dispatchEvent(new CustomEvent<{ newHyperlink: string, id: string }>("addLink", {
                detail: { newHyperlink: newHyperlink, id: annotationId },
                bubbles: true
            })), 300);

        setTimeout(action(() => {
            if (!success) {
                clearInterval(interval);
                DocumentLinksButton.invisibleWebDoc = undefined;
            }
        }), 10000); // give up if no success after 10s
        document.addEventListener("editSuccess", onSuccess);
    };

    /**
     * Send message Hypothes.is client request to edit an annotation to find and delete the target Dash hyperlink
     */
    export const deleteLink = async (linkDoc: Doc, sourceDoc: Doc, destinationDoc: Doc) => {
        if (Cast(destinationDoc.data, WebField)?.url.href !== StrCast(linkDoc.annotationUri)) return; // check that the destinationDoc is a WebDocument containing the target annotation

        !DocumentManager.Instance.getFirstDocumentView(destinationDoc) && runInAction(() => DocumentLinksButton.invisibleWebDoc = destinationDoc); // see note in makeLink

        var success = false;
        const onSuccess = action(() => {
            console.log("Edit success!");
            success = true;
            clearTimeout(interval);
            DocumentLinksButton.invisibleWebDoc = undefined;
            document.removeEventListener("editSuccess", onSuccess);
        });

        const annotationId = StrCast(linkDoc.annotationId);
        const linkUrl = Utils.prepend("/doc/" + sourceDoc[Id]);
        const interval = setInterval(() => {// keep trying to edit until annotations have loaded and editing is successful
            !success && document.dispatchEvent(new CustomEvent<{ targetUrl: string, id: string }>("deleteLink", {
                detail: { targetUrl: linkUrl, id: annotationId },
                bubbles: true
            }));
        }, 300);

        setTimeout(action(() => {
            if (!success) {
                clearInterval(interval);
                DocumentLinksButton.invisibleWebDoc = undefined;
            }
        }), 10000); // give up if no success after 10s
        document.addEventListener("editSuccess", onSuccess);
    };

    /**
     *  Send message to Hypothes.is client to scroll to an annotation when it loads
     */
    export const scrollToAnnotation = (annotationId: string, target: Doc) => {
        var success = false;
        const onSuccess = () => {
            console.log("Scroll success!!");
            document.removeEventListener('scrollSuccess', onSuccess);
            clearInterval(interval);
            success = true;
        };

        const interval = setInterval(() => { // keep trying to scroll every 250ms until annotations have loaded and scrolling is successful
            document.dispatchEvent(new CustomEvent('scrollToAnnotation', {
                detail: annotationId,
                bubbles: true
            }));
            const targetView: Opt<DocumentView> = DocumentManager.Instance.getFirstDocumentView(target);
            const position = targetView?.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            targetView && position && simulateMouseClick(targetView.ContentDiv!, position[0], position[1], position[0], position[1], false);
        }, 300);

        document.addEventListener('scrollSuccess', onSuccess); // listen for success message from client
        setTimeout(() => !success && clearInterval(interval), 10000); // give up if no success after 10s
    };
}