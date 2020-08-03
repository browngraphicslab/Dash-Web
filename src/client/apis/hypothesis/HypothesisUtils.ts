import { StrCast, Cast } from "../../../fields/Types";
import { SearchUtil } from "../../util/SearchUtil";
import { action, runInAction } from "mobx";
import { Doc } from "../../../fields/Doc";
import { DocumentType } from "../../documents/DocumentTypes";
import { Docs, DocUtils } from "../../documents/Documents";
import { SelectionManager } from "../../util/SelectionManager";
import { WebField } from "../../../fields/URLField";
import { DocumentManager } from "../../util/DocumentManager";
import { DocumentLinksButton } from "../../views/nodes/DocumentLinksButton";
import { LinkManager } from "../../util/LinkManager";
import { TaskCompletionBox } from "../../views/nodes/TaskCompletedBox";
import { Utils } from "../../../Utils";
import { LinkDescriptionPopup } from "../../views/nodes/LinkDescriptionPopup";
import { Id } from "../../../fields/FieldSymbols";

export namespace Hypothesis {

    // Return web doc with the given uri, or create and create a new doc with the given uri
    export const getSourceWebDoc = async (uri: string) => {
        const currentDoc = SelectionManager.SelectedDocuments()[0].props.Document;
        console.log(Cast(currentDoc.data, WebField)?.url.href === uri, uri, Cast(currentDoc.data, WebField)?.url.href);
        if (Cast(currentDoc.data, WebField)?.url.href === uri) return currentDoc; // always check first whether the current doc is the source, only resort to Search otherwise

        const results: Doc[] = [];
        await SearchUtil.Search("web", true).then(action(async (res: SearchUtil.DocSearchResult) => {
            const docs = await Promise.all(res.docs.map(async doc => (await Cast(doc.extendsDoc, Doc)) || doc));
            const filteredDocs = docs.filter(doc =>
                doc.author === Doc.CurrentUserEmail && doc.type === DocumentType.WEB && doc.data
            );
            filteredDocs.forEach(doc => console.log("web docs:", doc.title, Cast(doc.data, WebField)?.url.href));
            filteredDocs.forEach(doc => { uri === Cast(doc.data, WebField)?.url.href && results.push(doc); }); // TODO check history? imperfect matches?
        }));

        results.forEach(doc => console.log(doc.title, StrCast(doc.data)));

        return results.length ? results[0] : Docs.Create.WebDocument(uri, { _nativeWidth: 850, _nativeHeight: 962, _width: 600, UseCors: true }); // create and return a new Web doc with given uri if no matching docs are found
    };

    // Send Hypothes.is client request to edit an annotation to add a Dash hyperlink
    export const makeLink = async (title: string, url: string, annotationId: string) => {
        console.log("SEND addLink");
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

    // listen for event from Hypothes.is plugin to link an annotation to Dash
    export const linkListener = async (e: any) => {
        const annotationId: string = e.detail.id;
        const annotationUri: string = e.detail.uri;
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
            makeLink(StrCast(DocumentLinksButton.StartLink.title), Utils.prepend("/doc/" + DocumentLinksButton.StartLink[Id]), StrCast(DocumentLinksButton.AnnotationId)); // update and link placeholder annotation

            runInAction(() => {
                if (linkDoc) {
                    TaskCompletionBox.textDisplayed = "Link Created";
                    TaskCompletionBox.popupX = screenX;
                    TaskCompletionBox.popupY = screenY - 133;
                    TaskCompletionBox.taskCompleted = true;

                    if (LinkDescriptionPopup.showDescriptions === "ON" || !LinkDescriptionPopup.showDescriptions) {
                        LinkDescriptionPopup.popupX = screenX;
                        LinkDescriptionPopup.popupY = screenY - 100;
                        LinkDescriptionPopup.descriptionPopup = true;
                    }
                    setTimeout(action(() => { TaskCompletionBox.taskCompleted = false; }), 2500);
                }
            });
        }
    };

    // Return web doc with the given uri, or create and create a new doc with the given uri
    export const getSourceWebDocView = async (uri: string) => {
        const currentDoc = SelectionManager.SelectedDocuments()[0].props.Document;
        console.log(Cast(currentDoc.data, WebField)?.url.href === uri, uri, Cast(currentDoc.data, WebField)?.url.href);
        if (Cast(currentDoc.data, WebField)?.url.href === uri) return currentDoc; // always check first whether the current doc is the source, only resort to Search otherwise

        const results: Doc[] = [];
        await SearchUtil.Search("web", true).then(action(async (res: SearchUtil.DocSearchResult) => {
            const docs = await Promise.all(res.docs.map(async doc => (await Cast(doc.extendsDoc, Doc)) || doc));
            const filteredDocs = docs.filter(doc =>
                doc.author === Doc.CurrentUserEmail && doc.type === DocumentType.WEB && doc.data
            );
            filteredDocs.forEach(doc => console.log("web docs:", doc.title, Cast(doc.data, WebField)?.url.href));
            filteredDocs.forEach(doc => { uri === Cast(doc.data, WebField)?.url.href && results.push(doc); }); // TODO check history? imperfect matches?
        }));

        results.forEach(doc => {
            const docView = DocumentManager.Instance.getFirstDocumentView(doc);
            if (docView) {
                console.log(doc.title, StrCast(doc.data));
                return docView;
            }
        });

        return undefined;
    };

    export const createInvisibleDoc = (uri: string) => {
        const newDoc = Docs.Create.WebDocument(uri, { _nativeWidth: 0, _nativeHeight: 0, _width: 0, UseCors: true });
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
        }, 250);

        document.addEventListener('scrollSuccess', onSuccess); // listen for success message from client
        setTimeout(() => !success && clearTimeout(interval), 10000); // give up if no success after 10s
    };
}