import { action, configure, observable, runInAction } from 'mobx';
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
import { RouteStore } from '../../server/RouteStore';
import { json } from 'body-parser';
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
import Measure from 'react-measure';
import { DashUserModel } from '../../server/authentication/models/user_model';
import { ServerUtils } from '../../server/ServerUtil';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';

@observer
export class Main extends React.Component {
    // dummy initializations keep the compiler happy
    @observable private mainContainer?: Document;
    @observable private mainfreeform?: Document;
    @observable private userWorkspaces: Document[] = [];
    @observable public pwidth: number = 0;
    @observable public pheight: number = 0;

    private mainDocId: string | undefined;
    private currentUser?: DashUserModel;

    constructor(props: Readonly<{}>) {
        super(props);
        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });
        if (window.location.pathname !== RouteStore.home) {
            let pathname = window.location.pathname.split("/");
            this.mainDocId = pathname[pathname.length - 1];
        }

        CurrentUserUtils.loadCurrentUser();

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

        this.initEventListeners();
        Documents.initProtos(() => {
            this.initAuthenticationRouters();
        });
    }

    initEventListeners = () => {
        // window.addEventListener("pointermove", (e) => this.reportLocation(e))
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
        request.get(ServerUtils.prepend(RouteStore.getActiveWorkspace), (error, response, body) => {
            if (this.mainDocId || body) {
                Server.GetField(this.mainDocId || body, field => {
                    if (field instanceof Document) {
                        this.openWorkspace(field);
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
        let mainDoc = Documents.DockDocument(JSON.stringify({ content: [{ type: 'row', content: [] }] }), { title: `Main Container ${this.userWorkspaces.length + 1}` });
        let newId = mainDoc.Id;
        request.post(ServerUtils.prepend(RouteStore.addWorkspace), {
            body: { target: newId },
            json: true
        }, () => { if (init) this.populateWorkspaces(); });

        // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
        setTimeout(() => {
            let freeformDoc = Documents.FreeformDocument([], { x: 0, y: 400, title: "mini collection" });
            var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(freeformDoc)] }] };
            mainDoc.SetText(KeyStore.Data, JSON.stringify(dockingLayout));
            mainDoc.Set(KeyStore.ActiveFrame, freeformDoc);
            this.openWorkspace(mainDoc);
        }, 0);
        this.userWorkspaces.push(mainDoc);
    }

    @action
    populateWorkspaces = () => {
        // retrieve all workspace documents from the server
        request.get(ServerUtils.prepend(RouteStore.getAllWorkspaces), (error, res, body) => {
            let ids = JSON.parse(body) as string[];
            Server.GetFields(ids, action((fields: { [id: string]: Field }) => this.userWorkspaces = ids.map(id => fields[id] as Document)));
        });
    }

    @action
    openWorkspace = (doc: Document): void => {
        request.post(ServerUtils.prepend(RouteStore.setActiveWorkspace), {
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

    render() {
        let imgRef = React.createRef<HTMLDivElement>();
        let pdfRef = React.createRef<HTMLDivElement>();
        let webRef = React.createRef<HTMLDivElement>();
        let textRef = React.createRef<HTMLDivElement>();
        let schemaRef = React.createRef<HTMLDivElement>();
        let videoRef = React.createRef<HTMLDivElement>();
        let audioRef = React.createRef<HTMLDivElement>();
        let colRef = React.createRef<HTMLDivElement>();
        let workspacesRef = React.createRef<HTMLDivElement>();
        let logoutRef = React.createRef<HTMLDivElement>();

        let imgurl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg";
        let pdfurl = "http://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf"
        let weburl = "https://cs.brown.edu/courses/cs166/";
        let audiourl = "http://techslides.com/demos/samples/sample.mp3";
        let videourl = "http://techslides.com/demos/sample-videos/small.mp4";

        let clearDatabase = action(() => Utils.Emit(Server.Socket, MessageStore.DeleteAll, {}))
        let addTextNode = action(() => Documents.TextDocument({ width: 200, height: 200, title: "a text note" }))
        let addColNode = action(() => Documents.FreeformDocument([], { width: 200, height: 200, title: "a freeform collection" }));
        let addSchemaNode = action(() => Documents.SchemaDocument([Documents.TextDocument()], { width: 200, height: 200, title: "a schema collection" }));
        let addVideoNode = action(() => Documents.VideoDocument(videourl, { width: 200, height: 200, title: "video node" }));
        let addPDFNode = action(() => Documents.PdfDocument(pdfurl, { width: 200, height: 200, title: "a schema collection" }));
        let addImageNode = action(() => Documents.ImageDocument(imgurl, { width: 200, height: 200, title: "an image of a cat" }));
        let addWebNode = action(() => Documents.WebDocument(weburl, { width: 200, height: 200, title: "a sample web page" }));
        let addAudioNode = action(() => Documents.AudioDocument(audiourl, { width: 200, height: 200, title: "audio node" }))

        let addClick = (creator: () => Document) => action(() => this.mainfreeform!.GetList<Document>(KeyStore.Data, []).push(creator()));

        return (
            <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                <Measure onResize={(r: any) => runInAction(() => {
                    this.pwidth = r.entry.width;
                    this.pheight = r.entry.height;
                })}>
                    {({ measureRef }) => {
                        if (!this.mainContainer) {
                            return <div></div>
                        }
                        return <div ref={measureRef} style={{ position: "absolute", width: "100%", height: "100%" }}>
                            <DocumentView Document={this.mainContainer}
                                AddDocument={undefined} RemoveDocument={undefined} ScreenToLocalTransform={() => Transform.Identity}
                                ContentScaling={() => 1}
                                PanelWidth={() => this.pwidth}
                                PanelHeight={() => this.pheight}
                                isTopMost={true}
                                SelectOnLoad={false}
                                focus={() => { }}
                                ContainingCollectionView={undefined} />
                        </div>
                    }}
                </Measure>
                <DocumentDecorations />
                <ContextMenu />

                <button className="clear-db-button" onClick={clearDatabase}>Clear Database</button>

                {/* @TODO this should really be moved into a moveable toolbar component, but for now let's put it here to meet the deadline */}
                < div id="toolbar" >
                    <button className="toolbar-button round-button" title="Undo" onClick={() => UndoManager.Undo()}><FontAwesomeIcon icon="undo-alt" size="sm" /></button>
                    <button className="toolbar-button round-button" title="Redo" onClick={() => UndoManager.Redo()}><FontAwesomeIcon icon="redo-alt" size="sm" /></button>
                    <button className="toolbar-button round-button" title="Ink" onClick={() => InkingControl.Instance.toggleDisplay()}><FontAwesomeIcon icon="pen-nib" size="sm" /></button>
                </div >

                <div className="main-buttonDiv" style={{ top: '34px', left: '2px', position: 'absolute' }} ref={workspacesRef}>
                    <button onClick={this.toggleWorkspaces}>Workspaces</button></div>
                <div className="main-buttonDiv" style={{ top: '34px', right: '1px', position: 'absolute' }} ref={logoutRef}>
                    <button onClick={() => request.get(ServerUtils.prepend(RouteStore.logout), () => { })}>Log Out</button></div>

                <WorkspacesMenu active={this.mainContainer} open={this.openWorkspace} new={this.createNewWorkspace} allWorkspaces={this.userWorkspaces} />
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

                <InkingControl />
            </div>
        );
    }
}

ReactDOM.render(<Main />, document.getElementById('root'));
