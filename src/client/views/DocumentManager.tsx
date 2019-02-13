import React = require('react')
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import { DocumentView } from './nodes/DocumentView';
import { Document } from "../../fields/Document"


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

        DocumentManager.Instance.DocumentViews.map(view => {
            let doc = view.props.Document;
            if (Object.is(doc, toFind)) {
                toReturn = view;
                return;
            }
        })

        return (toReturn);
    }

    public centerNode(doc: DocumentView) {

    }

    public setPosition(doc: DocumentView) {

    }

}