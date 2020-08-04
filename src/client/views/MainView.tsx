import { library } from '@fortawesome/fontawesome-svg-core';
import { faHireAHelper, faBuffer } from '@fortawesome/free-brands-svg-icons';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import Measure from 'react-measure';
import { Doc, DocListCast, Field, Opt } from '../../fields/Doc';
import { Id } from '../../fields/FieldSymbols';
import { List } from '../../fields/List';
import { listSpec } from '../../fields/Schema';
import { ScriptField } from '../../fields/ScriptField';
import { BoolCast, Cast, FieldValue, StrCast } from '../../fields/Types';
import { TraceMobx } from '../../fields/util';
import { emptyFunction, emptyPath, returnEmptyFilter, returnFalse, returnOne, returnTrue, returnZero, setupMoveUpEvents, Utils } from '../../Utils';
import GoogleAuthenticationManager from '../apis/GoogleAuthenticationManager';
import HypothesisAuthenticationManager from '../apis/HypothesisAuthenticationManager';
import { DocServer } from '../DocServer';
import { Docs, DocumentOptions } from '../documents/Documents';
import { DocumentType } from '../documents/DocumentTypes';
import { CurrentUserUtils } from '../util/CurrentUserUtils';
import { DocumentManager } from '../util/DocumentManager';
import GroupManager from '../util/GroupManager';
import { HistoryUtil } from '../util/History';
import { Scripting } from '../util/Scripting';
import { SelectionManager } from '../util/SelectionManager';
import SettingsManager from '../util/SettingsManager';
import SharingManager from '../util/SharingManager';
import { SnappingManager } from '../util/SnappingManager';
import { Transform } from '../util/Transform';
import { TimelineMenu } from './animationtimeline/TimelineMenu';
import { CollectionDockingView } from './collections/CollectionDockingView';
import FormatShapePane from "./collections/collectionFreeForm/FormatShapePane";
import MarqueeOptionsMenu from './collections/collectionFreeForm/MarqueeOptionsMenu';
import { PropertiesView } from './collections/collectionFreeForm/PropertiesView';
import { CollectionLinearView } from './collections/CollectionLinearView';
import CollectionMenu from './collections/CollectionMenu';
import { CollectionView, CollectionViewType } from './collections/CollectionView';
import { ContextMenu } from './ContextMenu';
import { DictationOverlay } from './DictationOverlay';
import { DocumentDecorations } from './DocumentDecorations';
import GestureOverlay from './GestureOverlay';
import { ANTIMODEMENU_HEIGHT } from './globalCssVariables.scss';
import KeyManager from './GlobalKeyHandler';
import { LinkMenu } from './linking/LinkMenu';
import "./MainView.scss";
import { MainViewNotifs } from './MainViewNotifs';
import { AudioBox } from './nodes/AudioBox';
import { DocumentLinksButton } from './nodes/DocumentLinksButton';
import { DocumentView } from './nodes/DocumentView';
import { FormattedTextBox } from './nodes/formattedText/FormattedTextBox';
import RichTextMenu from './nodes/formattedText/RichTextMenu';
import { LinkDescriptionPopup } from './nodes/LinkDescriptionPopup';
import { LinkDocPreview } from './nodes/LinkDocPreview';
import { RadialMenu } from './nodes/RadialMenu';
import { TaskCompletionBox } from './nodes/TaskCompletedBox';
import { OverlayView } from './OverlayView';
import PDFMenu from './pdf/PDFMenu';
import { PreviewCursor } from './PreviewCursor';
import { undoBatch } from '../util/UndoManager';
import { SearchBox } from './search/SearchBox';

@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    private _buttonBarHeight = 36;
    private _flyoutSizeOnDown = 0;
    private _urlState: HistoryUtil.DocUrl;
    private _docBtnRef = React.createRef<HTMLDivElement>();
    private _mainViewRef = React.createRef<HTMLDivElement>();

    @observable private _panelWidth: number = 0;
    @observable private _panelHeight: number = 0;
    @observable private _flyoutTranslate: boolean = false;
    @observable public flyoutWidth: number = 0;
    private get darkScheme() { return BoolCast(Cast(this.userDoc?.activeWorkspace, Doc, null)?.darkScheme); }

    @computed private get userDoc() { return Doc.UserDoc(); }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeWorkspace, Doc)) : CurrentUserUtils.GuestWorkspace; }
    @computed public get mainFreeform(): Opt<Doc> { return (docs => (docs && docs.length > 1) ? docs[1] : undefined)(DocListCast(this.mainContainer!.data)); }
    @computed public get searchDoc() { return Cast(this.userDoc["search-panel"], Doc) as Doc; }


    @observable public sidebarContent: any = this.userDoc?.["sidebar"];
    @observable public panelContent: string = "none";
    @observable public showProperties: boolean = false;
    public isPointerDown = false;
    @computed get selectedDocumentView() {
        if (SelectionManager.SelectedDocuments().length) {
            return SelectionManager.SelectedDocuments()[0];
        } else { return undefined; }
    }

    propertiesWidth = () => Math.max(0, Math.min(this._panelWidth - 50, CurrentUserUtils.propertiesWidth));

    @computed get propertiesIcon() {
        if (this.propertiesWidth() < 10) {
            return "chevron-left";
        } else {
            return "chevron-right";
        }
    }
    @observable propertiesDownX: number | undefined;

    componentDidMount() {
        DocServer.setPlaygroundFields(["dataTransition", "_viewTransition", "_panX", "_panY", "_viewScale", "_viewType", "_chromeStatus"]); // can play with these fields on someone else's

        const tag = document.createElement('script');

        const proto = DocServer.GetRefField("rtfProto").then(proto => {
            (proto instanceof Doc) && reaction(() => StrCast(proto.BROADCAST_MESSAGE),
                msg => msg && alert(msg));
        });

        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode!.insertBefore(tag, firstScriptTag);
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.addEventListener("keydown", KeyManager.Instance.handle);
        window.addEventListener("paste", KeyManager.Instance.paste as any);
        document.addEventListener("dash", (e: any) => {  // event used by chrome plugin to tell Dash which document to focus on
            const id = FormattedTextBox.GetDocFromUrl(e.detail);
            DocServer.GetRefField(id).then(doc => {
                if (doc instanceof Doc) {
                    DocumentManager.Instance.jumpToDocument(doc, false, undefined);
                }
            });
        });
    }

    componentWillUnMount() {
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.removeEventListener("pointerdown", this.globalPointerDown);
        window.removeEventListener("pointerup", this.globalPointerUp);
        window.removeEventListener("paste", KeyManager.Instance.paste as any);
    }

    constructor(props: Readonly<{}>) {
        super(props);
        MainView.Instance = this;
        this._urlState = HistoryUtil.parseUrl(window.location) || {} as any;
        // causes errors to be generated when modifying an observable outside of an action

        CurrentUserUtils.propertiesWidth = 0;

        configure({ enforceActions: "observed" });
        if (window.location.pathname !== "/home") {
            const pathname = window.location.pathname.substr(1).split("/");
            if (pathname.length > 1) {
                const type = pathname[0];
                if (type === "doc") {
                    CurrentUserUtils.MainDocId = pathname[1];
                    if (!this.userDoc) {
                        runInAction(() => this.closeFlyout());
                        DocServer.GetRefField(CurrentUserUtils.MainDocId).then(action((field: Opt<Field>) =>
                            field instanceof Doc && (CurrentUserUtils.GuestTarget = field)));
                    }
                }
            }
        }

        library.add(fa.faEdit, fa.faTrash, fa.faTrashAlt, fa.faShare, fa.faDownload, fa.faExpandArrowsAlt, fa.faLayerGroup, fa.faExternalLinkAlt,
            fa.faSquare, fa.faConciergeBell, fa.faWindowRestore, fa.faFolder, fa.faMapPin, fa.faFingerprint, fa.faCrosshairs, fa.faDesktop, fa.faUnlock,
            fa.faLock, fa.faLaptopCode, fa.faMale, fa.faCopy, fa.faHandPointRight, fa.faCompass, fa.faSnowflake, fa.faMicrophone, fa.faKeyboard,
            fa.faQuestion, fa.faTasks, fa.faPalette, fa.faAngleRight, fa.faBell, fa.faCamera, fa.faExpand, fa.faCaretDown, fa.faCaretLeft, fa.faCaretRight,
            fa.faCaretSquareDown, fa.faCaretSquareRight, fa.faArrowsAltH, fa.faPlus, fa.faMinus, fa.faTerminal, fa.faToggleOn, fa.faFile, fa.faLocationArrow,
            fa.faSearch, fa.faFileDownload, fa.faStop, fa.faCalculator, fa.faWindowMaximize, fa.faAddressCard, fa.faQuestionCircle, fa.faArrowLeft,
            fa.faArrowRight, fa.faArrowDown, fa.faArrowUp, fa.faBolt, fa.faBullseye, fa.faCaretUp, fa.faCat, fa.faCheck, fa.faChevronRight, fa.faClipboard,
            fa.faClone, fa.faCloudUploadAlt, fa.faCommentAlt, fa.faCompressArrowsAlt, fa.faCut, fa.faEllipsisV, fa.faEraser, fa.faExclamation, fa.faFileAlt,
            fa.faFileAudio, fa.faFilePdf, fa.faFilm, fa.faFilter, fa.faFont, fa.faGlobeAsia, fa.faHighlighter, fa.faLongArrowAltRight, fa.faMousePointer,
            fa.faMusic, fa.faObjectGroup, fa.faPause, fa.faPen, fa.faPenNib, fa.faPhone, fa.faPlay, fa.faPortrait, fa.faRedoAlt, fa.faStamp, fa.faStickyNote,
            fa.faTimesCircle, fa.faThumbtack, fa.faTree, fa.faTv, fa.faUndoAlt, fa.faVideo, fa.faAsterisk, fa.faBrain, fa.faImage, fa.faPaintBrush, fa.faTimes,
            fa.faEye, fa.faArrowsAlt, fa.faQuoteLeft, fa.faSortAmountDown, fa.faAlignLeft, fa.faAlignCenter, fa.faAlignRight, fa.faHeading, fa.faRulerCombined,
            fa.faFillDrip, fa.faLink, fa.faUnlink, fa.faBold, fa.faItalic, fa.faChevronLeft, fa.faUnderline, fa.faStrikethrough, fa.faSuperscript, fa.faSubscript,
            fa.faIndent, fa.faEyeDropper, fa.faPaintRoller, fa.faBars, fa.faBrush, fa.faShapes, fa.faEllipsisH, fa.faHandPaper, fa.faMap, fa.faUser, faHireAHelper,
            fa.faDesktop, fa.faTrashRestore, fa.faUsers, fa.faWrench, fa.faCog, fa.faMap, fa.faBellSlash, fa.faExpandAlt, fa.faArchive, fa.faBezierCurve, fa.faCircle,
            fa.faLongArrowAltRight, fa.faPenFancy, fa.faAngleDoubleRight, faBuffer, fa.faExpand, fa.faUndo, fa.faSlidersH, fa.faAngleDoubleLeft);
        this.initEventListeners();
        this.initAuthenticationRouters();
    }

    globalPointerDown = action((e: PointerEvent) => {
        this.isPointerDown = true;
        AudioBox.Enabled = true;
        const targets = document.elementsFromPoint(e.x, e.y);
        if (targets && targets.length && targets[0].className.toString().indexOf("contextMenu") === -1) {
            ContextMenu.Instance.closeMenu();
            //SearchBox.Instance.closeSearch();
        }
        if (targets && (targets.length && targets[0].className.toString() !== "timeline-menu-desc" && targets[0].className.toString() !== "timeline-menu-item" && targets[0].className.toString() !== "timeline-menu-input")) {
            TimelineMenu.Instance.closeMenu();
        }
        if (targets && targets.length && SearchBox.Instance._searchbarOpen) {
            let check = false;
            targets.forEach((thing) => {
                if (thing.className.toString() === "collectionSchemaView-table" || (thing as any)?.dataset["icon"] === "filter" || thing.className.toString() === "beta" || thing.className.toString() === "collectionSchemaView-menuOptions-wrapper") {
                    check = true;
                }
            });
            if (check === false) {
                SearchBox.Instance.closeSearch();
            }
        }


    });

    globalPointerUp = () => this.isPointerDown = false;

    initEventListeners = () => {
        window.addEventListener("drop", (e) => { e.preventDefault(); }, false); // drop event handler
        window.addEventListener("dragover", (e) => { e.preventDefault(); }, false); // drag event handler
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
            _width: this._panelWidth * .7 - this.propertiesWidth() * 0.7,
            _height: this._panelHeight,
            title: "Collection " + workspaceCount,
        };
        const freeformDoc = CurrentUserUtils.GuestTarget || Docs.Create.FreeformDocument([], freeformOptions);
        const workspaceDoc = Docs.Create.StandardCollectionDockingDocument([{ doc: freeformDoc, initialWidth: 600, path: [Doc.UserDoc().myCatalog as Doc] }], { title: `Workspace ${workspaceCount}` }, id, "row");

        const toggleTheme = ScriptField.MakeScript(`self.darkScheme = !self.darkScheme`);
        const toggleComic = ScriptField.MakeScript(`toggleComicMode()`);
        const copyWorkspace = ScriptField.MakeScript(`copyWorkspace()`);
        workspaceDoc.contextMenuScripts = new List<ScriptField>([toggleTheme!, toggleComic!, copyWorkspace!]);
        workspaceDoc.contextMenuLabels = new List<string>(["Toggle Theme Colors", "Toggle Comic Mode", "Snapshot Workspace"]);

        Doc.AddDocToList(workspaces, "data", workspaceDoc);
        // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
        setTimeout(() => this.openWorkspace(workspaceDoc), 0);
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
    }

    @action
    onResize = (r: any) => {
        this._panelWidth = r.offset.width;// - this.propertiesWidth();
        this._panelHeight = r.offset.height;
    }

    @action
    getPWidth = () => this._panelWidth - this.propertiesWidth()

    getPHeight = () => this._panelHeight;
    getContentsHeight = () => this._panelHeight - this._buttonBarHeight;

    defaultBackgroundColors = (doc: Opt<Doc>) => {
        if (this.panelContent === doc?.title) return "lightgrey";
        if (this.darkScheme) {
            switch (doc?.type) {
                case DocumentType.FONTICON: return "white";
                case DocumentType.RTF || DocumentType.LABEL || DocumentType.BUTTON: return "#2d2d2d";
                case DocumentType.LINK:
                case DocumentType.COL: {
                    if (doc._viewType !== CollectionViewType.Freeform && doc._viewType !== CollectionViewType.Time) return "rgb(62,62,62)";
                }
                default: return "black";
            }
        } else {
            switch (doc?.type) {
                case DocumentType.FONTICON: return "black";
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
        return <DocumentView
            Document={this.mainContainer!}
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
            focus={emptyFunction}
            parentActive={returnTrue}
            whenActiveChanged={emptyFunction}
            bringToFront={emptyFunction}
            docFilters={returnEmptyFilter}
            ContainingCollectionView={undefined}
            ContainingCollectionDoc={undefined}
            renderDepth={-1}
        />;
    }

    @computed get dockingContent() {
        TraceMobx();
        const mainContainer = this.mainContainer;
        const width = this.flyoutWidth + this.propertiesWidth();
        return <div className="mainContent-div" onDrop={this.onDrop} style={{ width: `calc(100% - ${width}px)` }}>
            {!mainContainer ? (null) : this.mainDocView}
        </div>;
    }

    @action
    onPropertiesPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            CurrentUserUtils.propertiesWidth = this._panelWidth - e.clientX;
            return false;
        }), returnFalse, action(() => CurrentUserUtils.propertiesWidth = this.propertiesWidth() < 15 ? Math.min(this._panelWidth - 50, 250) : 0), false);
    }

    @action
    onFlyoutPointerDown = (e: React.PointerEvent) => {
        if (this._flyoutTranslate) {
            setupMoveUpEvents(this, e, action((e: PointerEvent) => {
                this.flyoutWidth = Math.max(e.clientX, 0);
                if (this.flyoutWidth < 5) {
                    this.panelContent = "none";
                    this._lastButton && (this._lastButton.color = "white");
                    this._lastButton && (this._lastButton._backgroundColor = "");
                }
                return false;
            }), emptyFunction, action(() => {
                if (this.flyoutWidth < 15) MainView.expandFlyout();
                else this.closeFlyout();
            }));
        }
    }

    flyoutWidthFunc = () => this.flyoutWidth;
    addDocTabFunc = (doc: Doc, where: string, libraryPath?: Doc[]): boolean => {
        return where === "close" ? CollectionDockingView.CloseRightSplit(doc) :
            doc.dockingConfig ? this.openWorkspace(doc) :
                CollectionDockingView.AddRightSplit(doc, libraryPath);
    }
    sidebarScreenToLocal = () => new Transform(0, (CollectionMenu.Instance.Pinned ? -35 : 0), 1);
    //sidebarScreenToLocal = () => new Transform(0, (RichTextMenu.Instance.Pinned ? -35 : 0) + (CollectionMenu.Instance.Pinned ? -35 : 0), 1);
    mainContainerXf = () => this.sidebarScreenToLocal().translate(0, -this._buttonBarHeight);

    @computed get closePosition() { return 55 + this.flyoutWidth; }
    @computed get flyout() {
        if (!this.sidebarContent) return null;
        return <div className="mainView-libraryFlyout">
            <div className="mainView-contentArea" style={{ position: "relative", height: `100%`, width: "100%", overflow: "visible" }}>
                {this.flyoutWidth > 0 ? <div className="mainView-libraryFlyout-close"
                    onPointerDown={this.closeFlyout}>
                    <FontAwesomeIcon icon="times" color="black" size="lg" />
                </div> : null}

                <DocumentView
                    Document={this.sidebarContent}
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
                    docFilters={returnEmptyFilter}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    relative={true}
                />
            </div>
            {this.docButtons}</div>;
    }

    @computed get menuPanel() {
        return <div className="mainView-menuPanel">
            <DocumentView
                Document={Doc.UserDoc().menuStack as Doc}
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
                ScreenToLocalTransform={this.sidebarScreenToLocal}
                ContentScaling={returnOne}
                PanelWidth={() => 60}
                PanelHeight={this.getContentsHeight}
                renderDepth={0}
                focus={emptyFunction}
                backgroundColor={this.defaultBackgroundColors}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                docFilters={returnEmptyFilter}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                relative={true}
                scriptContext={this}
            />
        </div>;
    }


    @action @undoBatch
    closeFlyout = () => {
        this._lastButton && (this._lastButton.color = "white");
        this._lastButton && (this._lastButton._backgroundColor = "");
        this.panelContent = "none";
        this.flyoutWidth = 0;
    }

    get groupManager() { return GroupManager.Instance; }

    _lastButton: Doc | undefined;
    @action @undoBatch
    selectMenu = (button: Doc, str: string) => {
        this._lastButton && (this._lastButton.color = "white");
        this._lastButton && (this._lastButton._backgroundColor = "");
        if (this.panelContent === str && this.flyoutWidth !== 0) {
            this.panelContent = "none";
            this.flyoutWidth = 0;
        } else {
            let panelDoc: Doc | undefined;
            switch (this.panelContent = str) {
                case "Tools": panelDoc = Doc.UserDoc()["sidebar-tools"] as Doc ?? undefined; break;
                case "Workspace": panelDoc = Doc.UserDoc()["sidebar-workspaces"] as Doc ?? undefined; break;
                case "Catalog": panelDoc = Doc.UserDoc()["sidebar-catalog"] as Doc ?? undefined; break;
                case "Archive": panelDoc = Doc.UserDoc()["sidebar-recentlyClosed"] as Doc ?? undefined; break;
                case "Settings": SettingsManager.Instance.open(); break;
                case "Sharing": GroupManager.Instance.open(); break;
                case "UserDoc": panelDoc = Doc.UserDoc()["sidebar-userDoc"] as Doc ?? undefined; break;
            }
            this.sidebarContent.proto = panelDoc;
            if (panelDoc) {
                MainView.expandFlyout();
                button._backgroundColor = "lightgrey";
                button.color = "black";
                this._lastButton = button;
            } else this.flyoutWidth = 0;
        }
        return true;
    }

    @action @undoBatch
    closeProperties = () => {
        CurrentUserUtils.propertiesWidth = 0;
    }

    @computed get propertiesView() {
        TraceMobx();
        return <div className="mainView-propertiesView" style={{
            overflow: this.propertiesWidth() < 15 ? "hidden" : undefined
        }}>
            <PropertiesView
                width={this.propertiesWidth()}
                height={this._panelHeight}
                renderDepth={1}
                ScreenToLocalTransform={Transform.Identity}
                onDown={this.closeProperties}
            />
        </div>;
    }

    @computed get mainInnerContent() {
        const rightFlyout = this.propertiesWidth() - 1;
        return <>
            {this.menuPanel}
            <div style={{ display: "contents", flexDirection: "row", position: "relative" }}>
                <div className="mainView-flyoutContainer" style={{ width: this.flyoutWidth }}>
                    {this.flyoutWidth !== 0 ? <div className="mainView-libraryHandle"
                        onPointerDown={this.onFlyoutPointerDown}
                        style={{ backgroundColor: 'lightgrey' }}>
                        <span title="library View Dragger" style={{
                            width: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "100%" : "3vw",
                            //height: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "100%" : "100vh",
                            position: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "absolute" : "fixed",
                            top: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "" : "0"
                        }} />
                        <div className="mainview-libraryHandle-icon">
                            <FontAwesomeIcon icon="chevron-left" color="black" size="sm" /> </div>
                    </div> : null}
                    <div className="mainView-libraryFlyout" style={{
                        //transformOrigin: this._flyoutTranslate ? "" : "left center",
                        transition: this._flyoutTranslate ? "" : "width .5s",
                        //transform: `scale(${this._flyoutTranslate ? 1 : 0.8})`,
                        boxShadow: this._flyoutTranslate ? "" : "rgb(156, 147, 150) 0.2vw 0.2vw 0.2vw"
                    }}>
                        {this.flyout}
                        {this.expandButton}
                    </div>
                </div>
                {this.dockingContent}
                {this.showProperties ? (null) :
                    <div className="mainView-propertiesDragger" title="Properties View Dragger" onPointerDown={this.onPropertiesPointerDown}
                        style={{ right: rightFlyout, top: "50%" }}>
                        <div className="mainView-propertiesDragger-icon">
                            <FontAwesomeIcon icon={this.propertiesIcon} color="white" size="sm" /> </div>
                    </div>
                }
                {this.propertiesWidth() < 10 ? (null) :
                    <div style={{ width: this.propertiesWidth() }}> {this.propertiesView} </div>}
            </div>
        </>;
    }

    @computed get mainContent() {
        const n = (CollectionMenu.Instance?.Pinned ? 1 : 0);
        const height = `calc(100% - ${n * Number(ANTIMODEMENU_HEIGHT.replace("px", ""))}px)`;
        const pinned = FormatShapePane.Instance?.Pinned;
        const innerContent = this.mainInnerContent;
        return !this.userDoc ? (null) : (
            <Measure offset onResize={this.onResize}>
                {({ measureRef }) =>
                    <div className="mainView-mainContent" ref={measureRef} style={{
                        color: this.darkScheme ? "rgb(205,205,205)" : "black",
                        //change to times 2 for both pinned
                        height,
                        width: pinned ? `calc(100% - 200px)` : "100%"
                    }} >
                        {innerContent}
                    </div>
                }
            </Measure>);
    }

    public static expandFlyout = action(() => {
        MainView.Instance._flyoutTranslate = true;
        MainView.Instance.flyoutWidth = (MainView.Instance.flyoutWidth || 250);

    });

    @computed get expandButton() {
        return !this._flyoutTranslate ? (<div className="mainView-expandFlyoutButton" title="Re-attach sidebar" onPointerDown={MainView.expandFlyout}></div>) : (null);
    }

    addButtonDoc = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg: boolean, doc) => flg && Doc.AddDocToList(Doc.UserDoc().dockedBtns as Doc, "data", doc), true);
    remButtonDoc = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg: boolean, doc) => flg && Doc.RemoveDocFromList(Doc.UserDoc().dockedBtns as Doc, "data", doc), true);
    moveButtonDoc = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => this.remButtonDoc(doc) && addDocument(doc);

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
                    backgroundColor={this.defaultBackgroundColors}
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
                    docFilters={returnEmptyFilter}
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

    @computed get snapLines() {
        return !Doc.UserDoc().showSnapLines ? (null) : <div className="mainView-snapLines">
            <svg style={{ width: "100%", height: "100%" }}>
                {SnappingManager.horizSnapLines().map(l => <line x1="0" y1={l} x2="2000" y2={l} stroke="black" opacity={0.3} strokeWidth={0.5} strokeDasharray={"1 1"} />)}
                {SnappingManager.vertSnapLines().map(l => <line y1="0" x1={l} y2="2000" x2={l} stroke="black" opacity={0.3} strokeWidth={0.5} strokeDasharray={"1 1"} />)}
            </svg>
        </div>;
    }

    @computed get inkResources() {
        return <svg width={0} height={0}>
            <defs>
                <filter id="inkSelectionHalo">
                    <feColorMatrix type="matrix"
                        result="color"
                        values="1 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0">
                    </feColorMatrix>
                    <feGaussianBlur in="color" stdDeviation="4" result="blur"></feGaussianBlur>
                    <feOffset in="blur" dx="0" dy="0" result="offset"></feOffset>
                    <feMerge>
                        <feMergeNode in="bg"></feMergeNode>
                        <feMergeNode in="offset"></feMergeNode>
                        <feMergeNode in="SourceGraphic"></feMergeNode>
                    </feMerge>
                </filter>
            </defs>
        </svg>;
    }

    @computed get search() {
        return <div className="mainView-searchPanel">
            {/* <div style={{ float: "left", marginLeft: "10px" }}>{Doc.CurrentUserEmail}</div> */}
            <div><DocumentView Document={this.searchDoc!}
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
                docFilters={returnEmptyFilter}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
            /></div>
        </div>;
    }

    render() {
        return (<div className={"mainView-container" + (this.darkScheme ? "-dark" : "")} ref={this._mainViewRef}>

            {this.inkResources}
            <DictationOverlay />
            <SharingManager />
            <SettingsManager />
            <GroupManager />
            <GoogleAuthenticationManager />
            <HypothesisAuthenticationManager />
            <DocumentDecorations />
            {this.search}
            <CollectionMenu />
            <FormatShapePane />
            <div style={{ display: "none" }}><RichTextMenu key="rich" /></div>
            {LinkDescriptionPopup.descriptionPopup ? <LinkDescriptionPopup /> : null}
            {DocumentLinksButton.EditLink ? <LinkMenu location={DocumentLinksButton.EditLinkLoc} docView={DocumentLinksButton.EditLink} addDocTab={DocumentLinksButton.EditLink.props.addDocTab} changeFlyout={emptyFunction} /> : (null)}
            {LinkDocPreview.LinkInfo ? <LinkDocPreview location={LinkDocPreview.LinkInfo.Location} backgroundColor={this.defaultBackgroundColors}
                linkDoc={LinkDocPreview.LinkInfo.linkDoc} linkSrc={LinkDocPreview.LinkInfo.linkSrc} href={LinkDocPreview.LinkInfo.href}
                addDocTab={LinkDocPreview.LinkInfo.addDocTab} /> : (null)}
            <GestureOverlay >
                {this.mainContent}
            </GestureOverlay>
            <PreviewCursor />
            <TaskCompletionBox />
            <ContextMenu />
            <FormatShapePane />
            <RadialMenu />
            <PDFMenu />
            <MarqueeOptionsMenu />

            <OverlayView />
            <TimelineMenu />
            {this.snapLines}
        </div >);
    }
}
Scripting.addGlobal(function freezeSidebar() { MainView.expandFlyout(); });
Scripting.addGlobal(function toggleComicMode() { Doc.UserDoc().fontFamily = "Comic Sans MS"; Doc.UserDoc().renderStyle = Doc.UserDoc().renderStyle === "comic" ? undefined : "comic"; });
Scripting.addGlobal(function copyWorkspace() {
    const copiedWorkspace = Doc.MakeCopy(Cast(Doc.UserDoc().activeWorkspace, Doc, null), true);
    const workspaces = Cast(Doc.UserDoc().myWorkspaces, Doc, null);
    Doc.AddDocToList(workspaces, "data", copiedWorkspace);
    // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
    setTimeout(() => MainView.Instance.openWorkspace(copiedWorkspace), 0);
});
