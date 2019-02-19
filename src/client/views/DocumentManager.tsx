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
            width = docView.props.Document.GetNumber(KeyStore.Width, 0)
            height = docView.props.Document.GetNumber(KeyStore.Height, 0)

            //base case: parent of parent does not exist
            if (docView.props.ContainingCollectionView == null) {
                // scale = RootStore.Instance.MainNodeCollection.Scale;
                // XView = (-node.X * scale) + (window.innerWidth / 2) - (node.Width * scale / 2);
                // YView = (-node.Y * scale) + (window.innerHeight / 2) - (node.Height * scale / 2);
                // RootStore.Instance.MainNodeCollection.SetViewportXY(XView, YView);
                scale = docView.props.ScreenToLocalTransform().Scale
                XView = (-docView.props.ScreenToLocalTransform().TranslateX * scale) + (window.innerWidth / 2) - (width * scale / 2)
                YView = (-docView.props.ScreenToLocalTransform().TranslateY * scale) + (window.innerHeight / 2) - (height * scale / 2)
                //set x and y view of parent
            }
            //parent is not main, parent is centered and calls itself
            else {
                console.log("------------------------------------------")
                console.log(docView.props.ContainingCollectionView.props.DocumentForCollection.Title)
                console.log("------------------------------------------")
                console.log("parent does exist")
                if (docView.props.ContainingCollectionView.props.DocumentForCollection != null) {
                    console.log("view of parent exists")

                    let tempView = this.getDocumentView(docView.props.ContainingCollectionView.props.DocumentForCollection)

                    //console.log(docView.props.ContainingCollectionView.props.DocumentForCollection.GetNumber(KeyStore.NativeWidth, 0))

                    // let parentWidth = docView.props.ContainingCollectionView.props.DocumentForCollection.GetNumber(KeyStore.Width, 0)
                    // let parentHeight = docView.props.ContainingCollectionView.props.DocumentForCollection.GetNumber(KeyStore.Height, 0)

                    let parentWidth = docView.props.ContainingCollectionView.props.DocumentForCollection.GetNumber(KeyStore.Width, 0)
                    let parentHeight = docView.props.ContainingCollectionView.props.DocumentForCollection.GetNumber(KeyStore.Height, 0)
                    //_htmlElement!.clientWidth

                    // console.log("window width: " + window.innerWidth + ", window height: " + window.innerHeight)
                    // console.log("parent width: " + parentWidth + ", parent height: " + parentHeight)


                    if (tempView != null) {
                        console.log("View is NOT null")
                        scale = tempView.props.ScreenToLocalTransform().Scale

                        parentWidth *= scale
                        parentHeight *= scale

                        console.log("window width: " + window.innerWidth + ", window height: " + window.innerHeight)
                        console.log("parent width: " + parentWidth + ", parent height: " + parentHeight)

                        XView = (-docView.props.ScreenToLocalTransform().TranslateX * scale) + (parentWidth / 2) - (width * scale / 2);
                        YView = (-docView.props.ScreenToLocalTransform().TranslateY * scale) + (parentHeight / 2) - (height * scale / 2);
                        //node.Parent.setViewportXY(XView, YView);
                        this.setViewportXY(docView.props.ContainingCollectionView, XView, YView)

                        return this.centerNode(docView.props.ContainingCollectionView.props.DocumentForCollection);
                    }
                }
            }
        }
    }

    private setViewportXY(collection: CollectionViewBase, x: number, y: number) {
        if (collection.props.BackgroundView != null) {
            collection.props.ScreenToLocalTransform().center(x, y)
        }
    }

    public setPosition(doc: DocumentView) {

    }

}