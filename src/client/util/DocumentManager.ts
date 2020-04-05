import { action, computed, observable } from 'mobx';
import { Doc, DocListCastAsync, DocListCast, Opt } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { List } from '../../new_fields/List';
import { Cast, NumCast, StrCast } from '../../new_fields/Types';
import { CollectionDockingView } from '../views/collections/CollectionDockingView';
import { CollectionView } from '../views/collections/CollectionView';
import { DocumentView, DocFocusFunc } from '../views/nodes/DocumentView';
import { LinkManager } from './LinkManager';
import { Scripting } from './Scripting';
import { SelectionManager } from './SelectionManager';
import { DocumentType } from '../documents/DocumentTypes';
import { UndoManager } from './UndoManager';


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
        if (!id) return undefined;
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

    public getFirstDocumentView = (toFind: Doc, originatingDoc: Opt<Doc> = undefined): DocumentView | undefined => {
        return this.getDocumentViews(toFind)?.find(view => view.props.Document !== originatingDoc);
    }
    public getDocumentViews(toFind: Doc): DocumentView[] {
        const toReturn: DocumentView[] = [];
        const docViews = DocumentManager.Instance.DocumentViews;

        // heuristic to return the "best" documents first:
        //   choose an exact match over an alias match
        //   choose documents that have a PanelWidth() over those that don't (the treeview documents have no panelWidth)
        docViews.map(view => !view.props.Document.presBox && view.props.PanelWidth() > 1 && view.props.Document === toFind && toReturn.push(view));
        docViews.map(view => !view.props.Document.presBox && view.props.PanelWidth() <= 1 && view.props.Document === toFind && toReturn.push(view));
        docViews.map(view => !view.props.Document.presBox && view.props.PanelWidth() > 1 && view.props.Document !== toFind && Doc.AreProtosEqual(view.props.Document, toFind) && toReturn.push(view));
        docViews.map(view => !view.props.Document.presBox && view.props.PanelWidth() <= 1 && view.props.Document !== toFind && Doc.AreProtosEqual(view.props.Document, toFind) && toReturn.push(view));

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

    static addRightSplit = (doc: Doc, finished?: () => void) => {
        CollectionDockingView.AddRightSplit(doc);
        finished?.();
    }
    public jumpToDocument = async (
        targetDoc: Doc,
        willZoom: boolean,
        dockFunc = DocumentManager.addRightSplit,
        docContext?: Doc,
        linkId?: string,
        closeContextIfNotFound: boolean = false,
        originatingDoc: Opt<Doc> = undefined,
        finished?: () => void): Promise<void> => {
        const getFirstDocView = DocumentManager.Instance.getFirstDocumentView;
        const finishFalse: DocFocusFunc = () => { finished?.(); return false; };
        const highlight = () => {
            const finalDocView = getFirstDocView(targetDoc);
            if (finalDocView) {
                finalDocView.Document.scrollToLinkID = linkId;
                Doc.linkFollowHighlight(finalDocView.props.Document);
            }
        };
        const docView = getFirstDocView(targetDoc, originatingDoc);
        let annotatedDoc = await Cast(targetDoc.annotationOn, Doc);
        if (annotatedDoc) {
            const first = getFirstDocView(annotatedDoc);
            if (first) annotatedDoc = first.props.Document;
        }
        if (docView) {  // we have a docView already and aren't forced to create a new one ... just focus on the document.  TODO move into view if necessary otherwise just highlight?
            docView.props.focus(docView.props.Document, willZoom, undefined, finishFalse);
            highlight();
        } else {
            const contextDocs = docContext ? await DocListCastAsync(docContext.data) : undefined;
            const contextDoc = contextDocs?.find(doc => Doc.AreProtosEqual(doc, targetDoc)) ? docContext : undefined;
            const targetDocContext = annotatedDoc || contextDoc;

            if (!targetDocContext) { // we don't have a view and there's no context specified ... create a new view of the target using the dockFunc or default
                dockFunc(Doc.BrushDoc(targetDoc), finished); // bcz: should we use this?: Doc.MakeAlias(targetDoc)));
                highlight();
            } else {
                const targetDocContextView = getFirstDocView(targetDocContext);
                targetDocContext.scrollY = 0;  // this will force PDFs to activate and load their annotations / allow scrolling
                if (targetDocContextView) { // we have a context view and aren't forced to create a new one ... focus on the context
                    targetDocContext.panTransformType = "Ease";
                    targetDocContextView.props.focus(targetDocContextView.props.Document, willZoom);

                    // now find the target document within the context
                    if (targetDoc.displayTimecode) {  // the target should show up once the video scrubs to the display timecode;
                        targetDocContext.currentTimecode = targetDoc.displayTimecode;
                        finished?.();
                    } else {
                        setTimeout(() => {
                            const retryDocView = getFirstDocView(targetDoc);
                            if (retryDocView) {
                                retryDocView.props.focus(targetDoc, willZoom, undefined, finishFalse); // focus on the target if it now exists in the context
                            } else {
                                if (closeContextIfNotFound) targetDocContextView.props.removeDocument?.(targetDocContextView.props.Document);
                                targetDoc.layout && dockFunc(Doc.BrushDoc(Doc.MakeAlias(targetDoc)), finished); // otherwise create a new view of the target
                            }
                            highlight();
                        }, 0);
                    }
                } else {  // there's no context view so we need to create one first and try again
                    dockFunc(targetDocContext);
                    setTimeout(() => {
                        const finalDocView = getFirstDocView(targetDoc);
                        const finalDocContextView = getFirstDocView(targetDocContext);
                        setTimeout(() =>  // if not, wait a bit to see if the context can be loaded (e.g., a PDF). wait interval heurisitic tries to guess how we're animating based on what's just become visible
                            this.jumpToDocument(targetDoc, willZoom, dockFunc, undefined, linkId, true, undefined, finished), finalDocView ? 0 : finalDocContextView ? 250 : 2000); // so call jump to doc again and if the doc isn't found, it will be created.
                    }, 0);
                }
            }
        }
    }

    public async FollowLink(link: Doc | undefined, doc: Doc, focus: (doc: Doc, followLinkLocation: string, afterFocus?: DocFocusFunc) => void, zoom = false, reverse = false, currentContext?: Doc, finished?: () => void) {
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
        const linkFollowDocContexts = first.length ? [await first[0].context as Doc, await first[0].context as Doc] : second.length ? [await second[0].context as Doc, await second[0].context as Doc] : [undefined, undefined];
        const linkFollowTimecodes = first.length ? [NumCast(first[0].anchor2_timecode), NumCast(first[0].anchor1_timecode)] : second.length ? [NumCast(second[0].anchor1_timecode), NumCast(second[0].anchor2_timecode)] : [undefined, undefined];
        const Jump = DocumentManager.Instance.jumpToDocument;
        const Focus = (where: string) => (doc: Doc, finished?: () => void) => focus(doc, where, () => { finished?.(); return false; });
        if (linkFollowDocs && linkDoc) {
            const followLinkLocation = StrCast(linkDoc.followLinkLocation, "inTab");
            const targetContext = !Doc.AreProtosEqual(linkFollowDocContexts[reverse ? 1 : 0], currentContext) ? linkFollowDocContexts[reverse ? 1 : 0] : undefined;
            const target = linkFollowDocs[reverse ? 1 : 0];
            const annotatedDoc = await Cast(target.annotationOn, Doc);
            if (annotatedDoc) {
                annotatedDoc.currentTimecode !== undefined && (target.currentTimecode = linkFollowTimecodes[reverse ? 1 : 0]);
            } else {
                target.currentTimecode !== undefined && (target.currentTimecode = linkFollowTimecodes[reverse ? 1 : 0]);
            }
            Jump(linkFollowDocs[reverse ? 1 : 0], zoom, Focus(followLinkLocation), targetContext, linkDoc[Id], undefined, doc, finished);
        } else if (link) {
            Jump(link, zoom, Focus("onRight"), undefined, undefined, undefined, undefined, finished);
        } else {
            finished?.();
        }
    }
}
Scripting.addGlobal(function focus(doc: any) { DocumentManager.Instance.getDocumentViews(Doc.GetProto(doc)).map(view => view.props.focus(doc, true)); });