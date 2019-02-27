import { action, configure, reaction, computed, observable } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { DocumentDecorations } from './DocumentDecorations';
import { Documents } from '../documents/Documents';
import { Document } from '../../fields/Document';
import { KeyStore } from '../../fields/KeyStore';
import "./Main.scss";
import { ContextMenu } from './ContextMenu';
import { DocumentView } from './nodes/DocumentView';
import { Server } from '../Server';
import { Utils } from '../../Utils';
import { ServerUtils } from '../../server/ServerUtil';
import { MessageStore, DocumentTransfer } from '../../server/Message';
import { Database } from '../../server/database';
import * as request from 'request'
import { Transform } from '../util/Transform';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { FieldWaiting } from '../../fields/Field';
import { UndoManager } from '../util/UndoManager';
import { WorkspacesMenu } from '../../server/authentication/controllers/WorkspacesMenu';


configure({
    enforceActions: "observed"
});
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

// Load the user's active workspace, or create a new one if initial session after signup
request.get(window.location.origin + "/getActiveWorkspaceId", (error, response, body) => {
    init(body ? body : getNewWorkspace());
});

function getNewWorkspace(): string {
    let newId = Utils.GenerateGuid();
    const here = window.location.origin;
    request.post(here + "/addWorkspaceId", {
        body: {
            target: newId
        },
        json: true
    })
    request.post(here + "/setActiveWorkspaceId", {
        body: {
            target: newId
        },
        json: true
    })
    return newId;
}

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
function init(mainDocId: string) {
    Documents.initProtos(() => {
        Utils.EmitCallback(Server.Socket, MessageStore.GetField, mainDocId, (res: any) => {
            console.log("HELLO WORLD")
            console.log("RESPONSE: " + res)
            let mainContainer: Document;
            let mainfreeform: Document;
            if (res) {
                mainContainer = ServerUtils.FromJson(res) as Document;
                mainContainer.GetAsync(KeyStore.ActiveFrame, field => mainfreeform = field as Document);
            }
            else {
                mainContainer = Documents.DockDocument(JSON.stringify({ content: [{ type: 'row', content: [] }] }), { title: "main container" }, mainDocId);
                Utils.Emit(Server.Socket, MessageStore.AddDocument, new DocumentTransfer(mainContainer.ToJson()))

                mainfreeform = Documents.FreeformDocument([], { x: 0, y: 400, title: "mini collection" });
                Utils.Emit(Server.Socket, MessageStore.AddDocument, new DocumentTransfer(mainfreeform.ToJson()));

                var docs = [mainfreeform].map(doc => CollectionDockingView.makeDocumentConfig(doc));
                mainContainer.SetText(KeyStore.Data, JSON.stringify({ content: [{ type: 'row', content: docs }] }));
                mainContainer.Set(KeyStore.ActiveFrame, mainfreeform);
            }

            let addImageNode = action(() => {
                mainfreeform.GetList<Document>(KeyStore.Data, []).push(Documents.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", {
                    x: 0, y: 300, width: 200, height: 200, title: "added note"
                }));
            })
            let addTextNode = action(() => {
                mainfreeform.GetList<Document>(KeyStore.Data, []).push(Documents.TextDocument({
                    x: 0, y: 300, width: 200, height: 200, title: "added note"
                }));
            })
            let addColNode = action(() => {
                mainfreeform.GetList<Document>(KeyStore.Data, []).push(Documents.FreeformDocument([], {
                    x: 0, y: 300, width: 200, height: 200, title: "added note"
                }));
            })
            let addSchemaNode = action(() => {
                mainfreeform.GetList<Document>(KeyStore.Data, []).push(Documents.SchemaDocument([Documents.TextDocument()], {
                    x: 0, y: 300, width: 200, height: 200, title: "added note"
                }));
            })

            let clearDatabase = action(() => {
                Utils.Emit(Server.Socket, MessageStore.DeleteAll, {});
            })

            ReactDOM.render((
                <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                    <DocumentView Document={mainContainer}
                        AddDocument={undefined} RemoveDocument={undefined} ScreenToLocalTransform={() => Transform.Identity}
                        ContentScaling={() => 1}
                        PanelWidth={() => 0}
                        PanelHeight={() => 0}
                        isTopMost={true}
                        ContainingCollectionView={undefined} />
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
                        bottom: '100',
                        left: '0px',
                        width: '150px'
                    }} onClick={addSchemaNode}>Add Schema</button>
                    <button style={{
                        position: 'absolute',
                        bottom: '75px',
                        left: '0px',
                        width: '150px'
                    }} onClick={clearDatabase}>Clear Database</button>
                    <button style={{
                        position: 'absolute',
                        bottom: '25',
                        right: '0px',
                        width: '150px'
                    }} onClick={() => UndoManager.Undo()}>Undo</button>
                    <button style={{
                        position: 'absolute',
                        bottom: '0',
                        right: '0px',
                        width: '150px'
                    }} onClick={() => UndoManager.Redo()}>Redo</button>
                    <button style={{
                        position: 'absolute',
                        top: '24px',
                        right: '0px',
                        width: '150px'
                    }} onClick={() => window.location.pathname = "/logout"}>Logout</button>
                    <button style={{
                        position: 'absolute',
                        top: '24px',
                        left: '4px',
                        width: '150px'
                    }} onClick={() => WorkspacesMenu.Instance.toggle()}>Workspaces</button>
                    <WorkspacesMenu load={init} new={getNewWorkspace} active={mainDocId} />
                </div>),
                document.getElementById('root'));
        })
    });
}
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
