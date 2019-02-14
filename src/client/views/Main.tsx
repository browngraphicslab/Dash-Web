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
import { CompileScript } from './../util/Scripting';
import { Server } from '../Server';
import { Utils } from '../../Utils';
import { ServerUtils } from '../../server/ServerUtil';
import { MessageStore, DocumentTransfer } from '../../server/Message';
import { Database } from '../../server/database';


configure({
    enforceActions: "observed"
});

// const mainNodeCollection = new Array<Document>();
// let mainContainer = Documents.DockDocument(mainNodeCollection, {
//     x: 0, y: 0, title: "main container"
// })

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
// let doc1 = Documents.TextDocument({ title: "hello" });
// let doc2 = doc1.MakeDelegate();
// doc2.Set(KS.X, new NumberField(150));
// doc2.Set(KS.Y, new NumberField(20));
// let doc3 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
//     x: 450, y: 100, title: "cat 1"
// });
// doc3.Set(KeyStore.Data, new ImageField);
// const schemaDocs = Array.from(Array(5).keys()).map(v => Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
//     x: 50 + 100 * v, y: 50, width: 100, height: 100, title: "cat" + v
// }));
// schemaDocs[0].SetData(KS.Author, "Tyler", TextField);
// schemaDocs[4].SetData(KS.Author, "Bob", TextField);
// schemaDocs.push(doc2);
// const doc7 = Documents.SchemaDocument(schemaDocs)

Utils.EmitCallback(Server.Socket, MessageStore.GetField, "dash", (res: any) => {
    console.log("HELLO WORLD")
    console.log("RESPONSE: " + res)
    let mainContainer: Document = new Document();
    if (res) {
        let obj = ServerUtils.FromJson(res) as Document
        mainContainer = obj
        console.log(mainContainer)
    }
    else {
        const docset: Document[] = [];
        let doc4 = Documents.CollectionDocument(docset, {
            x: 0, y: 400, title: "mini collection"
        }, true);
        mainContainer = doc4;
        let args = new DocumentTransfer(mainContainer.ToJson())
        Utils.Emit(Server.Socket, MessageStore.AddDocument, args)
    }

    let addImageNode = action(() => {
        mainContainer.GetList<Document>(KeyStore.Data, []).push(Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
            x: 0, y: 300, width: 200, height: 200, title: "added note"
        }));
    })
    let addTextNode = action(() => {
        mainContainer.GetList<Document>(KeyStore.Data, []).push(Documents.TextDocument({
            x: 0, y: 300, width: 200, height: 200, title: "added note"
        }));
    })
    let addColNode = action(() => {
        mainContainer.GetList<Document>(KeyStore.Data, []).push(Documents.CollectionDocument([], {
            x: 0, y: 300, width: 200, height: 200, title: "added note"
        }));
    })

    let clearDatabase = action(() => {
        Utils.Emit(Server.Socket, MessageStore.DeleteAll, {});
    })

    ReactDOM.render((
        <div style={{ position: "absolute", width: "100%", height: "100%" }}>
            <DocumentView Document={mainContainer} ContainingCollectionView={undefined} DocumentView={undefined} />
            <DocumentDecorations />
            <ContextMenu />
            <button style={{
                position: 'absolute',
                bottom: '0px',
                left: '0px',
                width: '150px'
            }} onClick={addImageNode}>Add Image</button>
            <button style={{
                position: 'absolute',
                bottom: '25px',
                left: '0px',
                width: '150px'
            }} onClick={addTextNode}>Add Text</button>
            <button style={{
                position: 'absolute',
                bottom: '50px',
                left: '0px',
                width: '150px'
            }} onClick={addColNode}>Add Collection</button>
            <button style={{
                position: 'absolute',
                bottom: '75px',
                left: '0px',
                width: '150px'
            }} onClick={clearDatabase}>Clear Database</button>
        </div>),
        document.getElementById('root'));
})
// let doc5 = Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
//     x: 650, y: 500, width: 600, height: 600, title: "cat 2"
// });
// let docset2 = new Array<Document>(doc4);//, doc1, doc3);
// let doc6 = Documents.CollectionDocument(docset2, {
//     x: 350, y: 100, width: 600, height: 600, title: "docking collection"
// });
// let mainNodes = mainContainer.GetOrCreate(KeyStore.Data, ListField);
// mainNodes.Data.push(doc6);
// mainNodes.Data.push(doc2);
// mainNodes.Data.push(doc4);
// mainNodes.Data.push(doc3);
// mainNodes.Data.push(doc5);
// mainNodes.Data.push(doc1);
//mainNodes.Data.push(doc2);
//mainNodes.Data.push(doc6);
// mainContainer.Set(KeyStore.Data, mainNodes);
//}
//);
