import { action, configure } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Document } from '../../fields/Document';
import { KeyStore } from '../../fields/KeyStore';
import "./Main.scss";
import { MessageStore } from '../../server/Message';
import { Utils } from '../../Utils';
import { Documents } from '../documents/Documents';
import { Server } from '../Server';
import { setupDrag } from '../util/DragManager';
import { Transform } from '../util/Transform';
import { UndoManager } from '../util/UndoManager';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { ContextMenu } from './ContextMenu';
import { DocumentDecorations } from './DocumentDecorations';
import { DocumentView } from './nodes/DocumentView';
import "./Main.scss";
import { InkingControl } from './InkingControl';
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFont } from '@fortawesome/free-solid-svg-icons';
import { faImage } from '@fortawesome/free-solid-svg-icons';
import { faFilePdf } from '@fortawesome/free-solid-svg-icons';
import { faObjectGroup } from '@fortawesome/free-solid-svg-icons';
import { faTable } from '@fortawesome/free-solid-svg-icons';
import { faGlobeAsia } from '@fortawesome/free-solid-svg-icons';


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

library.add(faFont);
library.add(faImage);
library.add(faFilePdf);
library.add(faObjectGroup);
library.add(faTable);
library.add(faGlobeAsia);

Documents.initProtos(mainDocId, (res?: Document) => {
    if (res instanceof Document) {
        mainContainer = res;
        mainContainer.GetAsync(KeyStore.ActiveFrame, field => mainfreeform = field as Document);
    }
    else {
        mainContainer = Documents.DockDocument(JSON.stringify({ content: [{ type: 'row', content: [] }] }), { title: "main container" }, mainDocId);

        // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
        setTimeout(() => {
            mainfreeform = Documents.FreeformDocument([], { x: 0, y: 400, title: "mini collection" });

            var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(mainfreeform)] }] };
            mainContainer.SetText(KeyStore.Data, JSON.stringify(dockingLayout));
            mainContainer.Set(KeyStore.ActiveFrame, mainfreeform);
        }, 0);
    }

    let imgurl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg";
    let pdfurl = "http://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf"
    let weburl = "https://cs.brown.edu/courses/cs166/";
    let clearDatabase = action(() => Utils.Emit(Server.Socket, MessageStore.DeleteAll, {}))
    let addTextNode = action(() => Documents.TextDocument({ width: 200, height: 200, title: "a text note" }))
    let addColNode = action(() => Documents.FreeformDocument([], { width: 200, height: 200, title: "a freeform collection" }));
    let addSchemaNode = action(() => Documents.SchemaDocument([Documents.TextDocument()], { width: 200, height: 200, title: "a schema collection" }));
    let addPDFNode = action(() => Documents.PdfDocument(pdfurl, { width: 200, height: 200, title: "a schema collection" }));
    let addImageNode = action(() => Documents.ImageDocument(imgurl, { width: 200, height: 200, title: "an image of a cat" }));
    let addWebNode = action(() => Documents.WebDocument(weburl, { width: 200, height: 200, title: "a sample web page" }));


    let addClick = (creator: () => Document) => action(() =>
        mainfreeform.GetList<Document>(KeyStore.Data, []).push(creator())
    );

    let imgRef = React.createRef<HTMLDivElement>();
    let pdfRef = React.createRef<HTMLDivElement>();
    let webRef = React.createRef<HTMLDivElement>();
    let textRef = React.createRef<HTMLDivElement>();
    let schemaRef = React.createRef<HTMLDivElement>();
    let colRef = React.createRef<HTMLDivElement>();

    // fontawesome stuff
    library.add()

    ReactDOM.render((
        <div style={{ position: "absolute", width: "100%", height: "100%" }}>
            <DocumentView Document={mainContainer}
                AddDocument={undefined} RemoveDocument={undefined} ScreenToLocalTransform={() => Transform.Identity}
                ContentScaling={() => 1}
                PanelWidth={() => 0}
                PanelHeight={() => 0}
                isTopMost={true}
                SelectOnLoad={false}
                focus={() => { }}
                ContainingCollectionView={undefined} />
            <DocumentDecorations />
            <ContextMenu />
            <button className="clear-db-button" onClick={clearDatabase}>Clear Database</button>

            {/* for the expandable add nodes menu */}
            <div id="add-nodes-menu">
                <input type="checkbox" id="add-menu-toggle" />
                <label htmlFor="add-menu-toggle">+</label>

                <div id="add-options-content">
                    <ul id="add-options-list">
                        <li><div ref={textRef}><button className="add-button" onPointerDown={setupDrag(textRef, addTextNode)} onClick={addClick(addTextNode)}>
                            <FontAwesomeIcon icon="font" size="sm" />
                        </button></div></li>
                        <li><div ref={imgRef}><button className="add-button" onPointerDown={setupDrag(imgRef, addImageNode)} onClick={addClick(addImageNode)}>
                            <FontAwesomeIcon icon="image" size="sm" />
                        </button></div></li>
                        <li><div ref={pdfRef}><button className="add-button" onPointerDown={setupDrag(pdfRef, addPDFNode)} onClick={addClick(addPDFNode)}>
                            <FontAwesomeIcon icon="file-pdf" size="sm" />
                        </button></div></li>
                        <li><div ref={webRef}><button className="add-button" onPointerDown={setupDrag(webRef, addWebNode)} onClick={addClick(addWebNode)}>
                            <FontAwesomeIcon icon="globe-asia" size="sm" />
                        </button></div></li>
                        <li><div ref={colRef}><button className="add-button" onPointerDown={setupDrag(colRef, addColNode)} onClick={addClick(addColNode)}>
                            <FontAwesomeIcon icon="object-group" size="sm" />
                        </button></div></li>
                        <li><div ref={schemaRef}><button className="add-button" onPointerDown={setupDrag(schemaRef, addSchemaNode)} onClick={addClick(addSchemaNode)}>
                            <FontAwesomeIcon icon="table" size="sm" />
                        </button></div></li>
                    </ul>
                </div>

            </div>

            <button className="main-undoButtons" style={{ bottom: '25px' }} onClick={() => UndoManager.Undo()}>Undo</button>
            <button className="main-undoButtons" style={{ bottom: '0px' }} onClick={() => UndoManager.Redo()}>Redo</button>

            <InkingControl />
        </div >),
        document.getElementById('root'));
})
