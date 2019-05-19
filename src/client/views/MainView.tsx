import { IconName, library } from '@fortawesome/fontawesome-svg-core';
import { faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faPenNib, faRedoAlt, faTable, faTree, faUndoAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, runInAction, trace } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import Measure from 'react-measure';
import * as request from 'request';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { RouteStore } from '../../server/RouteStore';
import { emptyFunction, returnTrue, Utils, returnOne, returnZero } from '../../Utils';
import { Docs } from '../documents/Documents';
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
import { HistoryUtil } from '../util/History';
import { CollectionBaseView } from './collections/CollectionBaseView';


@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    @observable private _workspacesShown: boolean = false;
    @observable public pwidth: number = 0;
    @observable public pheight: number = 0;

    @computed private get mainContainer(): Opt<Doc> {
        return FieldValue(Cast(CurrentUserUtils.UserDocument.activeWorkspace, Doc));
    }
    private set mainContainer(doc: Opt<Doc>) {
        if (doc) {
            if (!("presentationView" in doc)) {
                doc.presentationView = new Doc();
            }
            CurrentUserUtils.UserDocument.activeWorkspace = doc;
        }
    }

    constructor(props: Readonly<{}>) {
        super(props);
        MainView.Instance = this;
        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });
        if (window.location.search.includes("readonly")) {
            DocServer.makeReadOnly();
        }
        if (window.location.search.includes("safe")) {
            if (!window.location.search.includes("nro")) {
                DocServer.makeReadOnly();
            }
            CollectionBaseView.SetSafeMode(true);
        }
        if (window.location.pathname !== RouteStore.home) {
            let pathname = window.location.pathname.substr(1).split("/");
            if (pathname.length > 1) {
                let type = pathname[0];
                if (type === "doc") {
                    CurrentUserUtils.MainDocId = pathname[1];
                }
            }
        }

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
            let mainDoc = Docs.DockDocument([CurrentUserUtils.UserDocument, freeformDoc], JSON.stringify(dockingLayout), { title: `Workspace ${list.length + 1}` }, id);
            list.push(mainDoc);
            // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
            setTimeout(() => {
                this.openWorkspace(mainDoc);
                let pendingDocument = Docs.SchemaDocument(["title"], [], { title: "New Mobile Uploads" });
                mainDoc.optionalRightCollection = pendingDocument;
            }, 0);
        }
    }

    @action
    openWorkspace = async (doc: Doc, fromHistory = false) => {
        CurrentUserUtils.MainDocId = doc[Id];
        this.mainContainer = doc;
        fromHistory || HistoryUtil.pushState({ type: "doc", docId: doc[Id], initializers: {} });
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
    @action
    onResize = (r: any) => {
        this.pwidth = r.offset.width;
        this.pheight = r.offset.height;
    }
    getPWidth = () => {
        return this.pwidth;
    }
    getPHeight = () => {
        return this.pheight;
    }
    @computed
    get mainContent() {
        let mainCont = this.mainContainer;
        let content = !mainCont ? (null) :
            <DocumentView Document={mainCont}
                toggleMinimized={emptyFunction}
                addDocument={undefined}
                addDocTab={emptyFunction}
                removeDocument={undefined}
                ScreenToLocalTransform={Transform.Identity}
                ContentScaling={returnOne}
                PanelWidth={this.getPWidth}
                PanelHeight={this.getPHeight}
                isTopMost={true}
                selectOnLoad={false}
                focus={emptyFunction}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                ContainingCollectionView={undefined} />;
        const pres = mainCont ? FieldValue(Cast(mainCont.presentationView, Doc)) : undefined;
        return <Measure offset onResize={this.onResize}>
            {({ measureRef }) =>
                <div ref={measureRef} id="mainContent-div">
                    {content}
                    {pres ? <PresentationView Document={pres} key="presentation" /> : null}
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
        let addSchemaNode = action(() => Docs.SchemaDocument(["title"], [], { width: 200, height: 200, title: "a schema collection" }));
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
            <button className="clear-db-button" key="clear-db" onClick={e => e.shiftKey && e.altKey && DocServer.DeleteDatabase()}>Clear Database</button>,
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
}
