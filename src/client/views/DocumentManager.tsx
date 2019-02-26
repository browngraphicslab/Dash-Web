import React = require('react')
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import { DocumentView } from './nodes/DocumentView';
import { Document } from "../../fields/Document"
import { CollectionFreeFormView } from './collections/CollectionFreeFormView';
import { KeyStore } from '../../fields/KeyStore';
import { CollectionViewBase } from './collections/CollectionViewBase';
import { CollectionViewType, CollectionView } from './collections/CollectionView';


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
            //     if (Object.is(doc, toFind)) {
            //         toReturn = view;
            //         return;
            //     }
            // }

            if (Object.is(doc, toFind)) {
                toReturn = view;
                return;
            }

        })

        return (toReturn);
    }

    public getDocumentViewFreeform(toFind: Document): DocumentView | null {

        let toReturn: DocumentView | null;
        toReturn = null;

        //gets document view that is in a freeform canvas collection
        DocumentManager.Instance.DocumentViews.map(view => {
            let doc = view.props.Document;
            if (view.props.ContainingCollectionView && view.props.ContainingCollectionView.collectionViewType == CollectionViewType.Freeform) {
                if (Object.is(doc, toFind)) {
                    toReturn = view;
                    return;
                }
            }
        })

        return (toReturn);
    }

    @action
    public centerNode2(doc: Document | DocumentView): any {
        //console.log(doc.Title)
        //gets document view that is in freeform collection

        let docView: DocumentView | null;

        if (doc instanceof Document) {
            docView = DocumentManager.Instance.getDocumentViewFreeform(doc)
        }
        else {
            docView = doc
        }

        let scale: number;
        let XView: number;
        let YView: number;

        //if the view exists in a freeform collection
        if (docView) {
            let { width, height } = docView.size();

            //base case: parent of parent does not exist
            if (!docView.props.ContainingCollectionView) {
                scale = docView.props.ScreenToLocalTransform().Scale
                let doc = docView.props.Document;
                console.log("hello")
                XView = (-doc.GetNumber(KeyStore.X, 0) * scale) - (width * scale / 2)
                YView = (-doc.GetNumber(KeyStore.Y, 0) * scale) - (height * scale / 2)
                //set x and y view of parent
                if (docView instanceof CollectionView) {
                    console.log("here")
                    DocumentManager.Instance.setViewportXY(docView, XView, YView)
                }
            }
            //parent is not main, parent is centered and calls itself
            else {
                if (true) {
                    //view of parent
                    let scale = docView.props.ContainingCollectionView.props.Document.GetNumber(KeyStore.Scale, 1)
                    let doc = docView.props.Document

                    //TODO: make sure to test if the parent view is a freeform view. if not, just skip to the next level
                    if (docView.props.ContainingCollectionView.collectionViewType == CollectionViewType.Freeform) {
                        //scale of parent
                        console.log("scale: " + scale)
                        XView = (-doc.GetNumber(KeyStore.X, 0) * scale) - (width * scale / 2);
                        YView = (-doc.GetNumber(KeyStore.Y, 0) * scale) - (height * scale / 2);
                        // //node.Parent.setViewportXY(XView, YView);
                        DocumentManager.Instance.setViewportXY(docView.props.ContainingCollectionView, XView, YView)
                        return DocumentManager.Instance.centerNode2(docView.props.ContainingCollectionView.props.Document)
                    }
                    else { return DocumentManager.Instance.centerNode2(docView.props.ContainingCollectionView.props.Document) }
                }
                else {
                    // return DocumentManager.Instance.centerNode2(docView.props.ContainingCollectionView.props.Document)
                }
            }
        }
    }

    @action
    public centerNode(doc: Document | DocumentView): any {
        //console.log(doc.Title)
        //gets document view that is in freeform collection

        let docView: DocumentView | null;

        if (doc instanceof Document) {
            docView = DocumentManager.Instance.getDocumentViewFreeform(doc)
        }
        else {
            docView = doc
        }

        let scale: number;
        let XView: number;
        let YView: number;

        //if the view exists in a freeform collection
        if (docView) {
            let { width, height } = docView.size();

            //parent is not main, parent is centered and calls itself
            if (docView.props.ContainingCollectionView) {
                //view of parent
                let scale = docView.props.ContainingCollectionView.props.Document.GetNumber(KeyStore.Scale, 1)
                let doc = docView.props.Document

                if (docView.props.ContainingCollectionView.collectionViewType == CollectionViewType.Freeform) {
                    //scale of parent
                    XView = (-doc.GetNumber(KeyStore.X, 0) * scale) - (width * scale / 2);
                    YView = (-doc.GetNumber(KeyStore.Y, 0) * scale) - (height * scale / 2);
                    DocumentManager.Instance.setViewportXY(docView.props.ContainingCollectionView, XView, YView)
                    return DocumentManager.Instance.centerNode(docView.props.ContainingCollectionView.props.Document)
                }
                else { return DocumentManager.Instance.centerNode(docView.props.ContainingCollectionView.props.Document) }
            }
        }
    }


    @action
    private setViewportXY(collection: CollectionView, x: number, y: number) {
        if (collection.collectionViewType !== CollectionViewType.Freeform) {
            return
        }
        let doc = collection.props.Document;
        doc.SetNumber(KeyStore.PanX, x);
        doc.SetNumber(KeyStore.PanY, y);
    }
}