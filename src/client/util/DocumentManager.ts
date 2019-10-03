import { action, computed, observable } from 'mobx';
import { Doc, DocListCastAsync } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { Cast, NumCast, StrCast } from '../../new_fields/Types';
import { CollectionDockingView } from '../views/collections/CollectionDockingView';
import { CollectionPDFView } from '../views/collections/CollectionPDFView';
import { CollectionVideoView } from '../views/collections/CollectionVideoView';
import { CollectionView } from '../views/collections/CollectionView';
import { DocumentView } from '../views/nodes/DocumentView';
import { LinkManager } from './LinkManager';
import { undoBatch, UndoManager } from './UndoManager';
import { Scripting } from './Scripting';
import { List } from '../../new_fields/List';
import { SelectionManager } from './SelectionManager';
import { notDeepEqual } from 'assert';


export class DocumentManager {

    //global holds all of the nodes (regardless of which collection they're in)
    @observable
    public DocumentViews: DocumentView[] = [];

    // singleton instance
    private static _instance: DocumentManager;

    // create one and only one instance of NodeManager
    public static get Instance(): DocumentManager {
        return this._instance || (this._instance = new this());
    }

    //private constructor so no other class can create a nodemanager
    private constructor() {
        // this.DocumentViews = new Array<DocumentView>();
    }

    //gets all views
    public getDocumentViewsById(id: string) {
        let toReturn: DocumentView[] = [];
        DocumentManager.Instance.DocumentViews.map(view => {
            if (view.props.Document[Id] === id) {
                toReturn.push(view);
            }
        });
        if (toReturn.length === 0) {
            DocumentManager.Instance.DocumentViews.map(view => {
                let doc = view.props.Document.proto;
                if (doc && doc[Id]) {
                    if (doc[Id] === id) { toReturn.push(view); }
                }
            });
        }
        return toReturn;
    }

    public getAllDocumentViews(doc: Doc) {
        return this.getDocumentViewsById(doc[Id]);
    }

    public getDocumentViewById(id: string, preferredCollection?: CollectionView | CollectionPDFView | CollectionVideoView): DocumentView | undefined {

        let toReturn: DocumentView | undefined;
        let passes = preferredCollection ? [preferredCollection, undefined] : [undefined];

        for (let pass of passes) {
            DocumentManager.Instance.DocumentViews.map(view => {
                if (view.props.Document[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                    toReturn = view;
                    return;
                }
            });
            if (!toReturn) {
                DocumentManager.Instance.DocumentViews.map(view => {
                    let doc = view.props.Document.proto;
                    if (doc && doc[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                        toReturn = view;
                    }
                });
            }
        }

        return toReturn;
    }

    public getDocumentView(toFind: Doc, preferredCollection?: CollectionView | CollectionPDFView | CollectionVideoView): DocumentView | undefined {
        return this.getDocumentViewById(toFind[Id], preferredCollection);
    }

    public getFirstDocumentView(toFind: Doc): DocumentView | undefined {
        const views = this.getDocumentViews(toFind);
        return views.length ? views[0] : undefined;
    }
    public getDocumentViews(toFind: Doc): DocumentView[] {

        let toReturn: DocumentView[] = [];

        //gets document view that is in a freeform canvas collection
        DocumentManager.Instance.DocumentViews.map(view => {
            let doc = view.props.Document;

            if (doc === toFind) {
                toReturn.push(view);
            } else {
                if (Doc.AreProtosEqual(doc, toFind)) {
                    toReturn.push(view);
                }
            }
        });

        return toReturn;
    }

    @computed
    public get LinkedDocumentViews() {
        let pairs = DocumentManager.Instance.DocumentViews.filter(dv => dv.isSelected() || Doc.IsBrushed(dv.props.Document)).reduce((pairs, dv) => {
            let linksList = LinkManager.Instance.getAllRelatedLinks(dv.props.Document);
            pairs.push(...linksList.reduce((pairs, link) => {
                if (link) {
                    let linkToDoc = LinkManager.Instance.getOppositeAnchor(link, dv.props.Document);
                    if (linkToDoc) {
                        DocumentManager.Instance.getDocumentViews(linkToDoc).map(docView1 => {
                            pairs.push({ a: dv, b: docView1, l: link });
                        });
                    }
                }
                return pairs;
            }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]));
            // }
            return pairs;
        }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]);

        return pairs;
    }



    public jumpToDocument = async (targetDoc: Doc, willZoom: boolean, dockFunc?: (doc: Doc) => void, docContext?: Doc, linkId?: string, closeContextIfNotFound: boolean = false): Promise<void> => {
        let highlight = () => {
            const finalDocView = DocumentManager.Instance.getFirstDocumentView(targetDoc);
            finalDocView && (finalDocView.Document.scrollToLinkID = linkId);
            finalDocView && Doc.linkFollowHighlight(finalDocView.props.Document);
        }
        const docView = DocumentManager.Instance.getFirstDocumentView(targetDoc);
        const annotatedDoc = await Cast(targetDoc.annotationOn, Doc);
        if (docView) {  // we have a docView already and aren't forced to create a new one ... just focus on the document.  TODO move into view if necessary otherwise just highlight?
            annotatedDoc && docView.props.focus(annotatedDoc, false);
            docView.props.focus(docView.props.Document, willZoom);
            highlight();
        } else {
            const contextDocs = docContext ? await DocListCastAsync(docContext.data) : undefined;
            const contextDoc = contextDocs && contextDocs.find(doc => Doc.AreProtosEqual(doc, targetDoc)) ? docContext : undefined;
            const targetDocContext = (annotatedDoc ? annotatedDoc : contextDoc);

            if (!targetDocContext) { // we don't have a view and there's no context specified ... create a new view of the target using the dockFunc or default
                (dockFunc || CollectionDockingView.AddRightSplit)(Doc.BrushDoc(Doc.MakeAlias(targetDoc)), undefined);
                highlight();
            } else {
                const targetDocContextView = DocumentManager.Instance.getFirstDocumentView(targetDocContext);
                targetDocContext.scrollY = 0;  // this will force PDFs to activate and load their annotations / allow scrolling
                if (targetDocContextView) { // we have a context view and aren't forced to create a new one ... focus on the context
                    targetDocContext.panTransformType = "Ease";
                    targetDocContextView.props.focus(targetDocContextView.props.Document, willZoom);

                    // now find the target document within the context
                    setTimeout(() => {
                        const retryDocView = DocumentManager.Instance.getDocumentView(targetDoc);
                        if (retryDocView) {
                            retryDocView.props.focus(targetDoc, willZoom); // focus on the target if it now exists in the context
                        } else {
                            if (closeContextIfNotFound && targetDocContextView.props.removeDocument) targetDocContextView.props.removeDocument(targetDocContextView.props.Document);
                            (dockFunc || CollectionDockingView.AddRightSplit)(Doc.BrushDoc(Doc.MakeAlias(targetDoc)), undefined); // otherwise create a new view of the target
                        }
                        highlight();
                    }, 0);
                } else {  // there's no context view so we need to create one first and try again
                    (dockFunc || CollectionDockingView.AddRightSplit)(targetDocContext, undefined);
                    setTimeout(() => {
                        const finalDocView = DocumentManager.Instance.getFirstDocumentView(targetDoc);
                        const finalDocContextView = DocumentManager.Instance.getFirstDocumentView(targetDocContext);
                        setTimeout(() =>  // if not, wait a bit to see if the context can be loaded (e.g., a PDF). wait interval heurisitic tries to guess how we're animating based on what's just become visible
                            this.jumpToDocument(targetDoc, willZoom, dockFunc, undefined, linkId, true), finalDocView ? 0 : finalDocContextView ? 250 : 2000); // so call jump to doc again and if the doc isn't found, it will be created.
                    }, 0);
                }
            }
        }
    }

    public async FollowLink(link: Doc | undefined, doc: Doc, focus: (doc: Doc, maxLocation: string) => void, zoom: boolean = false, reverse: boolean = false, currentContext?: Doc) {
        const linkDocs = link ? [link] : LinkManager.Instance.getAllRelatedLinks(doc);
        SelectionManager.DeselectAll();
        const firstDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor1 as Doc, doc) && !linkDoc.anchor1anchored);
        const secondDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor2 as Doc, doc) && !linkDoc.anchor2anchored);
        const firstDocWithoutView = firstDocs.find(d => DocumentManager.Instance.getDocumentViews(d.anchor2 as Doc).length === 0);
        const secondDocWithoutView = secondDocs.find(d => DocumentManager.Instance.getDocumentViews(d.anchor1 as Doc).length === 0);
        const first = firstDocWithoutView ? [firstDocWithoutView] : firstDocs;
        const second = secondDocWithoutView ? [secondDocWithoutView] : secondDocs;
        const linkDoc = first.length ? first[0] : second.length ? second[0] : undefined;
        const linkFollowDocs = first.length ? [await first[0].anchor2 as Doc, await first[0].anchor1 as Doc] : second.length ? [await second[0].anchor1 as Doc, await second[0].anchor2 as Doc] : undefined;
        const linkFollowDocContexts = first.length ? [await first[0].targetContext as Doc, await first[0].sourceContext as Doc] : second.length ? [await second[0].sourceContext as Doc, await second[0].targetContext as Doc] : [undefined, undefined];
        if (linkFollowDocs && linkDoc) {
            const maxLocation = StrCast(linkFollowDocs[0].maximizeLocation, "inTab");
            const targetContext = !Doc.AreProtosEqual(linkFollowDocContexts[reverse ? 1 : 0], currentContext) ? linkFollowDocContexts[reverse ? 1 : 0] : undefined;
            DocumentManager.Instance.jumpToDocument(linkFollowDocs[reverse ? 1 : 0], zoom, (doc: Doc) => focus(doc, maxLocation), targetContext, linkDoc[Id]);
        }
    }

    @action
    zoomIntoScale = (docDelegate: Doc, scale: number) => {
        let docView = DocumentManager.Instance.getDocumentView(Doc.GetProto(docDelegate));
        docView && docView.props.zoomToScale(scale);
    }

    getScaleOfDocView = (docDelegate: Doc) => {
        let doc = Doc.GetProto(docDelegate);

        const docView = DocumentManager.Instance.getDocumentView(doc);
        if (docView) {
            return docView.props.getScale();
        } else {
            return 1;
        }
    }

    @action
    animateBetweenPoint = (scrpt: number[], expandedDocs: Doc[] | undefined): void => {
        expandedDocs && expandedDocs.map(expDoc => {
            if (expDoc.isMinimized || expDoc.isAnimating === "min") { // MAXIMIZE DOC
                if (expDoc.isMinimized) {  // docs are never actaully at the minimized location.  so when we unminimize one, we have to set our overrides to make it look like it was at the minimize location
                    expDoc.isMinimized = false;
                    expDoc.animateToPos = new List<number>([...scrpt, 0]);
                    expDoc.animateToDimensions = new List<number>([0, 0]);
                }
                setTimeout(() => {
                    expDoc.isAnimating = "max";
                    expDoc.animateToPos = new List<number>([0, 0, 1]);
                    expDoc.animateToDimensions = new List<number>([NumCast(expDoc.width), NumCast(expDoc.height)]);
                    setTimeout(() => expDoc.isAnimating === "max" && (expDoc.isAnimating = expDoc.animateToPos = expDoc.animateToDimensions = undefined), 600);
                }, 0);
            } else {  // MINIMIZE DOC
                expDoc.isAnimating = "min";
                expDoc.animateToPos = new List<number>([...scrpt, 0]);
                expDoc.animateToDimensions = new List<number>([0, 0]);
                setTimeout(() => {
                    if (expDoc.isAnimating === "min") {
                        expDoc.isMinimized = true;
                        expDoc.isAnimating = expDoc.animateToPos = expDoc.animateToDimensions = undefined;
                    }
                }, 600);
            }
        });
    }
}
Scripting.addGlobal(function focus(doc: any) { DocumentManager.Instance.getDocumentViews(Doc.GetProto(doc)).map(view => view.props.focus(doc, true)); });