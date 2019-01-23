import * as React from 'react';
import * as ReactDOM from 'react-dom';
import "./Main.scss";
import "normalize.css"
import { NodeCollectionStore } from './stores/NodeCollectionStore';
import { StaticTextNodeStore } from './stores/StaticTextNodeStore';
import { VideoNodeStore } from './stores/VideoNodeStore';
import { FreeFormCanvas } from './views/freeformcanvas/FreeFormCanvas';
import { Key, KeyStore as KS } from './fields/Key';
import { NumberField } from './fields/NumberField';
import { Document } from './fields/Document';
import { configure, runInAction } from 'mobx';
import { NodeStore } from './stores/NodeStore';
import { Documents } from './documents/Documents';
import { DocumentDecorations } from './DocumentDecorations';

configure({
    enforceActions: "observed"
});

const mainNodeCollection = new NodeCollectionStore();
ReactDOM.render((
    <div>
        <FreeFormCanvas store={mainNodeCollection} />
        <DocumentDecorations />
    </div>), document.getElementById('root'));

runInAction(() => {
    let doc1 = Documents.TextDocument("Hello world");
    let doc2 = doc1.MakeDelegate();
    doc2.SetField(KS.X, new NumberField(150));
    doc2.SetField(KS.Y, new NumberField(20));
    let doc3 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
        x: 450, y: 500
    });
    let docset = new Array<Document>(doc1, doc2);
    let doc4 = Documents.CollectionDocument(docset, {
        x: 100, y: 400
    });
    let doc5 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
        x: 650, y: 500
    });
    mainNodeCollection.Docs.push(doc1);
    mainNodeCollection.Docs.push(doc2);
    mainNodeCollection.Docs.push(doc4);
    mainNodeCollection.Docs.push(doc3);
    mainNodeCollection.Docs.push(doc5);
});