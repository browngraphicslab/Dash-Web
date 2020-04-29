import { library } from '@fortawesome/fontawesome-svg-core';
import { faTerminal, faCalculator, faWindowMaximize, faAddressCard, faQuestionCircle, faArrowDown, faArrowUp, faBolt, faBullseye, faCaretUp, faCat, faCheck, faChevronRight, faClipboard, faClone, faCloudUploadAlt, faCommentAlt, faCompressArrowsAlt, faCut, faEllipsisV, faEraser, faExclamation, faFileAlt, faFileAudio, faFilePdf, faFilm, faFilter, faFont, faGlobeAsia, faHighlighter, faLongArrowAltRight, faMicrophone, faMousePointer, faMusic, faObjectGroup, faPause, faPen, faPenNib, faPhone, faPlay, faPortrait, faRedoAlt, faStamp, faStickyNote, faThumbtack, faTree, faTv, faUndoAlt, faVideo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import Measure from 'react-measure';
import { Doc, DocListCast, Field, Opt } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { List } from '../../new_fields/List';
import { listSpec } from '../../new_fields/Schema';
import { BoolCast, Cast, FieldValue, StrCast } from '../../new_fields/Types';
import { TraceMobx } from '../../new_fields/util';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { emptyFunction, emptyPath, returnFalse, returnOne, returnZero, returnTrue, Utils } from '../../Utils';
import GoogleAuthenticationManager from '../apis/GoogleAuthenticationManager';
import { DocServer } from '../DocServer';
import { Docs, DocumentOptions } from '../documents/Documents';
import { DocumentType } from '../documents/DocumentTypes';
import { HistoryUtil } from '../util/History';
import RichTextMenu from './nodes/formattedText/RichTextMenu';
import { Scripting } from '../util/Scripting';
import SettingsManager from '../util/SettingsManager';
import SharingManager from '../util/SharingManager';
import { Transform } from '../util/Transform';
import { CollectionDockingView } from './collections/CollectionDockingView';
import MarqueeOptionsMenu from './collections/collectionFreeForm/MarqueeOptionsMenu';
import { CollectionLinearView } from './collections/CollectionLinearView';
import { CollectionView, CollectionViewType } from './collections/CollectionView';
import { ContextMenu } from './ContextMenu';
import { DictationOverlay } from './DictationOverlay';
import { DocumentDecorations } from './DocumentDecorations';
import GestureOverlay from './GestureOverlay';
import KeyManager from './GlobalKeyHandler';
import "./MainView.scss";
import { MainViewNotifs } from './MainViewNotifs';
import { AudioBox } from './nodes/AudioBox';
import { DocumentView } from './nodes/DocumentView';
import { RadialMenu } from './nodes/RadialMenu';
import { OverlayView } from './OverlayView';
import PDFMenu from './pdf/PDFMenu';
import { PreviewCursor } from './PreviewCursor';
import { ScriptField } from '../../new_fields/ScriptField';
import { DragManager } from '../util/DragManager';
import { TimelineMenu } from './animationtimeline/TimelineMenu';

@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    private _buttonBarHeight = 26;
    private _flyoutSizeOnDown = 0;
    private _urlState: HistoryUtil.DocUrl;
    private _docBtnRef = React.createRef<HTMLDivElement>();
    private _mainViewRef = React.createRef<HTMLDivElement>();

    @observable private _panelWidth: number = 0;
    @observable private _panelHeight: number = 0;
    @observable private _flyoutTranslate: boolean = true;
    @observable public flyoutWidth: number = 250;
    private get darkScheme() { return BoolCast(Cast(this.userDoc.activeWorkspace, Doc, null)?.darkScheme); }

    @computed private get userDoc() { return Doc.UserDoc(); }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeWorkspace, Doc)) : CurrentUserUtils.GuestWorkspace; }
    @computed public get mainFreeform(): Opt<Doc> { return (docs => (docs && docs.length > 1) ? docs[1] : undefined)(DocListCast(this.mainContainer!.data)); }
    @computed public get sidebarButtonsDoc() { return Cast(this.userDoc["tabs-buttons"], Doc) as Doc; }

    public isPointerDown = false;

    componentDidMount() {
        const tag = document.createElement('script');

        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode!.insertBefore(tag, firstScriptTag);
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.addEventListener("keydown", KeyManager.Instance.handle);
    }

    componentWillUnMount() {
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.removeEventListener("pointerdown", this.globalPointerDown);
        window.removeEventListener("pointerup", this.globalPointerUp);
    }

    constructor(props: Readonly<{}>) {
        super(props);
        MainView.Instance = this;
        this._urlState = HistoryUtil.parseUrl(window.location) || {} as any;
        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });
        if (window.location.pathname !== "/home") {
            const pathname = window.location.pathname.substr(1).split("/");
            if (pathname.length > 1) {
                const type = pathname[0];
                if (type === "doc") {
                    CurrentUserUtils.MainDocId = pathname[1];
                    if (!this.userDoc) {
                        runInAction(() => this.flyoutWidth = 0);
                        DocServer.GetRefField(CurrentUserUtils.MainDocId).then(action((field: Opt<Field>) =>
                            field instanceof Doc && (CurrentUserUtils.GuestTarget = field)));
                    }
                }
            }
        }

        library.add(faTerminal);
        library.add(faCalculator);
        library.add(faWindowMaximize);
        library.add(faFileAlt);
        library.add(faAddressCard);
        library.add(faQuestionCircle);
        library.add(faStickyNote);
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
        library.add(faMousePointer);
        library.add(faPen);
        library.add(faHighlighter);
        library.add(faEraser);
        library.add(faFileAudio);
        library.add(faPenNib);
        library.add(faMicrophone);
        library.add(faFilm);
        library.add(faMusic);
        library.add(faTree);
        library.add(faPlay);
        library.add(faCompressArrowsAlt);
        library.add(faPause);
        library.add(faClone);
        library.add(faCut);
        library.add(faCommentAlt);
        library.add(faThumbtack);
        library.add(faLongArrowAltRight);
        library.add(faCheck);
        library.add(faCaretUp);
        library.add(faFilter);
        library.add(faBullseye);
        library.add(faArrowDown);
        library.add(faArrowUp);
        library.add(faCloudUploadAlt);
        library.add(faBolt);
        library.add(faVideo);
        library.add(faChevronRight);
        library.add(faEllipsisV);
        library.add(faMusic);
        library.add(faPhone);
        library.add(faClipboard);
        library.add(faStamp);
        this.initEventListeners();
        this.initAuthenticationRouters();
    }

    globalPointerDown = action((e: PointerEvent) => {
        this.isPointerDown = true;
        AudioBox.Enabled = true;
        const targets = document.elementsFromPoint(e.x, e.y);
        if (targets && targets.length && targets[0].className.toString().indexOf("contextMenu") === -1) {
            ContextMenu.Instance.closeMenu();
        }
        if (targets && (targets.length && targets[0].className.toString() !== "timeline-menu-desc" && targets[0].className.toString() !== "timeline-menu-item" && targets[0].className.toString() !== "timeline-menu-input")) {
            TimelineMenu.Instance.closeMenu();
        }
    });

    globalPointerUp = () => this.isPointerDown = false;

    initEventListeners = () => {
        window.addEventListener("drop", (e) => e.preventDefault(), false); // drop event handler
        window.addEventListener("dragover", (e) => e.preventDefault(), false); // drag event handler
        // click interactions for the context menu
        document.addEventListener("pointerdown", this.globalPointerDown);
        document.addEventListener("pointerup", this.globalPointerUp);
    }

    initAuthenticationRouters = async () => {
        // Load the user's active workspace, or create a new one if initial session after signup
        const received = CurrentUserUtils.MainDocId;
        if (received && !this.userDoc) {
            reaction(
                () => CurrentUserUtils.GuestTarget,
                target => target && this.createNewWorkspace(),
                { fireImmediately: true }
            );
        } else {
            if (received && this._urlState.sharing) {
                reaction(() => CollectionDockingView.Instance && CollectionDockingView.Instance.initialized,
                    initialized => initialized && received && DocServer.GetRefField(received).then(docField => {
                        if (docField instanceof Doc && docField._viewType !== CollectionViewType.Docking) {
                            CollectionDockingView.AddRightSplit(docField);
                        }
                    }),
                );
            }
            const doc = this.userDoc && await Cast(this.userDoc.activeWorkspace, Doc);
            if (doc) {
                this.openWorkspace(doc);
            } else {
                this.createNewWorkspace();
            }
        }
    }

    @action
    createNewWorkspace = async (id?: string) => {
        const workspaces = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
        const workspaceCount = DocListCast(workspaces.data).length + 1;
        const freeformOptions: DocumentOptions = {
            x: 0,
            y: 400,
            _width: this._panelWidth * .7,
            _height: this._panelHeight,
            title: "Collection " + workspaceCount,
        };
        const freeformDoc = CurrentUserUtils.GuestTarget || Docs.Create.FreeformDocument([], freeformOptions);
        Doc.AddDocToList(Doc.GetProto(Doc.UserDoc().myDocuments as Doc), "data", freeformDoc);
        const mainDoc = Docs.Create.StandardCollectionDockingDocument([{ doc: freeformDoc, initialWidth: 600, path: [Doc.UserDoc().myDocuments as Doc] }], { title: `Workspace ${workspaceCount}` }, id, "row");

        const toggleTheme = ScriptField.MakeScript(`self.darkScheme = !self.darkScheme`);
        mainDoc.contextMenuScripts = new List<ScriptField>([toggleTheme!]);
        mainDoc.contextMenuLabels = new List<string>(["Toggle Theme Colors"]);

        Doc.AddDocToList(workspaces, "data", mainDoc);
        // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
        setTimeout(() => this.openWorkspace(mainDoc), 0);
    }

    @action
    openWorkspace = (doc: Doc, fromHistory = false) => {
        CurrentUserUtils.MainDocId = doc[Id];

        if (doc) {  // this has the side-effect of setting the main container since we're assigning the active/guest workspace
            !("presentationView" in doc) && (doc.presentationView = new List<Doc>([Docs.Create.TreeDocument([], { title: "Presentation" })]));
            this.userDoc ? (this.userDoc.activeWorkspace = doc) : (CurrentUserUtils.GuestWorkspace = doc);
        }
        const state = this._urlState;
        if (state.sharing === true && !this.userDoc) {
            DocServer.Control.makeReadOnly();
        } else {
            fromHistory || HistoryUtil.pushState({
                type: "doc",
                docId: doc[Id],
                readonly: state.readonly,
                nro: state.nro,
                sharing: false,
            });
            if (state.readonly === true || state.readonly === null) {
                DocServer.Control.makeReadOnly();
            } else if (state.safe) {
                if (!state.nro) {
                    DocServer.Control.makeReadOnly();
                }
                CollectionView.SetSafeMode(true);
            } else if (state.nro || state.nro === null || state.readonly === false) {
            } else if (doc.readOnly) {
                DocServer.Control.makeReadOnly();
            } else {
                DocServer.Control.makeEditable();
            }
        }
        // if there is a pending doc, and it has new data, show it (syip: we use a timeout to prevent collection docking view from being uninitialized)
        setTimeout(async () => {
            const col = this.userDoc && await Cast(this.userDoc.rightSidebarCollection, Doc);
            col && Cast(col.data, listSpec(Doc)) && runInAction(() => MainViewNotifs.NotifsCol = col);
        }, 100);
        return true;
    }

    onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Drop");
    }

    @action
    onResize = (r: any) => {
        this._panelWidth = r.offset.width;
        this._panelHeight = r.offset.height;
    }
    getPWidth = () => this._panelWidth;
    getPHeight = () => this._panelHeight;
    getContentsHeight = () => this._panelHeight - this._buttonBarHeight;

    defaultBackgroundColors = (doc: Doc) => {
        if (this.darkScheme) {
            switch (doc.type) {
                case DocumentType.RTF || DocumentType.LABEL || DocumentType.BUTTON: return "#2d2d2d";
                case DocumentType.LINK:
                case DocumentType.COL: {
                    if (doc._viewType !== CollectionViewType.Freeform && doc._viewType !== CollectionViewType.Time) return "rgb(62,62,62)";
                }
                default: return "black";
            }
        } else {
            switch (doc.type) {
                case DocumentType.RTF: return "#f1efeb";
                case DocumentType.BUTTON:
                case DocumentType.LABEL: return "lightgray";
                case DocumentType.LINK:
                case DocumentType.COL: {
                    if (doc._viewType !== CollectionViewType.Freeform && doc._viewType !== CollectionViewType.Time) return "lightgray";
                }
                default: return "white";
            }
        }
    }
    @computed get mainDocView() {
        return <DocumentView Document={this.mainContainer!}
            DataDoc={undefined}
            LibraryPath={emptyPath}
            addDocument={undefined}
            addDocTab={this.addDocTabFunc}
            pinToPres={emptyFunction}
            rootSelected={returnTrue}
            onClick={undefined}
            backgroundColor={this.defaultBackgroundColors}
            removeDocument={undefined}
            ScreenToLocalTransform={Transform.Identity}
            ContentScaling={returnOne}
            NativeHeight={returnZero}
            NativeWidth={returnZero}
            PanelWidth={this.getPWidth}
            PanelHeight={this.getPHeight}
            renderDepth={0}
            focus={emptyFunction}
            parentActive={returnTrue}
            whenActiveChanged={emptyFunction}
            bringToFront={emptyFunction}
            ContainingCollectionView={undefined}
            ContainingCollectionDoc={undefined}
        />;
    }
    @computed get dockingContent() {
        TraceMobx();
        const mainContainer = this.mainContainer;
        const width = this.flyoutWidth;
        return <Measure offset onResize={this.onResize}>
            {({ measureRef }) =>
                <div ref={measureRef} className="mainContent-div" onDrop={this.onDrop} style={{ width: `calc(100% - ${width}px)` }}>
                    {!mainContainer ? (null) : this.mainDocView}
                </div>
            }
        </Measure>;
    }

    _canClick = false;
    onPointerDown = (e: React.PointerEvent) => {
        if (this._flyoutTranslate) {
            this._canClick = true;
            this._flyoutSizeOnDown = e.clientX;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    pointerOverDragger = () => {
        // if (this.flyoutWidth === 0) {
        //     this.flyoutWidth = 250;
        //     this.sidebarButtonsDoc.columnWidth = this.flyoutWidth / 3 - 30;
        //     this._flyoutTranslate = false;
        // }
    }

    @action
    pointerLeaveDragger = () => {
        if (!this._flyoutTranslate) {
            this.flyoutWidth = 0;
            this._flyoutTranslate = true;
        }
    }

    @action
    onPointerMove = (e: PointerEvent) => {
        this.flyoutWidth = Math.max(e.clientX, 0);
        Math.abs(this.flyoutWidth - this._flyoutSizeOnDown) > 6 && (this._canClick = false);
        this.sidebarButtonsDoc.columnWidth = this.flyoutWidth / 3 - 30;
    }
    @action
    onPointerUp = (e: PointerEvent) => {
        if (Math.abs(e.clientX - this._flyoutSizeOnDown) < 4 && this._canClick) {
            this.flyoutWidth = this.flyoutWidth < 15 ? 250 : 0;
            this.flyoutWidth && (this.sidebarButtonsDoc.columnWidth = this.flyoutWidth / 3 - 30);
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }
    flyoutWidthFunc = () => this.flyoutWidth;
    addDocTabFunc = (doc: Doc, where: string, libraryPath?: Doc[]): boolean => {
        return where === "close" ? CollectionDockingView.CloseRightSplit(doc) :
            doc.dockingConfig ? this.openWorkspace(doc) :
                CollectionDockingView.AddRightSplit(doc, libraryPath);
    }
    mainContainerXf = () => new Transform(0, -this._buttonBarHeight, 1);

    @computed get flyout() {
        const sidebarContent = this.userDoc?.["tabs-panelContainer"];
        if (!(sidebarContent instanceof Doc)) {
            return (null);
        }
        return <div className="mainView-flyoutContainer" >
            <div className="mainView-tabButtons" style={{ height: `${this._buttonBarHeight}px`, backgroundColor: StrCast(this.sidebarButtonsDoc.backgroundColor) }}>
                <DocumentView
                    Document={this.sidebarButtonsDoc}
                    DataDoc={undefined}
                    LibraryPath={emptyPath}
                    addDocument={undefined}
                    rootSelected={returnTrue}
                    addDocTab={this.addDocTabFunc}
                    pinToPres={emptyFunction}
                    removeDocument={undefined}
                    onClick={undefined}
                    ScreenToLocalTransform={Transform.Identity}
                    ContentScaling={returnOne}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                    PanelWidth={this.flyoutWidthFunc}
                    PanelHeight={this.getPHeight}
                    renderDepth={0}
                    focus={emptyFunction}
                    backgroundColor={this.defaultBackgroundColors}
                    parentActive={returnTrue}
                    whenActiveChanged={emptyFunction}
                    bringToFront={emptyFunction}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined} />
            </div>
            <div className="mainView-contentArea" style={{ position: "relative", height: `calc(100% - ${this._buttonBarHeight}px)`, width: "100%", overflow: "visible" }}>
                <DocumentView
                    Document={sidebarContent}
                    DataDoc={undefined}
                    LibraryPath={emptyPath}
                    addDocument={undefined}
                    addDocTab={this.addDocTabFunc}
                    pinToPres={emptyFunction}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                    rootSelected={returnTrue}
                    removeDocument={returnFalse}
                    onClick={undefined}
                    ScreenToLocalTransform={this.mainContainerXf}
                    ContentScaling={returnOne}
                    PanelWidth={this.flyoutWidthFunc}
                    PanelHeight={this.getContentsHeight}
                    renderDepth={0}
                    focus={emptyFunction}
                    backgroundColor={this.defaultBackgroundColors}
                    parentActive={returnTrue}
                    whenActiveChanged={emptyFunction}
                    bringToFront={emptyFunction}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined} />
                <button className="mainView-settings" key="settings" onClick={() => SettingsManager.Instance.open()}>
                    Settings
                </button>
                <button className="mainView-logout" key="logout" onClick={() => window.location.assign(Utils.prepend("/logout"))}>
                    {CurrentUserUtils.GuestWorkspace ? "Exit" : "Log Out"}
                </button>
            </div>
            {this.docButtons}
        </div>;
    }

    @computed get mainContent() {
        const sidebar = this.userDoc?.["tabs-panelContainer"];
        return !this.userDoc || !(sidebar instanceof Doc) ? (null) : (
            <div className="mainView-mainContent" style={{ color: this.darkScheme ? "rgb(205,205,205)" : "black" }} >
                <div className="mainView-flyoutContainer" onPointerLeave={this.pointerLeaveDragger} style={{ width: this.flyoutWidth }}>
                    <div className="mainView-libraryHandle" onPointerDown={this.onPointerDown} onPointerOver={this.pointerOverDragger}
                        style={{ backgroundColor: this.defaultBackgroundColors(sidebar) }}>
                        <span title="library View Dragger" style={{
                            width: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "100%" : "3vw",
                            //height: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "100%" : "100vh",
                            position: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "absolute" : "fixed",
                            top: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "" : "0"
                        }} />
                    </div>
                    <div className="mainView-libraryFlyout" style={{
                        //transformOrigin: this._flyoutTranslate ? "" : "left center",
                        transition: this._flyoutTranslate ? "" : "width .5s",
                        //transform: `scale(${this._flyoutTranslate ? 1 : 0.8})`,
                        boxShadow: this._flyoutTranslate ? "" : "rgb(156, 147, 150) 0.2vw 0.2vw 0.8vw"
                    }}>
                        {this.flyout}
                        {this.expandButton}
                    </div>
                </div>
                {this.dockingContent}
            </div>);
    }

    public static expandFlyout = action(() => {
        MainView.Instance._flyoutTranslate = true;
        MainView.Instance.flyoutWidth = (MainView.Instance.flyoutWidth || 250);
        MainView.Instance.sidebarButtonsDoc.columnWidth = MainView.Instance.flyoutWidth / 3 - 30;
    });

    @computed get expandButton() {
        return !this._flyoutTranslate ? (<div className="mainView-expandFlyoutButton" title="Re-attach sidebar" onPointerDown={MainView.expandFlyout}><FontAwesomeIcon icon="chevron-right" color="grey" size="lg" /></div>) : (null);
    }

    addButtonDoc = (doc: Doc) => Doc.AddDocToList(Doc.UserDoc().dockedBtns as Doc, "data", doc);
    remButtonDoc = (doc: Doc) => Doc.RemoveDocFromList(Doc.UserDoc().dockedBtns as Doc, "data", doc);
    moveButtonDoc = (doc: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => this.remButtonDoc(doc) && addDocument(doc);

    buttonBarXf = () => {
        if (!this._docBtnRef.current) return Transform.Identity();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._docBtnRef.current);
        return new Transform(-translateX, -translateY, 1 / scale);
    }
    @computed get docButtons() {
        const dockedBtns = Doc.UserDoc()?.dockedBtns;
        if (dockedBtns instanceof Doc) {
            return <div className="mainView-docButtons" ref={this._docBtnRef}
                style={{ height: !dockedBtns.linearViewIsExpanded ? "42px" : undefined }} >
                <MainViewNotifs />
                <CollectionLinearView
                    Document={dockedBtns}
                    DataDoc={undefined}
                    LibraryPath={emptyPath}
                    fieldKey={"data"}
                    dropAction={"alias"}
                    annotationsKey={""}
                    rootSelected={returnTrue}
                    bringToFront={emptyFunction}
                    select={emptyFunction}
                    active={returnFalse}
                    isSelected={returnFalse}
                    moveDocument={this.moveButtonDoc}
                    CollectionView={undefined}
                    addDocument={this.addButtonDoc}
                    addDocTab={this.addDocTabFunc}
                    pinToPres={emptyFunction}
                    removeDocument={this.remButtonDoc}
                    onClick={undefined}
                    ScreenToLocalTransform={this.buttonBarXf}
                    ContentScaling={returnOne}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                    PanelWidth={this.flyoutWidthFunc}
                    PanelHeight={this.getContentsHeight}
                    renderDepth={0}
                    focus={emptyFunction}
                    whenActiveChanged={emptyFunction}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined} />
            </div>;
        }
        return (null);
    }

    get mainViewElement() {
        return document.getElementById("mainView-container");
    }

    get mainViewRef() {
        return this._mainViewRef;
    }

    @observable public _hLines: any;
    @observable public _vLines: any;

    render() {
        return (<div className={"mainView-container" + (this.darkScheme ? "-dark" : "")} ref={this._mainViewRef}>
            <DictationOverlay />
            <SharingManager />
            <SettingsManager />
            <GoogleAuthenticationManager />
            <DocumentDecorations />
            <GestureOverlay>
                {this.mainContent}
            </GestureOverlay>
            <PreviewCursor />
            <ContextMenu />
            <RadialMenu />
            <PDFMenu />
            <MarqueeOptionsMenu />
            <RichTextMenu />
            <OverlayView />
            {/* TO VIEW SNAP LINES
            <div className="snapLines" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                <svg style={{ width: "100%", height: "100%" }}>
                    {this._hLines?.map(l => <line x1="0" y1={l} x2="2000" y2={l} stroke="black" />)}
                    {this._vLines?.map(l => <line y1="0" x1={l} y2="2000" x2={l} stroke="black" />)}
                </svg>
            </div> */}
            <TimelineMenu />
        </div >);
    }
}
Scripting.addGlobal(function freezeSidebar() { MainView.expandFlyout(); });
