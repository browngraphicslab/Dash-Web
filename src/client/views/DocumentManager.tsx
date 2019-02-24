import React = require('react')
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import { DocumentView } from './nodes/DocumentView';
import { Document } from "../../fields/Document"
import { CollectionFreeFormView } from './collections/CollectionFreeFormView';
import { KeyStore } from '../../fields/Key';
import { CollectionViewBase } from './collections/CollectionViewBase';


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
            if (view.props.ContainingCollectionView instanceof CollectionFreeFormView) {
                if (Object.is(doc, toFind)) {
                    toReturn = view;
                    return;
                }
            }
        })

        return (toReturn);
    }

    @action
    public centerNode(doc: Document | DocumentView): any {
        //console.log(doc.Title)
        //gets document view that is in freeform collection

        let docView: DocumentView | null;

        if (doc instanceof Document) {
            docView = this.getDocumentViewFreeform(doc)
        }
        else {
            docView = doc
        }

        let scale: number;
        let XView: number;
        let YView: number;
        let width: number;
        let height: number;

        //if the view exists in a freeform collection
        if (docView && docView.MainContent.current) {
            width = docView.MainContent.current.clientWidth
            height = docView.MainContent.current.clientHeight

            //base case: parent of parent does not exist
            if (docView.props.ContainingCollectionView == null) {
                scale = docView.props.ScreenToLocalTransform().Scale
                XView = (-docView.props.ScreenToLocalTransform().TranslateX * scale) + (window.innerWidth / 2) - (width * scale / 2)
                YView = (-docView.props.ScreenToLocalTransform().TranslateY * scale) + (window.innerHeight / 2) - (height * scale / 2)
                //set x and y view of parent
            }
            //parent is not main, parent is centered and calls itself
            else {
                if (docView.props.ContainingCollectionView.props.ContainingDocumentView && docView.props.ContainingCollectionView.props.ContainingDocumentView.MainContent.current) {
                    //view of parent
                    let tempCollectionView = docView.props.ContainingCollectionView.props.ContainingDocumentView

                    let parentWidth = docView.props.ContainingCollectionView.props.ContainingDocumentView.MainContent.current.clientWidth
                    let parentHeight = docView.props.ContainingCollectionView.props.ContainingDocumentView.MainContent.current.clientHeight

                    //TODO: make sure to test if the parent view is a freeform view. if not, just skip to the next level
                    if (docView.props.ContainingCollectionView instanceof CollectionFreeFormView) {
                        //scale of parent
                        scale = tempCollectionView.props.ScreenToLocalTransform().Scale

                        XView = (-docView.props.ScreenToLocalTransform().TranslateX * scale) + (parentWidth / 2) - (width * scale / 2);
                        YView = (-docView.props.ScreenToLocalTransform().TranslateY * scale) + (parentHeight / 2) - (height * scale / 2);
                        //node.Parent.setViewportXY(XView, YView);
                        DocumentManager.Instance.setViewportXY(docView.props.ContainingCollectionView, XView, YView)

                        return DocumentManager.Instance.centerNode(docView.props.ContainingCollectionView.props.DocumentForCollection);
                    }
                }
                else {
                    return DocumentManager.Instance.centerNode(docView.props.ContainingCollectionView.props.DocumentForCollection)
                }
            }
        }
    }

    parentIsFreeform(node: any): boolean {
        return node.props.ContainingCollectionView instanceof CollectionFreeFormView
    }

    @action
    private setViewportXY(collection: CollectionFreeFormView, x: number, y: number) {
        console.log("viewport is setting")
        collection.props.ScreenToLocalTransform().center(x, y)
    }
}