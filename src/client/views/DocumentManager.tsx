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
    public DocumentViews: DocumentView[];

    // singleton instance
    private static _instance: DocumentManager;

    // create one and only one instance of NodeManager
    public static get Instance(): DocumentManager {
        return this._instance || (this._instance = new this());
    }

    //private constructor so no other class can create a nodemanager
    private constructor() {
        this.DocumentViews = new Array<DocumentView>();
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
        if (docView != null) {
            //view.props.GetTransform().TranslateX
            width = docView.props.Document.GetNumber(KeyStore.NativeWidth, 0)
            height = docView.props.Document.GetNumber(KeyStore.NativeHeight, 0)


            //base case: parent does not exist (aka is parent)
            if (docView.props.ContainingCollectionView == null) {
                // scale = RootStore.Instance.MainNodeCollection.Scale;
                // XView = (-node.X * scale) + (window.innerWidth / 2) - (node.Width * scale / 2);
                // YView = (-node.Y * scale) + (window.innerHeight / 2) - (node.Height * scale / 2);
                // RootStore.Instance.MainNodeCollection.SetViewportXY(XView, YView);
                scale = docView.props.GetTransform().Scale
                XView = (-docView.props.GetTransform().TranslateX * scale) + (window.innerWidth / 2) - (width * scale / 2)
                YView = (-docView.props.GetTransform().TranslateY * scale) + (window.innerHeight / 2) - (height * scale / 2)
            }
            //parent is not main, parent is centered and calls itself
            else {
                console.log("parent does exist")
                if (docView.props.ContainingCollectionView.props.BackgroundView != null) {
                    console.log("view of parent exists")
                    let parentWidth = docView.props.ContainingCollectionView.props.BackgroundView.props.Document.GetNumber(KeyStore.NativeWidth, 0)
                    let parentHeight = docView.props.ContainingCollectionView.props.BackgroundView.props.Document.GetNumber(KeyStore.NativeHeight, 0)

                    scale = docView.props.ContainingCollectionView.props.BackgroundView.props.GetTransform().Scale
                    XView = (-docView.props.GetTransform().TranslateX * scale) + (parentWidth / 2) - (width * scale / 2);
                    YView = (-docView.props.GetTransform().TranslateY * scale) + (parentHeight / 2) - (height * scale / 2);
                    //node.Parent.setViewportXY(XView, YView);
                    this.setViewportXY(docView.props.ContainingCollectionView, XView, YView)

                    return this.centerNode(docView.props.ContainingCollectionView.props.BackgroundView.props.Document);
                }
            }
        }
    }

    private setViewportXY(collection: CollectionViewBase, x: number, y: number) {
        if (collection.props.BackgroundView != null) {
            collection.props.BackgroundView.props.GetTransform().center(x, y)
        }
    }

    public setPosition(doc: DocumentView) {

    }

}