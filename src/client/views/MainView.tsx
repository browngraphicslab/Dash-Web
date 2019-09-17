import { IconName, library } from '@fortawesome/fontawesome-svg-core';
import { faLink, faArrowDown, faArrowUp, faBolt, faCaretUp, faCat, faCheck, faClone, faCloudUploadAlt, faCommentAlt, faCut, faExclamation, faFilePdf, faFilm, faFont, faGlobeAsia, faLongArrowAltRight, faMusic, faObjectGroup, faPause, faPenNib, faPlay, faPortrait, faRedoAlt, faThumbtack, faTree, faUndoAlt, faTv } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import { SketchPicker } from 'react-color';
import Measure from 'react-measure';
import { Doc, DocListCast, Opt, HeightSym } from '../../new_fields/Doc';
import { List } from '../../new_fields/List';
import { Id } from '../../new_fields/FieldSymbols';
import { InkTool } from '../../new_fields/InkField';
import { listSpec } from '../../new_fields/Schema';
import { BoolCast, Cast, FieldValue, StrCast, NumCast } from '../../new_fields/Types';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { RouteStore } from '../../server/RouteStore';
import { emptyFunction, returnOne, returnTrue, Utils, returnEmptyString } from '../../Utils';
import { DocServer } from '../DocServer';
import { Docs } from '../documents/Documents';
import { ClientUtils } from '../util/ClientUtils';
import { DictationManager } from '../util/DictationManager';
import { SetupDrag } from '../util/DragManager';
import { HistoryUtil } from '../util/History';
import { Transform } from '../util/Transform';
import { UndoManager, undoBatch } from '../util/UndoManager';
import { CollectionBaseView } from './collections/CollectionBaseView';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { CollectionTreeView } from './collections/CollectionTreeView';
import { ContextMenu } from './ContextMenu';
import { DocumentDecorations } from './DocumentDecorations';
import KeyManager from './GlobalKeyHandler';
import { InkingControl } from './InkingControl';
import "./Main.scss";
import { MainOverlayTextBox } from './MainOverlayTextBox';
import { DocumentView } from './nodes/DocumentView';
import { OverlayView } from './OverlayView';
import PDFMenu from './pdf/PDFMenu';
import { PreviewCursor } from './PreviewCursor';
import { FilterBox } from './search/FilterBox';
import { TimelineMenu } from './animationtimeline/TimelineMenu';
import PresModeMenu from './presentationview/PresentationModeMenu';
import { PresBox } from './nodes/PresBox';
import { LinkFollowBox } from './linking/LinkFollowBox';
import { DocumentManager } from '../util/DocumentManager';

@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    @observable addMenuToggle = React.createRef<HTMLInputElement>();
    @observable public pwidth: number = 0;
    @observable public pheight: number = 0;

    @observable private dictationState = DictationManager.placeholder;
    @observable private dictationSuccessState: boolean | undefined = undefined;
    @observable private dictationDisplayState = false;
    @observable private dictationListeningState: DictationManager.Controls.ListeningUIStatus = false;

    public overlayTimeout: NodeJS.Timeout | undefined;

    public initiateDictationFade = () => {
        let duration = DictationManager.Commands.dictationFadeDuration;
        this.overlayTimeout = setTimeout(() => {
            this.dictationOverlayVisible = false;
            this.dictationSuccess = undefined;
            setTimeout(() => this.dictatedPhrase = DictationManager.placeholder, 500);
        }, duration);
    }

    public cancelDictationFade = () => {
        if (this.overlayTimeout) {
            clearTimeout(this.overlayTimeout);
            this.overlayTimeout = undefined;
        }
    }

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
            CurrentUserUtils.UserDocument.activeWorkspace = doc;
        }
    }

    @computed public get dictatedPhrase() {
        return this.dictationState;
    }

    public set dictatedPhrase(value: string) {
        runInAction(() => this.dictationState = value);
    }

    @computed public get dictationSuccess() {
        return this.dictationSuccessState;
    }

    public set dictationSuccess(value: boolean | undefined) {
        runInAction(() => this.dictationSuccessState = value);
    }

    @computed public get dictationOverlayVisible() {
        return this.dictationDisplayState;
    }

    public set dictationOverlayVisible(value: boolean) {
        runInAction(() => this.dictationDisplayState = value);
    }

    @computed public get isListening() {
        return this.dictationListeningState;
    }

    public set isListening(value: DictationManager.Controls.ListeningUIStatus) {
        runInAction(() => this.dictationListeningState = value);
    }

    componentWillMount() {
        var tag = document.createElement('script');

        tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode!.insertBefore(tag, firstScriptTag);
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
        //close presentation 
        window.removeEventListener("pointerdown", this.globalPointerDown);
        window.removeEventListener("pointerup", this.globalPointerUp);
    }

    constructor(props: Readonly<{}>) {
        super(props);
        MainView.Instance = this;

        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });
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
        library.add(faPortrait);
        library.add(faCat);
        library.add(faFilePdf);
        library.add(faObjectGroup);
        library.add(faTv);
        library.add(faGlobeAsia);
        library.add(faUndoAlt);
        library.add(faRedoAlt);
        library.add(faPenNib);
        library.add(faFilm);
        library.add(faMusic);
        library.add(faTree);
        library.add(faPlay);
        library.add(faPause);
        library.add(faClone);
        library.add(faCut);
        library.add(faCommentAlt);
        library.add(faThumbtack);
        library.add(faLongArrowAltRight);
        library.add(faCheck);
        library.add(faCaretUp);
        library.add(faArrowDown);
        library.add(faArrowUp);
        library.add(faCloudUploadAlt);
        library.add(faBolt);
        this.initEventListeners();
        this.initAuthenticationRouters();
    }

    globalPointerDown = action((e: PointerEvent) => {
        this.isPointerDown = true;
        const targets = document.elementsFromPoint(e.x, e.y);
        if (targets && targets.length && targets[0].className.toString().indexOf("contextMenu") === -1) {
            ContextMenu.Instance.closeMenu();
        }
        if (targets && (targets.length && targets[0].className.toString() !== "timeline-menu-desc" && targets[0].className.toString() !== "timeline-menu-item" && targets[0].className.toString() !=="timeline-menu-input")){
            TimelineMenu.Instance.closeMenu(); 
        } 
    });

    globalPointerUp = () => this.isPointerDown = false;

    initEventListeners = () => {
        // window.addEventListener("pointermove", (e) => this.reportLocation(e))
        window.addEventListener("drop", (e) => e.preventDefault(), false); // drop event handler
        window.addEventListener("dragover", (e) => e.preventDefault(), false); // drag event handler
        // click interactions for the context menu
        document.addEventListener("pointerdown", this.globalPointerDown);
        document.addEventListener("pointerup", this.globalPointerUp);
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
            let freeformDoc = Docs.Create.FreeformDocument([], { x: 0, y: 400, width: this.pwidth * .7, height: this.pheight, title: `WS collection ${list.length + 1}` });
            var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(freeformDoc, freeformDoc, 600)] }] };
            let mainDoc = Docs.Create.DockDocument([CurrentUserUtils.UserDocument, freeformDoc], JSON.stringify(dockingLayout), { title: `Workspace ${list.length + 1}` }, id);
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
        const state = HistoryUtil.parseUrl(window.location) || {} as any;
        fromHistory || HistoryUtil.pushState({ type: "doc", docId: doc[Id], readonly: state.readonly, nro: state.nro });
        if (state.readonly === true || state.readonly === null) {
            DocServer.Control.makeReadOnly();
        } else if (state.safe) {
            if (!state.nro) {
                DocServer.Control.makeReadOnly();
            }
            CollectionBaseView.SetSafeMode(true);
        } else if (state.nro || state.nro === null || state.readonly === false) {
        } else if (BoolCast(doc.readOnly)) {
            DocServer.Control.makeReadOnly();
        } else {
            DocServer.Control.makeEditable();
        }
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
        return <Measure offset onResize={this.onResize}>
            {({ measureRef }) =>
                <div ref={measureRef} id="mainContent-div" style={{ width: `calc(100% - ${flyoutWidth}px`, transform: `translate(${flyoutWidth}px, 0px)` }} onDrop={this.onDrop}>
                    {!mainCont ? (null) :
                        <DocumentView Document={mainCont}
                            DataDoc={undefined}
                            addDocument={undefined}
                            addDocTab={emptyFunction}
                            pinToPres={emptyFunction}
                            onClick={undefined}
                            ruleProvider={undefined}
                            removeDocument={undefined}
                            ScreenToLocalTransform={Transform.Identity}
                            ContentScaling={returnOne}
                            PanelWidth={this.getPWidth}
                            PanelHeight={this.getPHeight}
                            renderDepth={0}
                            backgroundColor={returnEmptyString}
                            focus={emptyFunction}
                            parentActive={returnTrue}
                            whenActiveChanged={emptyFunction}
                            bringToFront={emptyFunction}
                            ContainingCollectionView={undefined}
                            zoomToScale={emptyFunction}
                            getScale={returnOne}
                        />}
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
            pinToPres={emptyFunction}
            removeDocument={undefined}
            ruleProvider={undefined}
            onClick={undefined}
            ScreenToLocalTransform={Transform.Identity}
            ContentScaling={returnOne}
            PanelWidth={this.flyoutWidthFunc}
            PanelHeight={this.getPHeight}
            renderDepth={0}
            focus={emptyFunction}
            backgroundColor={returnEmptyString}
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
        let sidebar = CurrentUserUtils.UserDocument.sidebar;
        if (!(sidebar instanceof Doc)) return (null);
        return <div className="mainContent" style={{ width: "100%", height: "100%", position: "absolute" }}>
            <div className="mainView-libraryHandle"
                style={{ cursor: "ew-resize", left: `${this.flyoutWidth - 10}px`, backgroundColor: `${StrCast(sidebar.backgroundColor, "lightGray")}` }}
                onPointerDown={this.onPointerDown}>
                <span title="library View Dragger" style={{ width: "100%", height: "100%", position: "absolute" }} />
            </div>
            <div className="mainView-libraryFlyout" style={{ width: `${this.flyoutWidth}px`, zIndex: 1 }}>
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

    toggleLinkFollowBox = (shouldClose: boolean) => {
        if (LinkFollowBox.Instance) {
            let dvs = DocumentManager.Instance.getDocumentViews(LinkFollowBox.Instance.props.Document);
            // if it already exisits, close it
            LinkFollowBox.Instance.props.Document.isMinimized = (dvs.length > 0 && shouldClose);
        }
    }

    @observable private _colorPickerDisplay = false;
    /* for the expandable add nodes menu. Not included with the miscbuttons because once it expands it expands the whole div with it, making canvas interactions limited. */
    nodesMenu() {
        let imgurl = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg";

        let addColNode = action(() => Docs.Create.FreeformDocument([], { width: this.pwidth * .7, height: this.pheight, title: "a freeform collection" }));
        let addPresNode = action(() => Doc.UserDoc().curPresentation = Docs.Create.PresDocument(new List<Doc>(), { width: 200, height: 500, title: "a presentation trail" }));
        let addWebNode = action(() => Docs.Create.WebDocument("https://en.wikipedia.org/wiki/Hedgehog", { width: 300, height: 300, title: "New Webpage" }));
        let addDragboxNode = action(() => Docs.Create.DragboxDocument({ width: 40, height: 40, title: "drag collection" }));
        let addImageNode = action(() => Docs.Create.ImageDocument(imgurl, { width: 200, title: "an image of a cat" }));
        let addButtonDocument = action(() => Docs.Create.ButtonDocument({ width: 150, height: 50, title: "Button" }));
        let addImportCollectionNode = action(() => Docs.Create.DirectoryImportDocument({ title: "Directory Import", width: 400, height: 400 }));
        // let youtubeurl = "https://www.youtube.com/embed/TqcApsGRzWw";
        // let addYoutubeSearcher = action(() => Docs.Create.YoutubeDocument(youtubeurl, { width: 600, height: 600, title: "youtube search" }));

        let btns: [React.RefObject<HTMLDivElement>, IconName, string, () => Doc][] = [
            [React.createRef<HTMLDivElement>(), "object-group", "Add Collection", addColNode],
            [React.createRef<HTMLDivElement>(), "tv", "Add Presentation Trail", addPresNode],
            [React.createRef<HTMLDivElement>(), "globe-asia", "Add Website", addWebNode],
            [React.createRef<HTMLDivElement>(), "bolt", "Add Button", addButtonDocument],
            [React.createRef<HTMLDivElement>(), "file", "Add Document Dragger", addDragboxNode],
            [React.createRef<HTMLDivElement>(), "cloud-upload-alt", "Import Directory", addImportCollectionNode], //remove at some point in favor of addImportCollectionNode
            //[React.createRef<HTMLDivElement>(), "play", "Add Youtube Searcher", addYoutubeSearcher],
        ];
        if (!ClientUtils.RELEASE) btns.unshift([React.createRef<HTMLDivElement>(), "cat", "Add Cat Image", addImageNode]);

        return < div id="add-nodes-menu" style={{ left: this.flyoutWidth + 20, bottom: 20 }} >

            <input type="checkbox" id="add-menu-toggle" ref={this.addMenuToggle} />
            <label htmlFor="add-menu-toggle" style={{ marginTop: 2 }} title="Close Menu"><p>+</p></label>

            <div id="add-options-content">
                <ul id="add-options-list">
                    <li key="search"><button className="add-button round-button" title="Search" onClick={this.toggleSearch}><FontAwesomeIcon icon="search" size="sm" /></button></li>
                    <li key="undo"><button className="add-button round-button" title="Undo" style={{ opacity: UndoManager.CanUndo() ? 1 : 0.5, transition: "0.4s ease all" }} onClick={() => UndoManager.Undo()}><FontAwesomeIcon icon="undo-alt" size="sm" /></button></li>
                    <li key="redo"><button className="add-button round-button" title="Redo" style={{ opacity: UndoManager.CanRedo() ? 1 : 0.5, transition: "0.4s ease all" }} onClick={() => UndoManager.Redo()}><FontAwesomeIcon icon="redo-alt" size="sm" /></button></li>
                    {btns.map(btn =>
                        <li key={btn[1]} ><div ref={btn[0]}>
                            <button className="round-button add-button" title={btn[2]} onPointerDown={SetupDrag(btn[0], btn[3])}>
                                <FontAwesomeIcon icon={btn[1]} size="sm" />
                            </button>
                        </div></li>)}
                    <li key="linkFollow"><button className="add-button round-button" title="Open Link Follower" onClick={() => this.toggleLinkFollowBox(true)}><FontAwesomeIcon icon="link" size="sm" /></button></li>
                    <li key="color"><button className="add-button round-button" title="Select Color" style={{ zIndex: 1000 }} onClick={() => this.toggleColorPicker()}><div className="toolbar-color-button" style={{ backgroundColor: InkingControl.Instance.selectedColor }} >
                        <div className="toolbar-color-picker" onClick={this.onColorClick} style={this._colorPickerDisplay ? { color: "black", display: "block" } : { color: "black", display: "none" }}>
                            <SketchPicker color={InkingControl.Instance.selectedColor} onChange={InkingControl.Instance.switchColor} />
                        </div>
                    </div></button></li>
                    <li key="ink" style={{ paddingRight: "6px" }}><button className="toolbar-button round-button" title="Ink" onClick={() => InkingControl.Instance.toggleDisplay()}><FontAwesomeIcon icon="pen-nib" size="sm" /> </button></li>
                    <li key="pen"><button onClick={() => InkingControl.Instance.switchTool(InkTool.Pen)} title="Pen" style={this.selected(InkTool.Pen)}><FontAwesomeIcon icon="pen" size="lg" /></button></li>
                    <li key="marker"><button onClick={() => InkingControl.Instance.switchTool(InkTool.Highlighter)} title="Highlighter" style={this.selected(InkTool.Highlighter)}><FontAwesomeIcon icon="highlighter" size="lg" /></button></li>
                    <li key="eraser"><button onClick={() => InkingControl.Instance.switchTool(InkTool.Eraser)} title="Eraser" style={this.selected(InkTool.Eraser)}><FontAwesomeIcon icon="eraser" size="lg" /></button></li>
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
                <button onClick={() => window.location.assign(Utils.prepend(RouteStore.logout))}>Log Out</button></div>
        ];

    }

    @observable isSearchVisible = false;
    @action.bound
    toggleSearch = () => {
        this.isSearchVisible = !this.isSearchVisible;
    }

    private get dictationOverlay() {
        let display = this.dictationOverlayVisible;
        let success = this.dictationSuccess;
        let result = this.isListening && !this.isListening.interim ? DictationManager.placeholder : `"${this.dictatedPhrase}"`;
        return (
            <div>
                <div
                    className={"dictation-prompt"}
                    style={{
                        opacity: display ? 1 : 0,
                        background: success === undefined ? "gainsboro" : success ? "lawngreen" : "red",
                        borderColor: this.isListening ? "red" : "black",
                    }}
                >{result}</div>
                <div
                    className={"dictation-prompt-overlay"}
                    style={{
                        opacity: display ? 0.4 : 0,
                        backgroundColor: this.isListening ? "red" : "darkslategrey"
                    }}
                />
            </div>
        );
    }

    @computed get miniPresentation() {
        let next = () => PresBox.CurrentPresentation.next();
        let back = () => PresBox.CurrentPresentation.back();
        let startOrResetPres = () => PresBox.CurrentPresentation.startOrResetPres();
        let closePresMode = action(() => { PresBox.CurrentPresentation.presMode = false; this.addDocTabFunc(PresBox.CurrentPresentation.props.Document); });
        return !PresBox.CurrentPresentation || !PresBox.CurrentPresentation.presMode ? (null) : <PresModeMenu next={next} back={back} presStatus={PresBox.CurrentPresentation.presStatus} startOrResetPres={startOrResetPres} closePresMode={closePresMode} > </PresModeMenu>;
    }

    render() {
        return (
            <div id="main-div">
                {this.dictationOverlay}
                <DocumentDecorations />
                {this.mainContent}
                {this.miniPresentation}
                <PreviewCursor />
                <ContextMenu />
                {this.nodesMenu()}
                {this.miscButtons}
                <PDFMenu />
                <TimelineMenu/>
                <MainOverlayTextBox firstinstance={true} />
                <OverlayView />
            </div >
        );
    }
}
