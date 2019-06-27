import { computed, observable, action } from 'mobx';
import { DocumentView } from '../views/nodes/DocumentView';
import { Doc, DocListCast, Opt } from '../../new_fields/Doc';
import { FieldValue, Cast, NumCast, BoolCast } from '../../new_fields/Types';
import { listSpec } from '../../new_fields/Schema';
import { undoBatch } from './UndoManager';
import { CollectionDockingView } from '../views/collections/CollectionDockingView';
import { CollectionView } from '../views/collections/CollectionView';
import { CollectionPDFView } from '../views/collections/CollectionPDFView';
import { CollectionVideoView } from '../views/collections/CollectionVideoView';
import { Id } from '../../new_fields/FieldSymbols';


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

    public getDocumentViewById(id: string, preferredCollection?: CollectionView | CollectionPDFView | CollectionVideoView): DocumentView | null {

        let toReturn: DocumentView | null = null;
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

    public getDocumentView(toFind: Doc, preferredCollection?: CollectionView | CollectionPDFView | CollectionVideoView): DocumentView | null {
        return this.getDocumentViewById(toFind[Id], preferredCollection);
    }

    public getDocumentViews(toFind: Doc): DocumentView[] {

        let toReturn: DocumentView[] = [];

        //gets document view that is in a freeform canvas collection
        DocumentManager.Instance.DocumentViews.map(view => {
            let doc = view.props.Document;
            // if (view.props.ContainingCollectionView instanceof CollectionFreeFormView) {

            if (doc === toFind) {
                toReturn.push(view);
            } else {
                let docSrc = FieldValue(doc.proto);
                if (docSrc && Object.is(docSrc, toFind)) {
                    toReturn.push(view);
                }
            }
        });

        return toReturn;
    }

    @computed
    public get LinkedDocumentViews() {
        return DocumentManager.Instance.DocumentViews.filter(dv => dv.isSelected() || BoolCast(dv.props.Document.libraryBrush, false)).reduce((pairs, dv) => {
            let linksList = DocListCast(dv.props.Document.linkedToDocs);
            if (linksList && linksList.length) {
                pairs.push(...linksList.reduce((pairs, link) => {
                    if (link) {
                        let linkToDoc = FieldValue(Cast(link.linkedTo, Doc));
                        if (linkToDoc) {
                            DocumentManager.Instance.getDocumentViews(linkToDoc).map(docView1 =>
                                pairs.push({ a: dv, b: docView1, l: link }));
                        }
                    }
                    return pairs;
                }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]));
            }
            linksList = DocListCast(dv.props.Document.linkedFromDocs);
            if (linksList && linksList.length) {
                pairs.push(...linksList.reduce((pairs, link) => {
                    if (link) {
                        let linkFromDoc = FieldValue(Cast(link.linkedFrom, Doc));
                        if (linkFromDoc) {
                            DocumentManager.Instance.getDocumentViews(linkFromDoc).map(docView1 =>
                                pairs.push({ a: dv, b: docView1, l: link }));
                        }
                    }
                    return pairs;
                }, pairs));
            }
            return pairs;
        }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]);
    }

    @undoBatch
    public jumpToDocument = async (docDelegate: Doc, willZoom: boolean, forceDockFunc: boolean = false, dockFunc?: (doc: Doc) => void, linkPage?: number, docContext?: Doc): Promise<void> => {
        let doc = Doc.GetProto(docDelegate);
        const contextDoc = await Cast(doc.annotationOn, Doc);
        if (contextDoc) {
            const page = NumCast(doc.page, linkPage || 0);
            const curPage = NumCast(contextDoc.curPage, page);
            if (page !== curPage) contextDoc.curPage = page;
        }

        let docView: DocumentView | null;
        // using forceDockFunc as a flag for splitting linked to doc to the right...can change later if needed
        if (!forceDockFunc && (docView = DocumentManager.Instance.getDocumentView(doc))) {
            docView.props.Document.libraryBrush = true;
            if (linkPage !== undefined) docView.props.Document.curPage = linkPage;
            docView.props.focus(docView.props.Document, willZoom);
        } else {
            if (!contextDoc) {
                if (docContext) {
                    let targetContextView: DocumentView | null;
                    if (!forceDockFunc && docContext && (targetContextView = DocumentManager.Instance.getDocumentView(docContext))) {
                        docContext.panTransformType = "Ease";
                        targetContextView.props.focus(docDelegate, willZoom);
                    } else {
                        (dockFunc || CollectionDockingView.Instance.AddRightSplit)(docContext, docContext);
                        setTimeout(() => {
                            this.jumpToDocument(docDelegate, willZoom, forceDockFunc, dockFunc, linkPage);
                        }, 10);
                    }
                } else {
                    const actualDoc = Doc.MakeAlias(docDelegate);
                    actualDoc.libraryBrush = true;
                    if (linkPage !== undefined) actualDoc.curPage = linkPage;
                    (dockFunc || CollectionDockingView.Instance.AddRightSplit)(actualDoc, actualDoc);
                }
            } else {
                let contextView: DocumentView | null;
                docDelegate.libraryBrush = true;
                if (!forceDockFunc && (contextView = DocumentManager.Instance.getDocumentView(contextDoc))) {
                    contextDoc.panTransformType = "Ease";
                    contextView.props.focus(docDelegate, willZoom);
                } else {
                    (dockFunc || CollectionDockingView.Instance.AddRightSplit)(contextDoc, contextDoc);
                    setTimeout(() => {
                        this.jumpToDocument(docDelegate, willZoom, forceDockFunc, dockFunc, linkPage);
                    }, 10);
                }
            }
        }
    }

    @action
    zoomIntoScale = (docDelegate: Doc, scale: number) => {
        let doc = Doc.GetProto(docDelegate);

        let docView: DocumentView | null;
        docView = DocumentManager.Instance.getDocumentView(doc);
        if (docView) {
            docView.props.zoomToScale(scale);
        }
    }

    getScaleOfDocView = (docDelegate: Doc) => {
        let doc = Doc.GetProto(docDelegate);

        let docView: DocumentView | null;
        docView = DocumentManager.Instance.getDocumentView(doc);
        if (docView) {
            return docView.props.getScale();
        } else {
            return 1;
        }
    }
}