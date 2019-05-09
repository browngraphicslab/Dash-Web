import { computed, observable } from 'mobx';
import { DocumentView } from '../views/nodes/DocumentView';
import { Doc } from '../../new_fields/Doc';
import { FieldValue, Cast, BoolCast } from '../../new_fields/Types';
import { listSpec } from '../../new_fields/Schema';
import { SelectionManager } from './SelectionManager';


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
        return DocumentManager.Instance.DocumentViews.filter(dv => dv.isSelected() || BoolCast(dv.props.Document.libraryBrush, false)).reduce((pairs, dv) => {
            let linksList = Cast(dv.props.Document.linkedToDocs, listSpec(Doc), []).filter(d => d).map(d => d as Doc);
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
            linksList = Cast(dv.props.Document.linkedFromDocs, listSpec(Doc), []).filter(d => d).map(d => d as Doc);
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
}