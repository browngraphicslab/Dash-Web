import { action, configure, observable } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Document } from '../../fields/Document';
import { KeyStore } from '../../fields/KeyStore';
import "./Main.scss";
import { MessageStore } from '../../server/Message';
import { Utils } from '../../Utils';
import * as request from 'request'
import { Documents } from '../documents/Documents';
import { Server } from '../Server';
import { setupDrag } from '../util/DragManager';
import { Transform } from '../util/Transform';
import { UndoManager } from '../util/UndoManager';
import { WorkspacesMenu } from '../../server/authentication/controllers/WorkspacesMenu';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { ContextMenu } from './ContextMenu';
import { DocumentDecorations } from './DocumentDecorations';
import { DocumentView } from './nodes/DocumentView';
import "./Main.scss";
import { observer } from 'mobx-react';
import { Field, Opt } from '../../fields/Field';
import { InkingControl } from './InkingControl';

@observer
export class Main extends React.Component {
    // dummy initializations keep the compiler happy
    @observable private mainContainer?: Document;
    @observable private mainfreeform?: Document;
    @observable private userWorkspaces: Document[] = [];

    constructor(props: Readonly<{}>) {
        super(props);
        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });

        this.initEventListeners();
        Documents.initProtos(() => {
            this.initAuthenticationRouters();
        });
    }

    initEventListeners = () => {
        window.addEventListener("drop", (e) => e.preventDefault(), false) // drop event handler
        window.addEventListener("dragover", (e) => e.preventDefault(), false) // drag event handler
        // click interactions for the context menu
        document.addEventListener("pointerdown", action(function (e: PointerEvent) {
            if (!ContextMenu.Instance.intersects(e.pageX, e.pageY)) {
                ContextMenu.Instance.clearItems();
            }
        }), true);
    }

    initAuthenticationRouters = () => {
        // Load the user's active workspace, or create a new one if initial session after signup
        request.get(this.contextualize("getActiveWorkspaceId"), (error, response, body) => {
            if (body) {
                Server.GetField(body, field => {
                    if (field instanceof Document) {
                        this.openDocument(field);
                        this.populateWorkspaces();
                    } else {
                        this.createNewWorkspace(true);
                    }
                });
            } else {
                this.createNewWorkspace(true);
            }
        });
    }

    @action
    createNewWorkspace = (init: boolean): void => {
        let mainDoc = Documents.DockDocument(JSON.stringify({ content: [{ type: 'row', content: [] }] }), { title: `Main Container ${this.userWorkspaces.length}` });
        let newId = mainDoc.Id;
        request.post(this.contextualize("addWorkspaceId"), {
            body: { target: newId },
            json: true
        }, () => { if (init) this.populateWorkspaces(); });

        // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
        setTimeout(() => {
            let freeformDoc = Documents.FreeformDocument([], { x: 0, y: 400, title: "mini collection" });
            var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(freeformDoc)] }] };
            mainDoc.SetText(KeyStore.Data, JSON.stringify(dockingLayout));
            mainDoc.Set(KeyStore.ActiveFrame, freeformDoc);
            this.openDocument(mainDoc);
        }, 0);
        this.userWorkspaces.push(mainDoc);
    }

    @action
    populateWorkspaces = () => {
        // retrieve all workspace documents from the server
        request.get(this.contextualize("getAllWorkspaceIds"), (error, res, body) => {
            let ids = JSON.parse(body) as string[];
            Server.GetFields(ids, action((fields: { [id: string]: Field }) => this.userWorkspaces = ids.map(id => fields[id] as Document)));
        });
    }

    @action
    openDocument = (doc: Document): void => {
        request.post(this.contextualize("setActiveWorkspaceId"), {
            body: { target: doc.Id },
            json: true
        });
        this.mainContainer = doc;
        this.mainContainer.GetAsync(KeyStore.ActiveFrame, field => this.mainfreeform = field as Document);
    }

    toggleWorkspaces = () => {
        if (WorkspacesMenu.Instance) {
            WorkspacesMenu.Instance.toggle()
        }
    }

    contextualize = (extension: string) => window.location.origin + "/" + extension;

    render() {
        let imgRef = React.createRef<HTMLDivElement>();
        let webRef = React.createRef<HTMLDivElement>();
        let textRef = React.createRef<HTMLDivElement>();
        let schemaRef = React.createRef<HTMLDivElement>();
        let colRef = React.createRef<HTMLDivElement>();
        let workspacesRef = React.createRef<HTMLDivElement>();
        let pdfRef = React.createRef<HTMLDivElement>();

        let imgurl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg";
        let pdfurl = "http://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf"
        let weburl = "https://cs.brown.edu/courses/cs166/";
        let clearDatabase = action(() => Utils.Emit(Server.Socket, MessageStore.DeleteAll, {}))
        let addTextNode = action(() => Documents.TextDocument({ width: 200, height: 200, title: "a text note" }))
        let addColNode = action(() => Documents.FreeformDocument([], { width: 200, height: 200, title: "a feeform collection" }));
        let addPDFNode = action(() => Documents.PdfDocument(pdfurl, { width: 200, height: 200, title: "a schema collection" }));
        let addSchemaNode = action(() => Documents.SchemaDocument([Documents.TextDocument()], { width: 200, height: 200, title: "a schema collection" }));
        let addImageNode = action(() => Documents.ImageDocument(imgurl, { width: 200, height: 200, title: "an image of a cat" }));
        let addWebNode = action(() => Documents.WebDocument(weburl, { width: 200, height: 200, title: "a sample web page" }));

        let addClick = (creator: () => Document) => action(() => this.mainfreeform!.GetList<Document>(KeyStore.Data, []).push(creator()));

        if (!this.mainContainer) {
            return <div></div>
        }
        return (
            <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                <DocumentView Document={this.mainContainer}
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
                <WorkspacesMenu active={this.mainContainer} open={this.openDocument} new={this.createNewWorkspace} allWorkspaces={this.userWorkspaces} />
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
                <div className="main-buttonDiv" style={{ top: '25px' }} ref={workspacesRef}>
                    <button onClick={this.toggleWorkspaces}>View Workspaces</button></div>
                <div className="main-buttonDiv" style={{ bottom: '150px' }} ref={pdfRef}>
                    <button onPointerDown={setupDrag(pdfRef, addPDFNode)} onClick={addClick(addPDFNode)}>Add PDF</button></div>
                <button className="main-undoButtons" style={{ bottom: '25px' }} onClick={() => UndoManager.Undo()}>Undo</button>
                <button className="main-undoButtons" style={{ bottom: '0px' }} onClick={() => UndoManager.Redo()}>Redo</button>
            </div>
        );
    }
}

ReactDOM.render(<Main />, document.getElementById('root'));
