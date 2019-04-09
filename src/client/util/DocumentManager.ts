import React = require('react')
import { observer } from 'mobx-react';
import { observable, action, computed } from 'mobx';
import { Document } from "../../fields/Document"
import { DocumentView } from '../views/nodes/DocumentView';
import { KeyStore } from '../../fields/KeyStore';
import { FieldWaiting } from '../../fields/Field';
import { ListField } from '../../fields/ListField';


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

    public getAllDocumentViews(collection: Document) {
        return this.DocumentViews.filter(dv =>
            dv.props.ContainingCollectionView && dv.props.ContainingCollectionView.props.Document === collection);
    }

    public getDocumentView(toFind: Document): DocumentView | null {

        let toReturn: DocumentView | null;
        toReturn = null;

        //gets document view that is in a freeform canvas collection
        DocumentManager.Instance.DocumentViews.map(view => {
            let doc = view.props.Document;
            // if (view.props.ContainingCollectionView instanceof CollectionFreeFormView) {

            if (doc === toFind) {
                toReturn = view;
                return;
            }
            let docSrc = doc.GetT(KeyStore.Prototype, Document);
            if (docSrc && docSrc !== FieldWaiting && Object.is(docSrc, toFind)) {
                toReturn = view;
            }
        })

        return (toReturn);
    }
    public getDocumentViews(toFind: Document): DocumentView[] {

        let toReturn: DocumentView[] = [];

        //gets document view that is in a freeform canvas collection
        DocumentManager.Instance.DocumentViews.map(view => {
            let doc = view.props.Document;
            // if (view.props.ContainingCollectionView instanceof CollectionFreeFormView) {

            if (doc === toFind) {
                toReturn.push(view);
            } else {
                let docSrc = doc.GetT(KeyStore.Prototype, Document);
                if (docSrc && docSrc !== FieldWaiting && Object.is(docSrc, toFind)) {
                    toReturn.push(view);
                }
            }
        })

        return (toReturn);
    }

    @computed
    public get LinkedDocumentViews() {
        return DocumentManager.Instance.DocumentViews.reduce((pairs, dv) => {
            let linksList = dv.props.Document.GetT(KeyStore.LinkedToDocs, ListField);
            if (linksList && linksList !== FieldWaiting && linksList.Data.length) {
                pairs.push(...linksList.Data.reduce((pairs, link) => {
                    if (link instanceof Document) {
                        let linkToDoc = link.GetT(KeyStore.LinkedToDocs, Document);
                        if (linkToDoc && linkToDoc !== FieldWaiting) {
                            DocumentManager.Instance.getDocumentViews(linkToDoc).map(docView1 => {
                                pairs.push({ a: dv, b: docView1, l: link })
                            })
                        }
                    }
                    return pairs;
                }, [] as { a: DocumentView, b: DocumentView, l: Document }[]));
            }
            return pairs;
        }, [] as { a: DocumentView, b: DocumentView, l: Document }[]);
    }
}