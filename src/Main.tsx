import { action, configure } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { DocumentDecorations } from './DocumentDecorations';
import { Documents } from './documents/Documents';
import { Document } from './fields/Document';
import { KeyStore, KeyStore as KS } from './fields/Key';
import { ListField } from './fields/ListField';
import { NumberField } from './fields/NumberField';
import { TextField } from './fields/TextField';
import "./Main.scss";
import { ContextMenu } from './views/ContextMenu';
import { DocumentView } from './views/nodes/DocumentView';

configure({
    enforceActions: "observed"
});

const mainNodeCollection = new Array<Document>();
let mainContainer = Documents.DockDocument(mainNodeCollection, {
    x: 0, y: 0, title: "main container"
})

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


//runInAction(() => 
{
    let doc1 = Documents.TextDocument({ title: "hello" });
    let doc2 = doc1.MakeDelegate();
    doc2.SetField(KS.X, new NumberField(150));
    doc2.SetField(KS.Y, new NumberField(20));
    let doc3 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
        x: 450, y: 500, title: "cat 1"
    });
    const schemaDocs = Array.from(Array(5).keys()).map(v => Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
        x: 50 + 100 * v, y: 50, width: 100, height: 100, title: "cat" + v
    }));
    schemaDocs[0].SetFieldValue(KS.Author, "Tyler", TextField);
    schemaDocs[4].SetFieldValue(KS.Author, "Bob", TextField);
    schemaDocs.push(doc2);
    const doc7 = Documents.SchemaDocument(schemaDocs)
    const docset = [doc1, doc2, doc3, doc7];
    let doc4 = Documents.CollectionDocument(docset, {
        x: 0, y: 400, title: "mini collection"
    });
    let doc5 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
        x: 650, y: 500, width: 600, height: 600, title: "cat 2"
    });
    let docset2 = new Array<Document>(doc4);//, doc1, doc3);
    let doc6 = Documents.CollectionDocument(docset2, {
        x: 350, y: 100, width: 600, height: 600, title: "docking collection"
    });
    let mainNodes = null;// mainContainer.GetFieldT(KeyStore.Data, ListField);
    if (!mainNodes) {
        mainNodes = new ListField<Document>();
    }
    mainNodes.Data.push(doc1);
    // mainNodes.Data.push(doc2);
    mainNodes.Data.push(doc4);
    // mainNodes.Data.push(doc3);
    // mainNodes.Data.push(doc5);
    // mainNodes.Data.push(doc1);
    //mainNodes.Data.push(doc2);
    mainNodes.Data.push(doc7);
    mainContainer.SetField(KeyStore.Data, mainNodes);
}
//);

ReactDOM.render((
    <div style={{ position: "absolute", width: "100%", height: "100%" }}>
        <DocumentView Document={mainContainer} ContainingCollectionView={undefined} DocumentView={undefined} />
        <DocumentDecorations />
        <ContextMenu />
    </div>),
    document.getElementById('root'));