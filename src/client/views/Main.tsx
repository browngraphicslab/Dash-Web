import { action, configure } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Document } from '../../fields/Document';
import { KeyStore } from '../../fields/KeyStore';
import { DocumentTransfer, MessageStore } from '../../server/Message';
import { Utils } from '../../Utils';
import { Documents } from '../documents/Documents';
import { Server } from '../Server';
import { setupDrag } from '../util/DragManager';
import { Transform } from '../util/Transform';
import { UndoManager } from '../util/UndoManager';
import { PresentationView } from './PresentationView';
import { Field } from '../../fields/Field';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { ContextMenu } from './ContextMenu';
import { DocumentDecorations } from './DocumentDecorations';
import { DocumentView } from './nodes/DocumentView';
import "./Main.scss";


configure({ enforceActions: "observed" });  // causes errors to be generated when modifying an observable outside of an action
window.addEventListener("drop", (e) => e.preventDefault(), false)
window.addEventListener("dragover", (e) => e.preventDefault(), false)
document.addEventListener("pointerdown", action(function (e: PointerEvent) {
    if (!ContextMenu.Instance.intersects(e.pageX, e.pageY)) {
        ContextMenu.Instance.clearItems()
    }
}), true)


const mainDocId = "mainDoc";
let mainContainer: Document;
let mainfreeform: Document;
console.log("HELLO WORLD")
Documents.initProtos(mainDocId, (res?: Document) => {
    if (res instanceof Document) {
        mainContainer = res;
        mainContainer.GetAsync(KeyStore.ActiveFrame, field => mainfreeform = field as Document);
    }
    else {
        mainContainer = Documents.DockDocument(JSON.stringify({ content: [{ type: 'row', content: [] }] }), { title: "main container" }, mainDocId);

        //save a document for the presentation view in Key Store - this is where title is set
        mainContainer.Set(KeyStore.PresentationView, Documents.FreeformDocument([], { title: "Presentation Mode" }));

        // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
        setTimeout(() => {
            mainfreeform = Documents.FreeformDocument([], { x: 0, y: 400, title: "mini collection" });

            var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(mainfreeform)] }] };
            mainContainer.SetText(KeyStore.Data, JSON.stringify(dockingLayout));
            mainContainer.Set(KeyStore.ActiveFrame, mainfreeform);
        }, 0);
    }

    let imgurl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg";
    let weburl = "https://cs.brown.edu/courses/cs166/";
    let clearDatabase = action(() => Utils.Emit(Server.Socket, MessageStore.DeleteAll, {}))
    let addTextNode = action(() => Documents.TextDocument({ width: 200, height: 200, title: "a text note" }))
    let addColNode = action(() => Documents.FreeformDocument([], { width: 200, height: 200, title: "a feeform collection" }));
    let addSchemaNode = action(() => Documents.SchemaDocument([Documents.TextDocument()], { width: 200, height: 200, title: "a schema collection" }));
    let addImageNode = action(() => Documents.ImageDocument(imgurl, { width: 200, height: 200, title: "an image of a cat" }));
    let addWebNode = action(() => Documents.WebDocument(weburl, { width: 200, height: 200, title: "a sample web page" }));

    let addClick = (creator: () => Document) => action(() => mainfreeform.GetList<Document>(KeyStore.Data, []).push(creator()));

    let imgRef = React.createRef<HTMLDivElement>();
    let webRef = React.createRef<HTMLDivElement>();
    let textRef = React.createRef<HTMLDivElement>();
    let schemaRef = React.createRef<HTMLDivElement>();
    let colRef = React.createRef<HTMLDivElement>();

    let render = function (field: Field | undefined) {
        ReactDOM.render((
            <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                <DocumentView Document={mainContainer}
                    AddDocument={undefined} RemoveDocument={undefined} ScreenToLocalTransform={() => Transform.Identity}
                    ContentScaling={() => 1}
                    PanelWidth={() => 0}
                    PanelHeight={() => 0}
                    isTopMost={true}
                    SelectOnLoad={false}
                    ContainingCollectionView={undefined} />
                <DocumentDecorations />
                <ContextMenu />
                <PresentationView Document={field as Document} />
                <div className="main-buttonDiv" style={{ bottom: '0px' }} ref={imgRef} >
                    <button onPointerDown={setupDrag(imgRef, addImageNode)} onClick={addClick(addImageNode)}>Add Image</button></div>
                <div className="main-buttonDiv" style={{ bottom: '25px' }} ref={webRef} >
                    <button onPointerDown={setupDrag(webRef, addWebNode)} onClick={addClick(addWebNode)}>Add Web</button></div>
                <div className="main-buttonDiv" style={{ bottom: '50px' }} ref={textRef}>
                    <button onPointerDown={setupDrag(textRef, addTextNode)} onClick={addClick(addTextNode)}>Add Text</button></div>
                <div className="main-buttonDiv" style={{ bottom: '75px' }} ref={colRef}>
                    <button onPointerDown={setupDrag(colRef, addColNode)} onClick={addClick(addColNode)}>Add Collection</button></div>
                <div className="main-buttonDiv" style={{ bottom: '100px' }} ref={schemaRef}>
                    <button onPointerDown={setupDrag(schemaRef, addSchemaNode)} onClick={addClick(addSchemaNode)}>Add Schema</button></div>
                <div className="main-buttonDiv" style={{ bottom: '125px' }} >
                    <button onClick={clearDatabase}>Clear Database</button></div>
                <button className="main-undoButtons" style={{ bottom: '25px' }} onClick={() => UndoManager.Undo()}>Undo</button>
                <button className="main-undoButtons" style={{ bottom: '0px' }} onClick={() => UndoManager.Redo()}>Redo</button>
            </div>),
            document.getElementById('root'));
    }
    //call render async passing in the doc saved in PresentationView key
    mainContainer.GetAsync(KeyStore.PresentationView, render);
});
