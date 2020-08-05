import { StrCast, Cast } from "../../../fields/Types";
import { SearchUtil } from "../../util/SearchUtil";
import { action, runInAction } from "mobx";
import { Doc, Opt } from "../../../fields/Doc";
import { DocumentType } from "../../documents/DocumentTypes";
import { Docs, DocUtils } from "../../documents/Documents";
import { SelectionManager } from "../../util/SelectionManager";
import { WebField } from "../../../fields/URLField";
import { DocumentManager } from "../../util/DocumentManager";
import { DocumentLinksButton } from "../../views/nodes/DocumentLinksButton";
import { LinkManager } from "../../util/LinkManager";
import { TaskCompletionBox } from "../../views/nodes/TaskCompletedBox";
import { Utils, simulateMouseClick } from "../../../Utils";
import { LinkDescriptionPopup } from "../../views/nodes/LinkDescriptionPopup";
import { Id } from "../../../fields/FieldSymbols";
import { DocumentView } from "../../views/nodes/DocumentView";

export namespace Hypothesis {

    // Retrieve a WebDocument with the given url exists, create and return a new 
    export const getSourceWebDoc = async (uri: string) => {
        const result = await findWebDoc(uri);
        console.log(result ? "existing doc found" : "existing doc NOT found");
        return result || Docs.Create.WebDocument(uri, { title: uri, _nativeWidth: 850, _nativeHeight: 962, _width: 400, UseCors: true }); // create and return a new Web doc with given uri if no matching docs are found
    };

    // Search for a WebDocument whose url field matches the given uri, return undefined if not found
    export const findWebDoc = async (uri: string) => {
        const currentDoc = SelectionManager.SelectedDocuments().length && SelectionManager.SelectedDocuments()[0].props.Document;
        if (currentDoc && Cast(currentDoc.data, WebField)?.url.href === uri) return currentDoc; // always check first whether the current doc is the source, only resort to Search otherwise

        const results: Doc[] = [];
        await SearchUtil.Search("web", true).then(action(async (res: SearchUtil.DocSearchResult) => {
            const docs = await Promise.all(res.docs.map(async doc => (await Cast(doc.extendsDoc, Doc)) || doc));
            const filteredDocs = docs.filter(doc =>
                doc.author === Doc.CurrentUserEmail && doc.type === DocumentType.WEB && doc.data
            );
            filteredDocs.forEach(doc => console.log("web docs:", doc.title, Cast(doc.data, WebField)?.url.href));
            filteredDocs.forEach(doc => { uri === Cast(doc.data, WebField)?.url.href && results.push(doc); }); // TODO check history? imperfect matches?
        }));

        return results.length ? results[0] : undefined;
    };

    // Ask Hypothes.is client to edit an annotation to add a Dash hyperlink
    export const makeLink = async (title: string, url: string, annotationId: string, annotationSourceDoc: Doc) => {
        // if the annotation's source webpage isn't currently loaded in Dash, we're not able to access and edit the annotation from the client
        // so we're loading the webpage and its annotations invisibly in a WebBox in MainView.tsx, until the editing is done
        !DocumentManager.Instance.getFirstDocumentView(annotationSourceDoc) && runInAction(() => DocumentLinksButton.invisibleWebDoc = annotationSourceDoc);

        var success = false;
        const onSuccess = action(() => {
            console.log("EDIT SUCCESS");
            success = true;
            clearTimeout(interval);
            DocumentLinksButton.invisibleWebDoc = undefined;
            document.removeEventListener("editSuccess", onSuccess);
        });

        console.log("send addLink");
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
        }), 12000); // give up if no success after 12s

        document.addEventListener("editSuccess", onSuccess);
    };

    export const scrollToAnnotation = (annotationId: string, target: Doc) => {
        var success = false;
        const onSuccess = () => {
            console.log("scroll success!!");
            document.removeEventListener('scrollSuccess', onSuccess);
            clearInterval(interval);
            success = true;
        };

        const interval = setInterval(() => { // keep trying to scroll every 250ms until annotations have loaded and scrolling is successful
            console.log("send scroll");
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

    // Send Hypothes.is client request to edit an annotation to find and remove a dash hyperlink
    export const deleteLink = async (annotationId: string, linkUrl: string) => {
        document.dispatchEvent(new CustomEvent<{ targetUrl: string, id: string }>("deleteLink", {
            detail: { targetUrl: linkUrl, id: annotationId },
            bubbles: true
        }));
    };

    // listen for event from Hypothes.is plugin to link an annotation to Dash
    export const linkListener = async (e: any) => {
        const annotationId: string = e.detail.id;
        const annotationUri: string = StrCast(e.detail.uri).split("#annotations:")[0]; // clean hypothes.is URLs that reference a specific annotation (eg. https://en.wikipedia.org/wiki/Cartoon#annotations:t7qAeNbCEeqfG5972KR2Ig)
        const sourceDoc: Doc = await getSourceWebDoc(annotationUri);

        if (!DocumentLinksButton.StartLink) { // start link if there were none already started 
            runInAction(() => {
                DocumentLinksButton.AnnotationId = annotationId;
                DocumentLinksButton.AnnotationUri = annotationUri;
                DocumentLinksButton.StartLink = sourceDoc;
            });
        } else if (!Doc.AreProtosEqual(sourceDoc, DocumentLinksButton.StartLink)) { // if a link has already been started, complete the link to the sourceDoc
            console.log("completing link", sourceDoc.title);
            runInAction(() => {
                DocumentLinksButton.AnnotationId = annotationId;
                DocumentLinksButton.AnnotationUri = annotationUri;
            });

            const linkDoc = DocUtils.MakeLink({ doc: DocumentLinksButton.StartLink }, { doc: sourceDoc }, DocumentLinksButton.AnnotationId ? "hypothes.is annotation" : "long drag");
            LinkManager.currentLink = linkDoc;

            Doc.GetProto(linkDoc as Doc).linksToAnnotation = true;
            Doc.GetProto(linkDoc as Doc).annotationId = DocumentLinksButton.AnnotationId;
            Doc.GetProto(linkDoc as Doc).annotationUri = DocumentLinksButton.AnnotationUri;
            makeLink(StrCast(DocumentLinksButton.StartLink.title), Utils.prepend("/doc/" + DocumentLinksButton.StartLink[Id]), StrCast(DocumentLinksButton.AnnotationId), sourceDoc); // update and link placeholder annotation

            runInAction(() => {
                if (linkDoc) {
                    TaskCompletionBox.textDisplayed = "Link Created";
                    TaskCompletionBox.popupX = 60;
                    TaskCompletionBox.popupY = 60;
                    TaskCompletionBox.taskCompleted = true;

                    if (LinkDescriptionPopup.showDescriptions === "ON" || !LinkDescriptionPopup.showDescriptions) {
                        LinkDescriptionPopup.popupX = 60;
                        LinkDescriptionPopup.popupY = 93;
                        LinkDescriptionPopup.descriptionPopup = true;
                    }
                    setTimeout(action(() => { TaskCompletionBox.taskCompleted = false; }), 2500);
                }
            });
        }
    };
}