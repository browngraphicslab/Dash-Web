import { IconName, library } from '@fortawesome/fontawesome-svg-core';
import { faArrowDown, faArrowUp, faCheck, faCommentAlt, faCut, faExclamation, faFilePdf, faFilm, faFont, faGlobeAsia, faImage, faMusic, faObjectGroup, faPenNib, faRedoAlt, faTable, faThumbtack, faTree, faUndoAlt } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, runInAction, reaction, trace } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { SketchPicker } from 'react-color';
import Measure from 'react-measure';
import * as request from 'request';
import { Doc, DocListCast, Opt, HeightSym } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { InkTool } from '../../new_fields/InkField';
import { List } from '../../new_fields/List';
import { listSpec } from '../../new_fields/Schema';
import { Cast, FieldValue, NumCast } from '../../new_fields/Types';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { RouteStore } from '../../server/RouteStore';
import { emptyFunction, returnOne, returnTrue } from '../../Utils';
import { DocServer } from '../DocServer';
import { Docs } from '../documents/Documents';
import { SetupDrag } from '../util/DragManager';
import { HistoryUtil } from '../util/History';
import { Transform } from '../util/Transform';
import { UndoManager } from '../util/UndoManager';
import { CollectionBaseView } from './collections/CollectionBaseView';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { ContextMenu } from './ContextMenu';
import { DocumentDecorations } from './DocumentDecorations';
import KeyManager from './GlobalKeyHandler';
import { InkingControl } from './InkingControl';
import "./Main.scss";
import { MainOverlayTextBox } from './MainOverlayTextBox';
import { DocumentView } from './nodes/DocumentView';
import { OverlayView } from './OverlayView';
import PDFMenu from './pdf/PDFMenu';
import { PresentationView } from './presentationview/PresentationView';
import { PreviewCursor } from './PreviewCursor';
import { FilterBox } from './search/FilterBox';
import { CollectionTreeView } from './collections/CollectionTreeView';

@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    @observable addMenuToggle = React.createRef<HTMLInputElement>();
    @observable private _workspacesShown: boolean = false;
    @observable public pwidth: number = 0;
    @observable public pheight: number = 0;
    @computed private get mainContainer(): Opt<Doc> {
        return FieldValue(Cast(CurrentUserUtils.UserDocument.activeWorkspace, Doc));
    }
    @computed get mainFreeform(): Opt<Doc> {
        let docs = DocListCast(this.mainContainer!.data);
        return (docs && docs.length > 1) ? docs[1] : undefined;
    }
    public isPointerDown = false;
    private set mainContainer(doc: Opt<Doc>) {
        if (doc) {
            if (!("presentationView" in doc)) {
                doc.presentationView = new List<Doc>([Docs.TreeDocument([], { title: "Presentation" })]);
            }
            CurrentUserUtils.UserDocument.activeWorkspace = doc;
        }
    }

    componentWillMount() {
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.addEventListener("keydown", KeyManager.Instance.handle);

        reaction(() => {
            let workspaces = CurrentUserUtils.UserDocument.workspaces;
            let recent = CurrentUserUtils.UserDocument.recentlyClosed;
            if (!(recent instanceof Doc)) return 0;
            if (!(workspaces instanceof Doc)) return 0;
            let workspacesDoc = workspaces;
            let recentDoc = recent;
            let libraryHeight = this.getPHeight() - workspacesDoc[HeightSym]() - recentDoc[HeightSym]() - 20 + CurrentUserUtils.UserDocument[HeightSym]() * 0.00001;
            return libraryHeight;
        }, (libraryHeight: number) => {
            if (libraryHeight && Math.abs(CurrentUserUtils.UserDocument[HeightSym]() - libraryHeight) > 5) {
                CurrentUserUtils.UserDocument.height = libraryHeight;
            }
            (Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc) as Doc).allowClear = true;
        }, { fireImmediately: true });
    }

    componentWillUnMount() {
        window.removeEventListener("keydown", KeyManager.Instance.handle);
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
        library.add(faExclamation);
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
        library.add(faCut);
        library.add(faCommentAlt);
        library.add(faThumbtack);
        library.add(faCheck);
        library.add(faArrowDown);
        library.add(faArrowUp);
        this.initEventListeners();
        this.initAuthenticationRouters();
    }

    initEventListeners = () => {
        // window.addEventListener("pointermove", (e) => this.reportLocation(e))
        window.addEventListener("drop", (e) => e.preventDefault(), false); // drop event handler
        window.addEventListener("dragover", (e) => e.preventDefault(), false); // drag event handler
        // click interactions for the context menu
        document.addEventListener("pointerdown", action((e: PointerEvent) => {
            this.isPointerDown = true;
            const targets = document.elementsFromPoint(e.x, e.y);
            if (targets && targets.length && targets[0].className.toString().indexOf("contextMenu") === -1) {
                ContextMenu.Instance.closeMenu();
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
        let workspaces = Cast(CurrentUserUtils.UserDocument.workspaces, Doc);
        if (!(workspaces instanceof Doc)) return;
        const list = Cast((CurrentUserUtils.UserDocument.workspaces as Doc).data, listSpec(Doc));
        if (list) {
            let freeformDoc = Docs.FreeformDocument([], { x: 0, y: 400, width: this.pwidth * .7, height: this.pheight, title: `WS collection ${list.length + 1}` });
            var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(freeformDoc, freeformDoc, 600)] }] };
            let mainDoc = Docs.DockDocument([CurrentUserUtils.UserDocument, freeformDoc], JSON.stringify(dockingLayout), { title: `Workspace ${list.length + 1}` }, id);
            if (!CurrentUserUtils.UserDocument.linkManagerDoc) {
                let linkManagerDoc = new Doc();
                linkManagerDoc.allLinks = new List<Doc>([]);
                CurrentUserUtils.UserDocument.linkManagerDoc = linkManagerDoc;
            }
            list.push(mainDoc);
            // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
            setTimeout(() => {
                this.openWorkspace(mainDoc);
                // let pendingDocument = Docs.StackingDocument([], { title: "New Mobile Uploads" });
                // mainDoc.optionalRightCollection = pendingDocument;
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
                if (l) {
                    runInAction(() => CollectionTreeView.NotifsCol = col);
                }
            }
        }, 100);
    }

    onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Drop");
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

    @observable flyoutWidth: number = 250;
    @computed get dockingContent() {
        let flyoutWidth = this.flyoutWidth;
        let mainCont = this.mainContainer;
        let castRes = mainCont ? FieldValue(Cast(mainCont.presentationView, listSpec(Doc))) : undefined;
        return <Measure offset onResize={this.onResize}>
            {({ measureRef }) =>
                <div ref={measureRef} id="mainContent-div" style={{ width: `calc(100% - ${flyoutWidth}px`, transform: `translate(${flyoutWidth}px, 0px)` }} onDrop={this.onDrop}>
                    {!mainCont ? (null) :
                        <DocumentView Document={mainCont}
                            DataDoc={undefined}
                            addDocument={undefined}
                            addDocTab={emptyFunction}
                            removeDocument={undefined}
                            ScreenToLocalTransform={Transform.Identity}
                            ContentScaling={returnOne}
                            PanelWidth={this.getPWidth}
                            PanelHeight={this.getPHeight}
                            renderDepth={0}
                            selectOnLoad={false}
                            focus={emptyFunction}
                            parentActive={returnTrue}
                            whenActiveChanged={emptyFunction}
                            bringToFront={emptyFunction}
                            ContainingCollectionView={undefined}
                            zoomToScale={emptyFunction}
                            getScale={returnOne}
                        />}
                    {castRes ? <PresentationView Documents={castRes} key="presentation" /> : null}
                </div>
            }
        </Measure>;
    }

    _downsize = 0;
    onPointerDown = (e: React.PointerEvent) => {
        this._downsize = e.clientX;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
        e.stopPropagation();
        e.preventDefault();
    }
    @action
    onPointerMove = (e: PointerEvent) => {
        this.flyoutWidth = Math.max(e.clientX, 0);
    }
    @action
    onPointerUp = (e: PointerEvent) => {
        this.isPointerDown = false;
        if (Math.abs(e.clientX - this._downsize) < 4) {
            if (this.flyoutWidth < 5) this.flyoutWidth = 250;
            else this.flyoutWidth = 0;
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }
    flyoutWidthFunc = () => this.flyoutWidth;
    addDocTabFunc = (doc: Doc) => {
        if (doc.dockingConfig) {
            this.openWorkspace(doc);
        } else {
            CollectionDockingView.Instance.AddRightSplit(doc, undefined);
        }
    }
    @computed
    get flyout() {
        let sidebar = CurrentUserUtils.UserDocument.sidebar;
        if (!(sidebar instanceof Doc)) return (null);
        let sidebarDoc = sidebar;
        return <DocumentView
            Document={sidebarDoc}
            DataDoc={undefined}
            addDocument={undefined}
            addDocTab={this.addDocTabFunc}
            removeDocument={undefined}
            ScreenToLocalTransform={Transform.Identity}
            ContentScaling={returnOne}
            PanelWidth={this.flyoutWidthFunc}
            PanelHeight={this.getPHeight}
            renderDepth={0}
            selectOnLoad={false}
            focus={emptyFunction}
            parentActive={returnTrue}
            whenActiveChanged={emptyFunction}
            bringToFront={emptyFunction}
            ContainingCollectionView={undefined}
            zoomToScale={emptyFunction}
            getScale={returnOne}>
        </DocumentView>;
    }
    @computed
    get mainContent() {
        return <div>
            <div className="mainView-libraryHandle"
                style={{ left: `${this.flyoutWidth - 10}px` }}
                onPointerDown={this.onPointerDown}>
                <span title="library View Dragger" style={{ width: "100%", height: "100%", position: "absolute" }} />
            </div>
            <div className="mainView-libraryFlyout" style={{ width: `${this.flyoutWidth}px` }}>
                {this.flyout}
            </div>
            {this.dockingContent}
        </div>;
    }

    selected = (tool: InkTool) => {
        if (!InkingControl.Instance || InkingControl.Instance.selectedTool === InkTool.None) return { display: "none" };
        if (InkingControl.Instance.selectedTool === tool) {
            return { color: "#61aaa3", fontSize: "50%" };
        }
        return { fontSize: "50%" };
    }

    onColorClick = (e: React.MouseEvent) => {
        let target = (e.nativeEvent as any).path[0];
        let parent = (e.nativeEvent as any).path[1];
        if (target.localName === "input" || parent.localName === "span") {
            e.stopPropagation();
        }
    }


    @observable private _colorPickerDisplay = false;
    /* for the expandable add nodes menu. Not included with the miscbuttons because once it expands it expands the whole div with it, making canvas interactions limited. */
    nodesMenu() {

        let imgurl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg";

        let addColNode = action(() => Docs.FreeformDocument([], { width: this.pwidth * .7, height: this.pheight, title: "a freeform collection" }));
        let addTreeNode = action(() => CurrentUserUtils.UserDocument);
        let addImageNode = action(() => Docs.ImageDocument(imgurl, { width: 200, title: "an image of a cat" }));
        let addImportCollectionNode = action(() => Docs.DirectoryImportDocument({ title: "Directory Import", width: 400, height: 400 }));

        let btns: [React.RefObject<HTMLDivElement>, IconName, string, () => Doc][] = [
            [React.createRef<HTMLDivElement>(), "image", "Add Image", addImageNode],
            [React.createRef<HTMLDivElement>(), "object-group", "Add Collection", addColNode],
            [React.createRef<HTMLDivElement>(), "tree", "Add Tree", addTreeNode],
            [React.createRef<HTMLDivElement>(), "arrow-up", "Import Directory", addImportCollectionNode],
        ];

        return < div id="add-nodes-menu" style={{ left: this.flyoutWidth + 5 }} >
            <input type="checkbox" id="add-menu-toggle" ref={this.addMenuToggle} />
            <label htmlFor="add-menu-toggle" title="Add Node"><p>+</p></label>

            <div id="add-options-content">
                <ul id="add-options-list">
                    <li key="search"><button className="add-button round-button" title="Search" onClick={this.toggleSearch}><FontAwesomeIcon icon="search" size="sm" /></button></li>
                    <li key="undo"><button className="add-button round-button" title="Undo" onClick={() => UndoManager.Undo()}><FontAwesomeIcon icon="undo-alt" size="sm" /></button></li>
                    <li key="redo"><button className="add-button round-button" title="Redo" onClick={() => UndoManager.Redo()}><FontAwesomeIcon icon="redo-alt" size="sm" /></button></li>
                    <li key="color"><button className="add-button round-button" title="Select Color" onClick={() => this.toggleColorPicker()}><div className="toolbar-color-button" style={{ backgroundColor: InkingControl.Instance.selectedColor }} >
                        <div className="toolbar-color-picker" onClick={this.onColorClick} style={this._colorPickerDisplay ? { color: "black", display: "block" } : { color: "black", display: "none" }}>
                            <SketchPicker color={InkingControl.Instance.selectedColor} onChange={InkingControl.Instance.switchColor} />
                        </div>
                    </div></button></li>
                    {btns.map(btn =>
                        <li key={btn[1]} ><div ref={btn[0]}>
                            <button className="round-button add-button" title={btn[2]} onPointerDown={SetupDrag(btn[0], btn[3])}>
                                <FontAwesomeIcon icon={btn[1]} size="sm" />
                            </button>
                        </div></li>)}
                    <li key="undoTest"><button className="add-button round-button" onClick={() => UndoManager.PrintBatches()}><FontAwesomeIcon icon="exclamation" size="sm" /></button></li>
                    <li key="ink" style={{ paddingRight: "6px" }}><button className="toolbar-button round-button" title="Ink" onClick={() => InkingControl.Instance.toggleDisplay()}><FontAwesomeIcon icon="pen-nib" size="sm" /> </button></li>
                    <li key="pen"><button onClick={() => InkingControl.Instance.switchTool(InkTool.Pen)} style={this.selected(InkTool.Pen)}><FontAwesomeIcon icon="pen" size="lg" title="Pen" /></button></li>
                    <li key="marker"><button onClick={() => InkingControl.Instance.switchTool(InkTool.Highlighter)} style={this.selected(InkTool.Highlighter)}><FontAwesomeIcon icon="highlighter" size="lg" title="Pen" /></button></li>
                    <li key="eraser"><button onClick={() => InkingControl.Instance.switchTool(InkTool.Eraser)} style={this.selected(InkTool.Eraser)}><FontAwesomeIcon icon="eraser" size="lg" title="Pen" /></button></li>
                    <li key="inkControls"><InkingControl /></li>
                </ul>
            </div>
        </div >;
    }



    @action
    toggleColorPicker = (close = false) => {
        this._colorPickerDisplay = close ? false : !this._colorPickerDisplay;
    }

    /* @TODO this should really be moved into a moveable toolbar component, but for now let's put it here to meet the deadline */
    @computed
    get miscButtons() {
        let logoutRef = React.createRef<HTMLDivElement>();

        return [
            this.isSearchVisible ? <div className="main-searchDiv" key="search" style={{ top: '34px', right: '1px', position: 'absolute' }} > <FilterBox /> </div> : null,
            <div className="main-buttonDiv" key="logout" style={{ bottom: '0px', right: '1px', position: 'absolute' }} ref={logoutRef}>
                <button onClick={() => request.get(DocServer.prepend(RouteStore.logout), emptyFunction)}>Log Out</button></div>
        ];

    }

    @observable isSearchVisible = false;
    @action
    toggleSearch = () => {
        this.isSearchVisible = !this.isSearchVisible;
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
                <PDFMenu />
                <MainOverlayTextBox />
                <OverlayView />
            </div>
        );
    }
}
