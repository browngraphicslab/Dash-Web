import { IconName, library } from '@fortawesome/fontawesome-svg-core';
import { faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faPenNib, faRedoAlt, faTable, faTree, faUndoAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Measure from 'react-measure';
import * as request from 'request';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { RouteStore } from '../../server/RouteStore';
import { emptyFunction, returnTrue, Utils, returnOne, returnZero } from '../../Utils';
import { Docs } from '../documents/Documents';
import { ColumnAttributeModel } from '../northstar/core/attribute/AttributeModel';
import { AttributeTransformationModel } from '../northstar/core/attribute/AttributeTransformationModel';
import { Gateway, NorthstarSettings } from '../northstar/manager/Gateway';
import { AggregateFunction, Catalog } from '../northstar/model/idea/idea';
import '../northstar/model/ModelExtensions';
import { HistogramOperation } from '../northstar/operations/HistogramOperation';
import '../northstar/utils/Extensions';
import { SetupDrag, DragManager } from '../util/DragManager';
import { Transform } from '../util/Transform';
import { UndoManager } from '../util/UndoManager';
import { PresentationView } from './PresentationView';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { ContextMenu } from './ContextMenu';
import { DocumentDecorations } from './DocumentDecorations';
import { InkingControl } from './InkingControl';
import "./Main.scss";
import { MainOverlayTextBox } from './MainOverlayTextBox';
import { DocumentView } from './nodes/DocumentView';
import { PreviewCursor } from './PreviewCursor';
import { SearchBox } from './SearchBox';
import { SelectionManager } from '../util/SelectionManager';
import { FieldResult, Field, Doc, Opt } from '../../new_fields/Doc';
import { Cast, FieldValue, StrCast } from '../../new_fields/Types';
import { DocServer } from '../DocServer';
import { listSpec } from '../../new_fields/Schema';
import { Id } from '../../new_fields/RefField';

@observer
export class Main extends React.Component {
    public static Instance: Main;
    @observable private _workspacesShown: boolean = false;
    @observable public pwidth: number = 0;
    @observable public pheight: number = 0;

    @computed private get mainContainer(): Opt<Doc> {
        return FieldValue(Cast(CurrentUserUtils.UserDocument.activeWorkspace, Doc));
    }
    private set mainContainer(doc: Opt<Doc>) {
        if (doc) {
            CurrentUserUtils.UserDocument.activeWorkspace = doc;
        }
    }

    constructor(props: Readonly<{}>) {
        super(props);
        Main.Instance = this;
        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });
        if (window.location.pathname !== RouteStore.home) {
            let pathname = window.location.pathname.split("/");
            if (pathname.length > 1 && pathname[pathname.length - 2] === 'doc') {
                CurrentUserUtils.MainDocId = pathname[pathname.length - 1];
            }
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
        library.add(faTree);

        this.initEventListeners();
        this.initAuthenticationRouters();

        // try {
        //     this.initializeNorthstar();
        // } catch (e) {

        // }
    }

    componentDidMount() { window.onpopstate = this.onHistory; }

    componentWillUnmount() { window.onpopstate = null; }

    onHistory = () => {
        if (window.location.pathname !== RouteStore.home) {
            let pathname = window.location.pathname.split("/");
            DocServer.GetRefField(pathname[pathname.length - 1]).then(action((field: Opt<Field>) => {
                if (field instanceof Doc) {
                    this.openWorkspace(field, true);
                }
            }));
        }
    }

    initEventListeners = () => {
        // window.addEventListener("pointermove", (e) => this.reportLocation(e))
        window.addEventListener("drop", (e) => e.preventDefault(), false); // drop event handler
        window.addEventListener("dragover", (e) => e.preventDefault(), false); // drag event handler
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                DragManager.AbortDrag();
                SelectionManager.DeselectAll();
            }
        }, false); // drag event handler
        // click interactions for the context menu
        document.addEventListener("pointerdown", action(function (e: PointerEvent) {
            if (!ContextMenu.Instance.intersects(e.pageX, e.pageY)) {
                ContextMenu.Instance.clearItems();
            }
        }), true);
    }

    initAuthenticationRouters = async () => {
        // Load the user's active workspace, or create a new one if initial session after signup
        if (!CurrentUserUtils.MainDocId) {
            const doc = await Cast(CurrentUserUtils.UserDocument.activeWorkspace, Doc);
            if (doc) {
                this.openWorkspace(doc);
            } else {
                this.createNewWorkspace();
            }
        } else {
            DocServer.GetRefField(CurrentUserUtils.MainDocId).then(field =>
                field instanceof Doc ? this.openWorkspace(field) :
                    this.createNewWorkspace(CurrentUserUtils.MainDocId));
        }
    }

    @action
    createNewWorkspace = async (id?: string) => {
        const list = Cast(CurrentUserUtils.UserDocument.data, listSpec(Doc));
        if (list) {
            let freeformDoc = Docs.FreeformDocument([], { x: 0, y: 400, title: `WS collection ${list.length + 1}` });
            var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(CurrentUserUtils.UserDocument, 150), CollectionDockingView.makeDocumentConfig(freeformDoc, 600)] }] };
            let mainDoc = Docs.DockDocument([CurrentUserUtils.UserDocument, freeformDoc], JSON.stringify(dockingLayout), { title: `Workspace ${list.length + 1}` });
            list.push(mainDoc);
            // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
            setTimeout(() => {
                this.openWorkspace(mainDoc);
                let pendingDocument = Docs.SchemaDocument([], { title: "New Mobile Uploads" });
                mainDoc.optionalRightCollection = pendingDocument;
            }, 0);
        }
    }

    @action
    openWorkspace = async (doc: Doc, fromHistory = false) => {
        CurrentUserUtils.MainDocId = doc[Id];
        this.mainContainer = doc;
        fromHistory || window.history.pushState(null, StrCast(doc.title), "/doc/" + doc[Id]);
        const col = await Cast(CurrentUserUtils.UserDocument.optionalRightCollection, Doc);
        // if there is a pending doc, and it has new data, show it (syip: we use a timeout to prevent collection docking view from being uninitialized)
        setTimeout(async () => {
            if (col) {
                const l = Cast(col.data, listSpec(Doc));
                if (l && l.length > 0) {
                    CollectionDockingView.Instance.AddRightSplit(col);
                }
            }
        }, 100);
    }
    @computed
    get mainContent() {
        let pwidthFunc = () => this.pwidth;
        let pheightFunc = () => this.pheight;
        let noScaling = () => 1;
        let mainCont = this.mainContainer;
        return <Measure onResize={action((r: any) => { this.pwidth = r.entry.width; this.pheight = r.entry.height; })}>
            {({ measureRef }) =>
                <div ref={measureRef} id="mainContent-div">
                    {!mainCont ? (null) :
                        <DocumentView Document={mainCont}
                            toggleMinimized={emptyFunction}
                            addDocument={undefined}
                            removeDocument={undefined}
                            ScreenToLocalTransform={Transform.Identity}
                            ContentScaling={noScaling}
                            PanelWidth={pwidthFunc}
                            PanelHeight={pheightFunc}
                            isTopMost={true}
                            selectOnLoad={false}
                            focus={emptyFunction}
                            parentActive={returnTrue}
                            whenActiveChanged={emptyFunction}
                            bringToFront={emptyFunction}
                            ContainingCollectionView={undefined} />}
                    <PresentationView key="presentation" />
                </div>
            }
        </Measure>;
    }

    /* for the expandable add nodes menu. Not included with the miscbuttons because once it expands it expands the whole div with it, making canvas interactions limited. */
    nodesMenu() {

        let imgurl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg";
        let pdfurl = "http://www.adobe.com/support/products/enterprise/knowledgecenter/media/c27211_sample_explain.pdf";
        let weburl = "https://cs.brown.edu/courses/cs166/";
        let audiourl = "http://techslides.com/demos/samples/sample.mp3";
        let videourl = "http://techslides.com/demos/sample-videos/small.mp4";

        let addTextNode = action(() => Docs.TextDocument({ borderRounding: -1, width: 200, height: 200, title: "a text note" }));
        let addColNode = action(() => Docs.FreeformDocument([], { width: 200, height: 200, title: "a freeform collection" }));
        let addSchemaNode = action(() => Docs.SchemaDocument([], { width: 200, height: 200, title: "a schema collection" }));
        let addTreeNode = action(() => Docs.TreeDocument([CurrentUserUtils.UserDocument], { width: 250, height: 400, title: "Library:" + CurrentUserUtils.email, dropAction: "alias" }));
        // let addTreeNode = action(() => Docs.TreeDocument(this._northstarSchemas, { width: 250, height: 400, title: "northstar schemas", dropAction: "copy"  }));
        let addVideoNode = action(() => Docs.VideoDocument(videourl, { width: 200, title: "video node" }));
        let addPDFNode = action(() => Docs.PdfDocument(pdfurl, { width: 200, height: 200, title: "a pdf doc" }));
        let addImageNode = action(() => Docs.ImageDocument(imgurl, { width: 200, title: "an image of a cat" }));
        let addWebNode = action(() => Docs.WebDocument(weburl, { width: 200, height: 200, title: "a sample web page" }));
        let addAudioNode = action(() => Docs.AudioDocument(audiourl, { width: 200, height: 200, title: "audio node" }));

        let btns: [React.RefObject<HTMLDivElement>, IconName, string, () => Doc][] = [
            [React.createRef<HTMLDivElement>(), "font", "Add Textbox", addTextNode],
            [React.createRef<HTMLDivElement>(), "image", "Add Image", addImageNode],
            [React.createRef<HTMLDivElement>(), "file-pdf", "Add PDF", addPDFNode],
            [React.createRef<HTMLDivElement>(), "film", "Add Video", addVideoNode],
            [React.createRef<HTMLDivElement>(), "music", "Add Audio", addAudioNode],
            [React.createRef<HTMLDivElement>(), "globe-asia", "Add Web Clipping", addWebNode],
            [React.createRef<HTMLDivElement>(), "object-group", "Add Collection", addColNode],
            [React.createRef<HTMLDivElement>(), "tree", "Add Tree", addTreeNode],
            [React.createRef<HTMLDivElement>(), "table", "Add Schema", addSchemaNode],
        ];

        return < div id="add-nodes-menu" >
            <input type="checkbox" id="add-menu-toggle" />
            <label htmlFor="add-menu-toggle" title="Add Node"><p>+</p></label>

            <div id="add-options-content">
                <ul id="add-options-list">
                    {btns.map(btn =>
                        <li key={btn[1]} ><div ref={btn[0]}>
                            <button className="round-button add-button" title={btn[2]} onPointerDown={SetupDrag(btn[0], btn[3])}>
                                <FontAwesomeIcon icon={btn[1]} size="sm" />
                            </button>
                        </div></li>)}
                </ul>
            </div>
        </div >;
    }

    /* @TODO this should really be moved into a moveable toolbar component, but for now let's put it here to meet the deadline */
    @computed
    get miscButtons() {
        let logoutRef = React.createRef<HTMLDivElement>();

        return [
            <button className="clear-db-button" key="clear-db" onClick={DocServer.DeleteDatabase}>Clear Database</button>,
            <div id="toolbar" key="toolbar">
                <button className="toolbar-button round-button" title="Undo" onClick={() => UndoManager.Undo()}><FontAwesomeIcon icon="undo-alt" size="sm" /></button>
                <button className="toolbar-button round-button" title="Redo" onClick={() => UndoManager.Redo()}><FontAwesomeIcon icon="redo-alt" size="sm" /></button>
                <button className="toolbar-button round-button" title="Ink" onClick={() => InkingControl.Instance.toggleDisplay()}><FontAwesomeIcon icon="pen-nib" size="sm" /></button>
            </div >,
            <div className="main-searchDiv" key="search" style={{ top: '34px', right: '1px', position: 'absolute' }} > <SearchBox /> </div>,
            <div className="main-buttonDiv" key="logout" style={{ bottom: '0px', right: '1px', position: 'absolute' }} ref={logoutRef}>
                <button onClick={() => request.get(DocServer.prepend(RouteStore.logout), emptyFunction)}>Log Out</button></div>
        ];

    }

    render() {
        return (
            <div id="main-div">
                <DocumentDecorations />
                {this.mainContent}
                <PreviewCursor />
                <ContextMenu />
                {this.nodesMenu()}
                {this.miscButtons}
                <InkingControl />
                <MainOverlayTextBox />
            </div>
        );
    }

    // --------------- Northstar hooks ------------- /
    private _northstarSchemas: Doc[] = [];

    @action SetNorthstarCatalog(ctlog: Catalog) {
        CurrentUserUtils.NorthstarDBCatalog = ctlog;
        if (ctlog && ctlog.schemas) {
            ctlog.schemas.map(schema => {
                let schemaDocuments: Doc[] = [];
                let attributesToBecomeDocs = CurrentUserUtils.GetAllNorthstarColumnAttributes(schema);
                Promise.all(attributesToBecomeDocs.reduce((promises, attr) => {
                    promises.push(DocServer.GetRefField(attr.displayName! + ".alias").then(action((field: Opt<Field>) => {
                        if (field instanceof Doc) {
                            schemaDocuments.push(field);
                        } else {
                            var atmod = new ColumnAttributeModel(attr);
                            let histoOp = new HistogramOperation(schema.displayName!,
                                new AttributeTransformationModel(atmod, AggregateFunction.None),
                                new AttributeTransformationModel(atmod, AggregateFunction.Count),
                                new AttributeTransformationModel(atmod, AggregateFunction.Count));
                            schemaDocuments.push(Docs.HistogramDocument(histoOp, { width: 200, height: 200, title: attr.displayName! }));
                        }
                    })));
                    return promises;
                }, [] as Promise<void>[])).finally(() =>
                    this._northstarSchemas.push(Docs.TreeDocument(schemaDocuments, { width: 50, height: 100, title: schema.displayName! })));
            });
        }
    }
    async initializeNorthstar(): Promise<void> {
        const getEnvironment = await fetch("/assets/env.json", { redirect: "follow", method: "GET", credentials: "include" });
        NorthstarSettings.Instance.UpdateEnvironment(await getEnvironment.json());
        Gateway.Instance.ClearCatalog().then(async () => this.SetNorthstarCatalog(await Gateway.Instance.GetCatalog()));
    }
}

(async () => {
    await Docs.initProtos();
    await CurrentUserUtils.loadCurrentUser();
    ReactDOM.render(<Main />, document.getElementById('root'));
})();
