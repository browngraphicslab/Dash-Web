import * as React from 'react';
import * as ReactDOM from 'react-dom';
import "./Main.scss";
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
        <h1>Dash Web</h1>
        <DocumentDecorations />
        <FreeFormCanvas store={mainNodeCollection} />
    </div>), document.getElementById('root'));



// create a bunch of text and video nodes (you probably want to delete this at some point)
let numNodes = 300;
let maxX = 10000;
let maxY = 10000;
let nodes:NodeStore[] = []
for (let i = 0; i < numNodes; i++) {
    nodes.push(new StaticTextNodeStore({ X: Math.random() * maxX, Y: Math.random() * maxY, Title: "Text Node Title", Text: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?" }));
}

for (let i = 0; i < 20; i++) {
    nodes.push(new VideoNodeStore({ X: Math.random() * maxX, Y: Math.random() * maxY, Title: "Video Node Title", Url: "http://cs.brown.edu/people/peichman/downloads/cted.mp4" }));
}

runInAction(() => {
    mainNodeCollection.AddNodes(nodes);
    let doc1 = Documents.TextDocument("Hello world");
    let doc2 = doc1.MakeDelegate();
    doc2.SetField(KS.X, new NumberField(150));
    doc2.SetField(KS.Y, new NumberField(20));
    let doc3 = Documents.ImageDocument("https://static.boredpanda.com/blog/wp-content/uploads/2018/04/5acb63d83493f__700-png.jpg", {
        x: 450, y: 500
    });
    let docset = new Array<Document>(doc1, doc2);
    let doc4 = Documents.CollectionDocument(docset, {
        x: 100, y: 400
    });
    let doc5 = Documents.ImageDocument("https://static.boredpanda.com/blog/wp-content/uploads/2018/04/5acb63d83493f__700-png.jpg", {
        x: 650, y: 500
    });
    mainNodeCollection.Docs.push(doc1);
    mainNodeCollection.Docs.push(doc2);
    mainNodeCollection.Docs.push(doc4);
    mainNodeCollection.Docs.push(doc3);
    mainNodeCollection.Docs.push(doc5);
});