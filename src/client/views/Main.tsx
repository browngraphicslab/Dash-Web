import { action, configure } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { DocumentDecorations } from './DocumentDecorations';
import { Documents } from '../documents/Documents';
import { Document } from '../../fields/Document';
import { KeyStore, KeyStore as KS } from '../../fields/Key';
import { ListField } from '../../fields/ListField';
import { NumberField } from '../../fields/NumberField';
import { TextField } from '../../fields/TextField';
import "./Main.scss";
import { ContextMenu } from './ContextMenu';
import { DocumentView } from './nodes/DocumentView';
import { ImageField } from '../../fields/ImageField';
import { Transform } from '../util/Transform';
import { CollectionDockingView } from './collections/CollectionDockingView';


configure({
    enforceActions: "observed"
});

const mainNodeCollection = new Array<Document>();

window.addEventListener("drop", function (e) {
    e.preventDefault();
}, false)
window.addEventListener("dragover", function (e) {
    e.preventDefault();
}, false)
document.addEventListener("pointerdown", action(function (e: PointerEvent) {
    if (!ContextMenu.Instance.intersects(e.pageX, e.pageY)) {
        ContextMenu.Instance.clearItems()
    }
}), true)


let doc1 = Documents.TextDocument({ title: "hello", width: 400, height: 300 });
let doc2 = doc1.MakeDelegate();
doc2.Set(KS.X, new NumberField(150));
doc2.Set(KS.Y, new NumberField(20));
let doc3 = Documents.ImageDocument("https://psmag.com/.image/t_share/MTMyNzc2NzM1MDY1MjgzMDM4/shutterstock_151341212jpg.jpg", {
    x: 450, y: 100, title: "dog", width: 606, height: 386, nativeWidth: 606, nativeHeight: 386
});
//doc3.Set(KeyStore.Data, new ImageField);
const schemaDocs = Array.from(Array(5).keys()).map(v => Documents.ImageDocument("https://psmag.com/.image/t_share/MTMyNzc2NzM1MDY1MjgzMDM4/shutterstock_151341212jpg.jpg", {
    x: 50 + 100 * v, y: 50, width: 100, height: 100, title: "cat" + v, nativeWidth: 606, nativeHeight: 386
}));
schemaDocs.push(doc3);
schemaDocs[0].SetData(KS.Author, "Tyler", TextField);
schemaDocs[4].SetData(KS.Author, "Bob", TextField);
schemaDocs.push(doc2);
const doc7 = Documents.SchemaDocument(schemaDocs)
const docset = [doc1, doc2, doc3, doc7];
let doc4 = Documents.CollectionDocument(docset, {
    x: 0, y: 400, title: "mini collection"
});
// let doc5 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
//     x: 650, y: 500, width: 600, height: 600, title: "cat 2"
// });
let docset2 = [doc3, doc4, doc2];
let doc6 = Documents.CollectionDocument(docset2, {
    x: 350, y: 100, width: 600, height: 600, title: "docking collection"
});

var docs = [doc4, doc3, doc6].map(doc => CollectionDockingView.makeDocumentConfig(doc));
var config = {
    settings: { selectionEnabled: false }, content: [{ type: 'row', content: docs }]
};
let mainContainer = Documents.DockDocument(JSON.stringify(config), {
    x: 0, y: 0, title: "main container"
})

ReactDOM.render((
    <div style={{ position: "absolute", width: "100%", height: "100%" }}>
        <DocumentView Document={mainContainer}
            AddDocument={undefined} RemoveDocument={undefined} ScreenToLocalTransform={() => Transform.Identity}
            Scaling={1}
            isTopMost={true}
            ContainingCollectionView={undefined} />
        <DocumentDecorations />
        <ContextMenu />
    </div>),
    document.getElementById('root'));