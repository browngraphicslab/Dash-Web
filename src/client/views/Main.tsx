import { action, configure, observable, runInAction, trace, computed, reaction } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Document } from '../../fields/Document';
import { KeyStore } from '../../fields/KeyStore';
import "./Main.scss";
import { MessageStore } from '../../server/Message';
import { Utils } from '../../Utils';
import * as request from 'request'
import * as rp from 'request-promise'
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
import { InkingControl } from './InkingControl';
import { RouteStore } from '../../server/RouteStore';
import { library, IconName } from '@fortawesome/fontawesome-svg-core';
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
import { faTree } from '@fortawesome/free-solid-svg-icons';
import Measure from 'react-measure';
import { DashUserModel } from '../../server/authentication/models/user_model';
import { ServerUtils } from '../../server/ServerUtil';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { Field, Opt, FieldWaiting } from '../../fields/Field';
import { ListField } from '../../fields/ListField';
import { Gateway, Settings } from '../northstar/manager/Gateway';
import { Catalog, Schema, Attribute, AttributeGroup, AggregateFunction } from '../northstar/model/idea/idea';
import { ArrayUtil } from '../northstar/utils/ArrayUtil';
import '../northstar/model/ModelExtensions'
import '../northstar/utils/Extensions'
import { HistogramOperation } from '../northstar/operations/HistogramOperation';
import { AttributeTransformationModel } from '../northstar/core/attribute/AttributeTransformationModel';
import { ColumnAttributeModel } from '../northstar/core/attribute/AttributeModel';

@observer
export class Main extends React.Component {
    // dummy initializations keep the compiler happy
    @observable private mainfreeform?: Document;
    @observable public pwidth: number = 0;
    @observable public pheight: number = 0;
    private _northstarSchemas: Document[] = [];

    @computed private get mainContainer(): Document | undefined {
        let doc = this.userDocument.GetT(KeyStore.ActiveWorkspace, Document);
        return doc == FieldWaiting ? undefined : doc;
    }

    private set mainContainer(doc: Document | undefined) {
        if (doc) {
            this.userDocument.Set(KeyStore.ActiveWorkspace, doc);
        }
    }

    private get userDocument(): Document {
        return CurrentUserUtils.UserDocument;
    }

    public static Instance: Main;

    constructor(props: Readonly<{}>) {
        super(props);
        Main.Instance = this;
        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });
        if (window.location.pathname !== RouteStore.home) {
            let pathname = window.location.pathname.split("/");
            if (pathname.length > 1 && pathname[pathname.length - 2] == 'doc') {
                CurrentUserUtils.MainDocId = pathname[pathname.length - 1];
            }
        };

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
        library.add(faTree);

        this.initEventListeners();
        this.initAuthenticationRouters();

        this.initializeNorthstar();
    }

    onHistory = () => {
        if (window.location.pathname !== RouteStore.home) {
            let pathname = window.location.pathname.split("/");
            CurrentUserUtils.MainDocId = pathname[pathname.length - 1];
            Server.GetField(CurrentUserUtils.MainDocId, action((field: Opt<Field>) => {
                if (field instanceof Document) {
                    this.openWorkspace(field, true);
                }
            }));
        }
    }

    componentDidMount() {
        window.onpopstate = this.onHistory;
    }

    componentWillUnmount() {
        window.onpopstate = null;
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
        if (!CurrentUserUtils.MainDocId) {
            this.userDocument.GetTAsync(KeyStore.ActiveWorkspace, Document).then(doc => {
                if (doc) {
                    CurrentUserUtils.MainDocId = doc.Id;
                    this.openWorkspace(doc);
                } else {
                    this.createNewWorkspace();
                }
            })
        } else {
            Server.GetField(CurrentUserUtils.MainDocId).then(field => {
                if (field instanceof Document) {
                    this.openWorkspace(field)
                } else {
                    this.createNewWorkspace(CurrentUserUtils.MainDocId);
                }
            })
        }
    }

    @action
    createNewWorkspace = (id?: string): void => {
        this.userDocument.GetTAsync<ListField<Document>>(KeyStore.Workspaces, ListField).then(action((list: Opt<ListField<Document>>) => {
            if (list) {
                let freeformDoc = Documents.FreeformDocument([], { x: 0, y: 400, title: "mini collection" });
                var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(freeformDoc)] }] };
                let mainDoc = Documents.DockDocument(JSON.stringify(dockingLayout), { title: `Main Container ${list.Data.length + 1}` }, id);
                list.Data.push(mainDoc);
                CurrentUserUtils.MainDocId = mainDoc.Id;
                // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
                setTimeout(() => {
                    this.openWorkspace(mainDoc);
                    let pendingDocument = Documents.SchemaDocument([], { title: "New Mobile Uploads" })
                    mainDoc.Set(KeyStore.OptionalRightCollection, pendingDocument);
                }, 0);
            }
        }));
    }

    @action
    openWorkspace = (doc: Document, fromHistory = false): void => {
        this.mainContainer = doc;
        fromHistory || window.history.pushState(null, doc.Title, "/doc/" + doc.Id);
        this.userDocument.GetTAsync(KeyStore.OptionalRightCollection, Document).then(col => {
            // if there is a pending doc, and it has new data, show it (syip: we use a timeout to prevent collection docking view from being uninitialized)
            setTimeout(() => {
                if (col) {
                    col.GetTAsync<ListField<Document>>(KeyStore.Data, ListField, (f: Opt<ListField<Document>>) => {
                        if (f && f.Data.length > 0) {
                            CollectionDockingView.Instance.AddRightSplit(col);
                        }
                    })
                }
            }, 100);
        });
    }

    @observable
    workspacesShown: boolean = false;

    areWorkspacesShown = () => {
        return this.workspacesShown;
    }
    @action
    toggleWorkspaces = () => {
        this.workspacesShown = !this.workspacesShown;
    }

    screenToLocalTransform = () => Transform.Identity
    pwidthFunc = () => this.pwidth;
    pheightFunc = () => this.pheight;
    focusDocument = (doc: Document) => { }
    noScaling = () => 1;

    @computed
    get mainContent() {
        return !this.mainContainer ? (null) :
            <DocumentView Document={this.mainContainer}
                AddDocument={undefined}
                RemoveDocument={undefined}
                ScreenToLocalTransform={this.screenToLocalTransform}
                ContentScaling={this.noScaling}
                PanelWidth={this.pwidthFunc}
                PanelHeight={this.pheightFunc}
                isTopMost={true}
                SelectOnLoad={false}
                focus={this.focusDocument}
                ContainingCollectionView={undefined} />
    }

    /* for the expandable add nodes menu. Not included with the miscbuttons because once it expands it expands the whole div with it, making canvas interactions limited. */
    @computed
    get nodesMenu() {
        let imgurl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg";
        let pdfurl = "http://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf"
        let weburl = "https://cs.brown.edu/courses/cs166/";
        let audiourl = "http://techslides.com/demos/samples/sample.mp3";
        let videourl = "http://techslides.com/demos/sample-videos/small.mp4";

        let addTextNode = action(() => Documents.TextDocument({ width: 200, height: 200, title: "a text note" }))
        let addColNode = action(() => Documents.FreeformDocument([], { width: 200, height: 200, title: "a freeform collection" }));
        let addSchemaNode = action(() => Documents.SchemaDocument([], { width: 200, height: 200, title: "a schema collection" }));
        let addTreeNode = action(() => Documents.TreeDocument(this._northstarSchemas, { width: 250, height: 400, title: "northstar schemas" }));
        let addVideoNode = action(() => Documents.VideoDocument(videourl, { width: 200, height: 200, title: "video node" }));
        let addPDFNode = action(() => Documents.PdfDocument(pdfurl, { width: 200, height: 200, title: "a schema collection" }));
        let addImageNode = action(() => Documents.ImageDocument(imgurl, { width: 200, height: 200, title: "an image of a cat" }));
        let addWebNode = action(() => Documents.WebDocument(weburl, { width: 200, height: 200, title: "a sample web page" }));
        let addAudioNode = action(() => Documents.AudioDocument(audiourl, { width: 200, height: 200, title: "audio node" }))

        let btns: [React.RefObject<HTMLDivElement>, IconName, string, () => Document][] = [
            [React.createRef<HTMLDivElement>(), "font", "Add Textbox", addTextNode],
            [React.createRef<HTMLDivElement>(), "image", "Add Image", addImageNode],
            [React.createRef<HTMLDivElement>(), "file-pdf", "Add PDF", addPDFNode],
            [React.createRef<HTMLDivElement>(), "film", "Add Video", addVideoNode],
            [React.createRef<HTMLDivElement>(), "music", "Add Audio", addAudioNode],
            [React.createRef<HTMLDivElement>(), "globe-asia", "Add Web Clipping", addWebNode],
            [React.createRef<HTMLDivElement>(), "object-group", "Add Collection", addColNode],
            [React.createRef<HTMLDivElement>(), "tree", "Add Tree", addTreeNode],
            [React.createRef<HTMLDivElement>(), "table", "Add Schema", addSchemaNode],
        ]

        return < div id="add-nodes-menu" >
            <input type="checkbox" id="add-menu-toggle" />
            <label htmlFor="add-menu-toggle" title="Add Node"><p>+</p></label>

            <div id="add-options-content">
                <ul id="add-options-list">
                    {btns.map(btn =>
                        <li key={btn[1]} ><div ref={btn[0]}>
                            <button className="round-button add-button" title={btn[2]} onPointerDown={setupDrag(btn[0], btn[3])}>
                                <FontAwesomeIcon icon={btn[1]} size="sm" />
                            </button>
                        </div></li>)}
                </ul>
            </div>
        </div >
    }

    /* @TODO this should really be moved into a moveable toolbar component, but for now let's put it here to meet the deadline */
    @computed
    get miscButtons() {
        let workspacesRef = React.createRef<HTMLDivElement>();
        let logoutRef = React.createRef<HTMLDivElement>();

        let clearDatabase = action(() => Utils.Emit(Server.Socket, MessageStore.DeleteAll, {}))
        return [
            <button className="clear-db-button" key="clear-db" onClick={clearDatabase}>Clear Database</button>,
            <div id="toolbar" key="toolbar">
                <button className="toolbar-button round-button" title="Undo" onClick={() => UndoManager.Undo()}><FontAwesomeIcon icon="undo-alt" size="sm" /></button>
                <button className="toolbar-button round-button" title="Redo" onClick={() => UndoManager.Redo()}><FontAwesomeIcon icon="redo-alt" size="sm" /></button>
                <button className="toolbar-button round-button" title="Ink" onClick={() => InkingControl.Instance.toggleDisplay()}><FontAwesomeIcon icon="pen-nib" size="sm" /></button>
            </div >,
            <div className="main-buttonDiv" key="workspaces" style={{ top: '34px', left: '2px', position: 'absolute' }} ref={workspacesRef}>
                <button onClick={this.toggleWorkspaces}>Workspaces</button></div>,
            <div className="main-buttonDiv" key="logout" style={{ top: '34px', right: '1px', position: 'absolute' }} ref={logoutRef}>
                <button onClick={() => request.get(ServerUtils.prepend(RouteStore.logout), () => { })}>Log Out</button></div>
        ]
    }

    render() {
        let workspaceMenu: any = null;
        let workspaces = this.userDocument.GetT<ListField<Document>>(KeyStore.Workspaces, ListField);
        if (workspaces && workspaces !== FieldWaiting) {
            workspaceMenu = <WorkspacesMenu active={this.mainContainer} open={this.openWorkspace} new={this.createNewWorkspace} allWorkspaces={workspaces.Data}
                isShown={this.areWorkspacesShown} toggle={this.toggleWorkspaces} />
        }
        return (
            <div id="main-div">
                <DocumentDecorations />
                <Measure onResize={(r: any) => runInAction(() => {
                    this.pwidth = r.entry.width;
                    this.pheight = r.entry.height;
                })}>
                    {({ measureRef }) =>
                        <div ref={measureRef} id="mainContent-div">
                            {this.mainContent}
                        </div>
                    }
                </Measure>
                <ContextMenu />
                {this.nodesMenu}
                {this.miscButtons}
                {workspaceMenu}
                <InkingControl />
            </div>
        );
    }

    // --------------- Northstar hooks ------------- /

    @action SetNorthstarCatalog(ctlog: Catalog) {
        CurrentUserUtils.NorthstarDBCatalog = ctlog;
        if (ctlog && ctlog.schemas) {
            this._northstarSchemas = ctlog.schemas.map(schema => {
                let schemaDoc = Documents.TreeDocument([], { width: 50, height: 100, title: schema.displayName! });
                let schemaDocuments = schemaDoc.GetList(KeyStore.Data, [] as Document[]);
                CurrentUserUtils.GetAllNorthstarColumnAttributes(schema).map(attr => {
                    Server.GetField(attr.displayName! + ".alias", action((field: Opt<Field>) => {
                        if (field instanceof Document) {
                            schemaDocuments.push(field);
                        } else {
                            var atmod = new ColumnAttributeModel(attr);
                            let histoOp = new HistogramOperation(schema!.displayName!,
                                new AttributeTransformationModel(atmod, AggregateFunction.None),
                                new AttributeTransformationModel(atmod, AggregateFunction.Count),
                                new AttributeTransformationModel(atmod, AggregateFunction.Count));
                            schemaDocuments.push(Documents.HistogramDocument(histoOp, { width: 200, height: 200, title: attr.displayName! }, undefined, attr.displayName! + ".alias"));
                        }
                    }));
                });
                return schemaDoc;
            })
        }
    }
    async initializeNorthstar(): Promise<void> {
        let envPath = "/assets/env.json";
        const response = await fetch(envPath, {
            redirect: "follow",
            method: "GET",
            credentials: "include"
        });
        const env = await response.json();
        Settings.Instance.Update(env);
        let cat = Gateway.Instance.ClearCatalog();
        cat.then(async () => this.SetNorthstarCatalog(await Gateway.Instance.GetCatalog()));
    }
}

Documents.initProtos().then(() => {
    return CurrentUserUtils.loadCurrentUser()
}).then(() => {
    ReactDOM.render(<Main />, document.getElementById('root'));
});
