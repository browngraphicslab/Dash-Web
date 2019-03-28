import React = require('react')
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import { Document } from "../../fields/Document"
import { DocumentView } from '../views/nodes/DocumentView';
import { KeyStore } from '../../fields/KeyStore';
import { FieldWaiting } from '../../fields/Field';


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

    public getDocumentView(toFind: Document): DocumentView | null {

        let toReturn: DocumentView | null;
        toReturn = null;

        //gets document view that is in a freeform canvas collection
        DocumentManager.Instance.DocumentViews.map(view => {
            let doc = view.props.Document;
            // if (view.props.ContainingCollectionView instanceof CollectionFreeFormView) {

            if (Object.is(doc, toFind)) {
                toReturn = view;
                return;
            }
            let docSrc = doc.GetT(KeyStore.Prototype, Document);
            if (docSrc && docSrc != FieldWaiting && Object.is(docSrc, toFind)) {
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

            if (Object.is(doc, toFind)) {
                toReturn.push(view);
            } else {
                let docSrc = doc.GetT(KeyStore.Prototype, Document);
                if (docSrc && docSrc != FieldWaiting && Object.is(docSrc, toFind)) {
                    toReturn.push(view);
                }
            }
        })

        return (toReturn);
    }
}