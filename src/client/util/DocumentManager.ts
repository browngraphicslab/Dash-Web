import { computed, observable } from 'mobx';
import { DocumentView } from '../views/nodes/DocumentView';
import { Doc } from '../../new_fields/Doc';
import { FieldValue, Cast, NumCast } from '../../new_fields/Types';
import { listSpec } from '../../new_fields/Schema';
import { undoBatch } from './UndoManager';
import { CollectionDockingView } from '../views/collections/CollectionDockingView';


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

    public getDocumentView(toFind: Doc): DocumentView | null {

        let toReturn: DocumentView | null = null;

        //gets document view that is in a freeform canvas collection
        DocumentManager.Instance.DocumentViews.map(view => {
            if (view.props.Document === toFind) {
                toReturn = view;
                return;
            }
        });
        if (!toReturn) {
            DocumentManager.Instance.DocumentViews.map(view => {
                let doc = view.props.Document.proto;
                if (doc && Object.is(doc, toFind)) {
                    toReturn = view;
                }
            });
        }

        return toReturn;
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
        return DocumentManager.Instance.DocumentViews.reduce((pairs, dv) => {
            let linksList = Cast(dv.props.Document.linkedToDocs, listSpec(Doc));
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
            return pairs;
        }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]);
    }

    @undoBatch
    public jumpToDocument = async (doc: Doc): Promise<void> => {
        let docView = DocumentManager.Instance.getDocumentView(doc);
        if (docView) {
            docView.props.focus(docView.props.Document);
        } else {
            const contextDoc = await Cast(doc.annotationOn, Doc);
            if (!contextDoc) {
                CollectionDockingView.Instance.AddRightSplit(Doc.MakeDelegate(doc));
            } else {
                const page = NumCast(doc.page, undefined);
                const curPage = NumCast(contextDoc.curPage, undefined);
                if (page !== curPage) {
                    contextDoc.curPage = page;
                }
                let contextView = DocumentManager.Instance.getDocumentView(contextDoc);
                if (contextView) {
                    contextDoc.panTransformType = "Ease";
                    contextView.props.focus(contextDoc);
                } else {
                    CollectionDockingView.Instance.AddRightSplit(contextDoc);
                }
            }
        }
    }
}