import { action, computed, observable } from 'mobx';
import { Doc, DocListCastAsync, DocListCast, Opt } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { List } from '../../new_fields/List';
import { Cast, NumCast, StrCast } from '../../new_fields/Types';
import { CollectionDockingView } from '../views/collections/CollectionDockingView';
import { CollectionView } from '../views/collections/CollectionView';
import { DocumentView } from '../views/nodes/DocumentView';
import { LinkManager } from './LinkManager';
import { Scripting } from './Scripting';
import { SelectionManager } from './SelectionManager';
import { DocumentType } from '../documents/DocumentTypes';


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
        const toReturn: DocumentView[] = [];
        DocumentManager.Instance.DocumentViews.map(view => {
            if (view.props.Document[Id] === id) {
                toReturn.push(view);
            }
        });
        if (toReturn.length === 0) {
            DocumentManager.Instance.DocumentViews.map(view => {
                const doc = view.props.Document.proto;
                if (doc && doc[Id] && doc[Id] === id) {
                    toReturn.push(view);
                }
            });
        }
        return toReturn;
    }

    public getAllDocumentViews(doc: Doc) {
        return this.getDocumentViewsById(doc[Id]);
    }

    public getDocumentViewById(id: string, preferredCollection?: CollectionView): DocumentView | undefined {

        let toReturn: DocumentView | undefined;
        const passes = preferredCollection ? [preferredCollection, undefined] : [undefined];

        for (const pass of passes) {
            DocumentManager.Instance.DocumentViews.map(view => {
                if (view.props.Document[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                    toReturn = view;
                    return;
                }
            });
            if (!toReturn) {
                DocumentManager.Instance.DocumentViews.map(view => {
                    const doc = view.props.Document.proto;
                    if (doc && doc[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                        toReturn = view;
                    }
                });
            } else {
                break;
            }
        }

        return toReturn;
    }

    public getDocumentView(toFind: Doc, preferredCollection?: CollectionView): DocumentView | undefined {
        return this.getDocumentViewById(toFind[Id], preferredCollection);
    }

    public getFirstDocumentView(toFind: Doc, originatingDoc: Opt<Doc> = undefined): DocumentView | undefined {
        const views = this.getDocumentViews(toFind);
        return views?.find(view => view.props.Document !== originatingDoc);
    }
    public getDocumentViews(toFind: Doc): DocumentView[] {
        const toReturn: DocumentView[] = [];

        DocumentManager.Instance.DocumentViews.map(view =>
            view.props.Document.presBox === undefined && view.props.Document === toFind && toReturn.push(view));
        DocumentManager.Instance.DocumentViews.map(view =>
            view.props.Document.presBox === undefined && view.props.Document !== toFind && Doc.AreProtosEqual(view.props.Document, toFind) && toReturn.push(view));

        return toReturn;
    }

    @computed
    public get LinkedDocumentViews() {
        const pairs = DocumentManager.Instance.DocumentViews
            //.filter(dv => (dv.isSelected() || Doc.IsBrushed(dv.props.Document))) // draw links from DocumentViews that are selected or brushed OR
            // || DocumentManager.Instance.DocumentViews.some(dv2 => {                                                  // Documentviews which
            //     const rest = DocListCast(dv2.props.Document.links).some(l => Doc.AreProtosEqual(l, dv.props.Document));// are link doc anchors 
            //     const init = (dv2.isSelected() || Doc.IsBrushed(dv2.props.Document)) && dv2.Document.type !== DocumentType.AUDIO;  // on a view that is selected or brushed
            //     return init && rest;
            // }
            // )
            .reduce((pairs, dv) => {
                const linksList = LinkManager.Instance.getAllRelatedLinks(dv.props.Document);
                pairs.push(...linksList.reduce((pairs, link) => {
                    const linkToDoc = link && LinkManager.Instance.getOppositeAnchor(link, dv.props.Document);
                    linkToDoc && DocumentManager.Instance.getDocumentViews(linkToDoc).map(docView1 => {
                        if (dv.props.Document.type !== DocumentType.LINK || dv.props.layoutKey !== docView1.props.layoutKey) {
                            pairs.push({ a: dv, b: docView1, l: link });
                        }
                    });
                    return pairs;
                }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]));
                return pairs;
            }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]);

        return pairs;
    }

    public jumpToDocument = async (targetDoc: Doc, willZoom: boolean, dockFunc?: (doc: Doc) => void, docContext?: Doc, linkId?: string, closeContextIfNotFound: boolean = false, originatingDoc: Opt<Doc> = undefined): Promise<void> => {
        const highlight = () => {
            const finalDocView = DocumentManager.Instance.getFirstDocumentView(targetDoc);
            finalDocView && (finalDocView.Document.scrollToLinkID = linkId);
            finalDocView && Doc.linkFollowHighlight(finalDocView.props.Document);
        };
        const docView = DocumentManager.Instance.getFirstDocumentView(targetDoc, originatingDoc);
        let annotatedDoc = await Cast(targetDoc.annotationOn, Doc);
        if (annotatedDoc) {
            const first = DocumentManager.Instance.getFirstDocumentView(annotatedDoc);
            if (first) annotatedDoc = first.props.Document;
        }
        if (docView) {  // we have a docView already and aren't forced to create a new one ... just focus on the document.  TODO move into view if necessary otherwise just highlight?
            docView.props.focus(docView.props.Document, willZoom);
            highlight();
        } else {
            const contextDocs = docContext ? await DocListCastAsync(docContext.data) : undefined;
            const contextDoc = contextDocs && contextDocs.find(doc => Doc.AreProtosEqual(doc, targetDoc)) ? docContext : undefined;
            const targetDocContext = (annotatedDoc ? annotatedDoc : contextDoc);

            if (!targetDocContext) { // we don't have a view and there's no context specified ... create a new view of the target using the dockFunc or default
                (dockFunc || CollectionDockingView.AddRightSplit)(Doc.BrushDoc(Doc.MakeAlias(targetDoc)));
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
                            targetDoc.layout && (dockFunc || CollectionDockingView.AddRightSplit)(Doc.BrushDoc(Doc.MakeAlias(targetDoc))); // otherwise create a new view of the target
                        }
                        highlight();
                    }, 0);
                } else {  // there's no context view so we need to create one first and try again
                    (dockFunc || CollectionDockingView.AddRightSplit)(targetDocContext);
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
        const linkDocs = link ? [link] : DocListCast(doc.links);
        SelectionManager.DeselectAll();
        const firstDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor1 as Doc, doc));
        const secondDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor2 as Doc, doc));
        const firstDocWithoutView = firstDocs.find(d => DocumentManager.Instance.getDocumentViews(d.anchor2 as Doc).length === 0);
        const secondDocWithoutView = secondDocs.find(d => DocumentManager.Instance.getDocumentViews(d.anchor1 as Doc).length === 0);
        const first = firstDocWithoutView ? [firstDocWithoutView] : firstDocs;
        const second = secondDocWithoutView ? [secondDocWithoutView] : secondDocs;
        const linkDoc = first.length ? first[0] : second.length ? second[0] : undefined;
        const linkFollowDocs = first.length ? [await first[0].anchor2 as Doc, await first[0].anchor1 as Doc] : second.length ? [await second[0].anchor1 as Doc, await second[0].anchor2 as Doc] : undefined;
        const linkFollowDocContexts = first.length ? [await first[0].anchor2Context as Doc, await first[0].anchor1Context as Doc] : second.length ? [await second[0].anchor1Context as Doc, await second[0].anchor2Context as Doc] : [undefined, undefined];
        const linkFollowTimecodes = first.length ? [NumCast(first[0].anchor2Timecode), NumCast(first[0].anchor1Timecode)] : second.length ? [NumCast(second[0].anchor1Timecode), NumCast(second[0].anchor2Timecode)] : [undefined, undefined];
        if (linkFollowDocs && linkDoc) {
            const maxLocation = StrCast(linkDoc.maximizeLocation, "inTab");
            const targetContext = !Doc.AreProtosEqual(linkFollowDocContexts[reverse ? 1 : 0], currentContext) ? linkFollowDocContexts[reverse ? 1 : 0] : undefined;
            const target = linkFollowDocs[reverse ? 1 : 0];
            target.currentTimecode !== undefined && (target.currentTimecode = linkFollowTimecodes[reverse ? 1 : 0]);
            DocumentManager.Instance.jumpToDocument(linkFollowDocs[reverse ? 1 : 0], zoom, (doc: Doc) => focus(doc, maxLocation), targetContext, linkDoc[Id], undefined, doc);
        } else if (link) {
            DocumentManager.Instance.jumpToDocument(link, zoom, (doc: Doc) => focus(doc, "onRight"), undefined, undefined);
        }
    }

    @action
    zoomIntoScale = (docDelegate: Doc, scale: number) => {
        const docView = DocumentManager.Instance.getDocumentView(Doc.GetProto(docDelegate));
        docView?.props.zoomToScale(scale);
    }

    getScaleOfDocView = (docDelegate: Doc) => {
        const doc = Doc.GetProto(docDelegate);

        const docView = DocumentManager.Instance.getDocumentView(doc);
        if (docView) {
            return docView.props.getScale();
        } else {
            return 1;
        }
    }
}
Scripting.addGlobal(function focus(doc: any) { DocumentManager.Instance.getDocumentViews(Doc.GetProto(doc)).map(view => view.props.focus(doc, true)); });