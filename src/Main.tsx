import * as React from 'react';
import * as ReactDOM from 'react-dom';
import "./Main.scss";
import "normalize.css"
import { Key, KeyStore as KS, KeyStore } from './fields/Key';
import { NumberField } from './fields/NumberField';
import { Document } from './fields/Document';
import { configure, runInAction, action } from 'mobx';
import { Documents } from './documents/Documents';
import { DocumentDecorations } from './DocumentDecorations';
import { CollectionFreeFormView } from './views/collections/CollectionFreeFormView';
import { ListField } from './fields/ListField';
import { DocumentView } from './views/nodes/DocumentView';
import { ContextMenu } from './views/ContextMenu';
import { TextField } from './fields/TextField';
import { CompileScript } from './util/Scripting';

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
//{
let doc1 = Documents.TextDocument({ title: "hello" });
let doc2 = doc1.MakeDelegate();
doc2.SetField(KS.X, new NumberField(150));
doc2.SetField(KS.Y, new NumberField(20));
let doc3 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
    x: 450, y: 500, title: "cat 1"
});
console.log("script: " + CompileScript("(function(doc: Document): any {return doc.GetNumberField(KeyStore.X, 0)})")()(doc3));
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
let docset2 = new Array<Document>(doc4, doc1, doc3);
let doc6 = Documents.CollectionDocument(docset2, {
    x: 350, y: 100, width: 600, height: 600, title: "docking collection"
});
let mainNodes = null;// mainContainer.GetFieldT(KeyStore.Data, ListField);
if (!mainNodes) {
    mainNodes = new ListField<Document>();
}
// mainNodes.Data.push(doc1);
// mainNodes.Data.push(doc2);
mainNodes.Data.push(doc4);
// mainNodes.Data.push(doc3);
mainNodes.Data.push(doc5);
// mainNodes.Data.push(doc1);
//mainNodes.Data.push(doc2);
mainNodes.Data.push(doc6);
mainContainer.SetField(KeyStore.Data, mainNodes);
//}
//);

function keydown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key == "Enter" && e.ctrlKey) {
        console.log(CompileScript(e.currentTarget.value)()([doc1, doc2, doc3, doc4, doc5]));
        e.preventDefault();
        e.stopPropagation();
    }
}

ReactDOM.render((
    <div style={{ position: "absolute", width: "100%", height: "100%" }}>
        <DocumentView Document={mainContainer} ContainingCollectionView={undefined} ContainingDocumentView={undefined} />
        <DocumentDecorations />
        <ContextMenu />
        <textarea onKeyDown={keydown} style={{ position: "absolute", left: "0px", top: "0px" }} />
    </div>),
    document.getElementById('root'));