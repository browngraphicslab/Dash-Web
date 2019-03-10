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
import { faUndoAlt } from '@fortawesome/free-solid-svg-icons';
import { faRedoAlt } from '@fortawesome/free-solid-svg-icons';
import { faPenNib } from '@fortawesome/free-solid-svg-icons';
import { faFilm } from '@fortawesome/free-solid-svg-icons';
import { faMusic } from '@fortawesome/free-solid-svg-icons';


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
library.add(faUndoAlt);
library.add(faRedoAlt);
library.add(faPenNib);
library.add(faFilm);
library.add(faMusic);

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
    let audiourl = "http://techslides.com/demos/samples/sample.mp3";
    let videourl = "http://techslides.com/demos/sample-videos/small.mp4";
    let clearDatabase = action(() => Utils.Emit(Server.Socket, MessageStore.DeleteAll, {}))
    let addTextNode = action(() => Documents.TextDocument({ width: 230, height: 130, title: "a text note" }))
    let addColNode = action(() => Documents.FreeformDocument([], { width: 300, height: 300, title: "a freeform collection" }));
    let addSchemaNode = action(() => Documents.SchemaDocument([Documents.TextDocument()], { width: 450, height: 200, title: "a schema collection" }));
    let addPDFNode = action(() => Documents.PdfDocument(pdfurl, { width: 300, height: 400, title: "a pdf" }));
    let addImageNode = action(() => Documents.ImageDocument(imgurl, { width: 200, height: 200, title: "an image of a cat" }));
    let addWebNode = action(() => Documents.WebDocument(weburl, { width: 300, height: 400, title: "a sample web page" }));
    let addVideoNode = action(() => Documents.VideoDocument(videourl, { width: 300, height: 250, title: "video node" }));
    let addAudioNode = action(() => Documents.AudioDocument(audiourl, { width: 250, height: 100, title: "audio node" }));
    let addClick = (creator: () => Document) => action(() =>
        mainfreeform.GetList<Document>(KeyStore.Data, []).push(creator())
    );

    let imgRef = React.createRef<HTMLDivElement>();
    let pdfRef = React.createRef<HTMLDivElement>();
    let webRef = React.createRef<HTMLDivElement>();
    let textRef = React.createRef<HTMLDivElement>();
    let schemaRef = React.createRef<HTMLDivElement>();
    let videoRef = React.createRef<HTMLDivElement>();
    let audioRef = React.createRef<HTMLDivElement>();
    let colRef = React.createRef<HTMLDivElement>();

    ReactDOM.render((
        <div style={{ position: "absolute", width: "100%", height: "100%" }}>
            {/* <div id="dash-title">— DASH —</div> */}

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

            {/* @TODO this should really be moved into a moveable toolbar component, but for now let's put it here to meet the deadline */}
            < div id="toolbar" >
                <button className="toolbar-button round-button" title="Undo" onClick={() => UndoManager.Undo()}><FontAwesomeIcon icon="undo-alt" size="sm" /></button>
                <button className="toolbar-button round-button" title="Redo" onClick={() => UndoManager.Redo()}><FontAwesomeIcon icon="redo-alt" size="sm" /></button>
                {/* @TODO do the ink thing */}
                < button className="toolbar-button round-button" title="Ink" > <FontAwesomeIcon icon="pen-nib" size="sm" /></button >
            </div >

            {/* for the expandable add nodes menu. Not included with the above because once it expands it expands the whole div with it, making canvas interactions limited. */}
            < div id="add-nodes-menu" >
                <input type="checkbox" id="add-menu-toggle" />
                <label htmlFor="add-menu-toggle" title="Add Node"><p>+</p></label>

                <div id="add-options-content">
                    <ul id="add-options-list">
                        <li><div ref={textRef}><button className="round-button add-button" title="Add Textbox" onPointerDown={setupDrag(textRef, addTextNode)} onClick={addClick(addTextNode)}>
                            <FontAwesomeIcon icon="font" size="sm" />
                        </button></div></li>
                        <li><div ref={imgRef}><button className="round-button add-button" title="Add Image" onPointerDown={setupDrag(imgRef, addImageNode)} onClick={addClick(addImageNode)}>
                            <FontAwesomeIcon icon="image" size="sm" />
                        </button></div></li>
                        <li><div ref={pdfRef}><button className="round-button add-button" title="Add PDF" onPointerDown={setupDrag(pdfRef, addPDFNode)} onClick={addClick(addPDFNode)}>
                            <FontAwesomeIcon icon="file-pdf" size="sm" />
                        </button></div></li>
                        <li><div ref={videoRef}><button className="round-button add-button" title="Add Video" onPointerDown={setupDrag(videoRef, addVideoNode)} onClick={addClick(addVideoNode)}>
                            <FontAwesomeIcon icon="film" size="sm" />
                        </button></div></li>
                        <li><div ref={audioRef}><button className="round-button add-button" title="Add Audio" onPointerDown={setupDrag(audioRef, addAudioNode)} onClick={addClick(addAudioNode)}>
                            <FontAwesomeIcon icon="music" size="sm" />
                        </button></div></li>
                        <li><div ref={webRef}><button className="round-button add-button" title="Add Web Clipping" onPointerDown={setupDrag(webRef, addWebNode)} onClick={addClick(addWebNode)}>
                            <FontAwesomeIcon icon="globe-asia" size="sm" />
                        </button></div></li>
                        <li><div ref={colRef}><button className="round-button add-button" title="Add Collection" onPointerDown={setupDrag(colRef, addColNode)} onClick={addClick(addColNode)}>
                            <FontAwesomeIcon icon="object-group" size="sm" />
                        </button></div></li>
                        <li><div ref={schemaRef}><button className="round-button add-button" title="Add Schema" onPointerDown={setupDrag(schemaRef, addSchemaNode)} onClick={addClick(addSchemaNode)}>
                            <FontAwesomeIcon icon="table" size="sm" />
                        </button></div></li>
                    </ul>
                </div>

            </div >

            {/* <InkingControl /> */}
        </div >),
        document.getElementById('root'));
})
