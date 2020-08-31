import { library } from '@fortawesome/fontawesome-svg-core';
import { faBuffer, faHireAHelper } from '@fortawesome/free-brands-svg-icons';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, reaction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Measure from 'react-measure';
import { Doc, DocListCast, Opt } from '../../fields/Doc';
import { List } from '../../fields/List';
import { PrefetchProxy } from '../../fields/Proxy';
import { BoolCast, PromiseValue, StrCast } from '../../fields/Types';
import { TraceMobx } from '../../fields/util';
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnOne, returnTrue, returnZero, setupMoveUpEvents, simulateMouseClick, Utils } from '../../Utils';
import { GoogleAuthenticationManager } from '../apis/GoogleAuthenticationManager';
import { DocServer } from '../DocServer';
import { Docs } from '../documents/Documents';
import { DocumentType } from '../documents/DocumentTypes';
import { CurrentUserUtils } from '../util/CurrentUserUtils';
import { DocumentManager } from '../util/DocumentManager';
import { GroupManager } from '../util/GroupManager';
import { HistoryUtil } from '../util/History';
import { Hypothesis } from '../util/HypothesisUtils';
import { Scripting } from '../util/Scripting';
import { SettingsManager } from '../util/SettingsManager';
import { SharingManager } from '../util/SharingManager';
import { SnappingManager } from '../util/SnappingManager';
import { Transform } from '../util/Transform';
import { TimelineMenu } from './animationtimeline/TimelineMenu';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { MarqueeOptionsMenu } from './collections/collectionFreeForm/MarqueeOptionsMenu';
import { CollectionLinearView } from './collections/CollectionLinearView';
import { CollectionMenu } from './collections/CollectionMenu';
import { CollectionViewType } from './collections/CollectionView';
import { ContextMenu } from './ContextMenu';
import { DictationOverlay } from './DictationOverlay';
import { DocumentDecorations } from './DocumentDecorations';
import { FormatShapePane } from "./FormatShapePane";
import { GestureOverlay } from './GestureOverlay';
import { SEARCH_PANEL_HEIGHT } from './globalCssVariables.scss';
import { KeyManager } from './GlobalKeyHandler';
import { LinkMenu } from './linking/LinkMenu';
import "./MainView.scss";
import { AudioBox } from './nodes/AudioBox';
import { DocumentLinksButton } from './nodes/DocumentLinksButton';
import { DocumentView } from './nodes/DocumentView';
import { FormattedTextBox } from './nodes/formattedText/FormattedTextBox';
import { LinkDescriptionPopup } from './nodes/LinkDescriptionPopup';
import { LinkDocPreview } from './nodes/LinkDocPreview';
import { RadialMenu } from './nodes/RadialMenu';
import { TaskCompletionBox } from './nodes/TaskCompletedBox';
import { WebBox } from './nodes/WebBox';
import { OverlayView } from './OverlayView';
import { PDFMenu } from './pdf/PDFMenu';
import { PreviewCursor } from './PreviewCursor';
import { PropertiesView } from './PropertiesView';
import { SearchBox } from './search/SearchBox';

@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    private _buttonBarHeight = 36;
    private _docBtnRef = React.createRef<HTMLDivElement>();
    private _mainViewRef = React.createRef<HTMLDivElement>();
    private _lastButton: Doc | undefined;

    @observable private _panelWidth: number = 0;
    @observable private _panelHeight: number = 0;
    @observable private _flyoutTranslate: boolean = false;
    @observable private _sidebarContent: any = this.userDoc?.sidebar;
    @observable private _panelContent: string = "none";
    @observable public flyoutWidth: number = 0;

    @computed private get topOffset() { return (CollectionMenu.Instance?.Pinned ? 35 : 0) + Number(SEARCH_PANEL_HEIGHT.replace("px", "")); }
    @computed private get userDoc() { return Doc.UserDoc(); }
    @computed private get darkScheme() { return BoolCast(CurrentUserUtils.ActiveDashboard?.darkScheme); }
    @computed private get mainContainer() { return this.userDoc ? CurrentUserUtils.ActiveDashboard : CurrentUserUtils.GuestDashboard; }
    @computed public get mainFreeform(): Opt<Doc> { return (docs => (docs && docs.length > 1) ? docs[1] : undefined)(DocListCast(this.mainContainer!.data)); }

    propertiesWidth = () => Math.max(0, Math.min(this._panelWidth - 50, CurrentUserUtils.propertiesWidth || 0));

    componentDidMount() {
        DocServer.setPlaygroundFields(["dataTransition", "_viewTransition", "_panX", "_panY", "_viewScale", "_viewType", "_chromeStatus"]); // can play with these fields on someone else's

        DocServer.GetRefField("rtfProto").then(proto => (proto instanceof Doc) && reaction(() => StrCast(proto.BROADCAST_MESSAGE), msg => msg && alert(msg)));

        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode!.insertBefore(tag, firstScriptTag);
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.addEventListener("keydown", KeyManager.Instance.handle);
        window.addEventListener("paste", KeyManager.Instance.paste as any);
        document.addEventListener("dash", (e: any) => {  // event used by chrome plugin to tell Dash which document to focus on
            const id = FormattedTextBox.GetDocFromUrl(e.detail);
            DocServer.GetRefField(id).then(doc => (doc instanceof Doc) ? DocumentManager.Instance.jumpToDocument(doc, false, undefined) : (null));
        });
        document.addEventListener("linkAnnotationToDash", Hypothesis.linkListener);
    }

    componentWillUnMount() {
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.removeEventListener("pointerdown", this.globalPointerDown);
        window.removeEventListener("paste", KeyManager.Instance.paste as any);
        document.removeEventListener("linkAnnotationToDash", Hypothesis.linkListener);
    }

    constructor(props: Readonly<{}>) {
        super(props);
        MainView.Instance = this;
        this._sidebarContent.proto = undefined;
        CurrentUserUtils._urlState = HistoryUtil.parseUrl(window.location) || {} as any;

        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });

        if (window.location.pathname !== "/home") {
            const pathname = window.location.pathname.substr(1).split("/");
            if (pathname.length > 1) {
                if (pathname[0] === "doc") {
                    CurrentUserUtils.MainDocId = pathname[1];
                    if (!this.userDoc) {
                        DocServer.GetRefField(CurrentUserUtils.MainDocId).then(action(field => field instanceof Doc && (CurrentUserUtils.GuestTarget = field)));
                    }
                }
            }
        }

        library.add(fa.faEdit, fa.faTrash, fa.faTrashAlt, fa.faShare, fa.faDownload, fa.faExpandArrowsAlt, fa.faLayerGroup, fa.faExternalLinkAlt, fa.faCalendar,
            fa.faSquare, fa.faConciergeBell, fa.faWindowRestore, fa.faFolder, fa.faMapPin, fa.faMapMarker, fa.faFingerprint, fa.faCrosshairs, fa.faDesktop, fa.faUnlock,
            fa.faLock, fa.faLaptopCode, fa.faMale, fa.faCopy, fa.faHandPointLeft, fa.faHandPointRight, fa.faCompass, fa.faSnowflake, fa.faMicrophone, fa.faKeyboard,
            fa.faQuestion, fa.faTasks, fa.faPalette, fa.faAngleLeft, fa.faAngleRight, fa.faBell, fa.faCamera, fa.faExpand, fa.faCaretDown, fa.faCaretLeft, fa.faCaretRight,
            fa.faCaretSquareDown, fa.faCaretSquareRight, fa.faArrowsAltH, fa.faPlus, fa.faMinus, fa.faTerminal, fa.faToggleOn, fa.faFile, fa.faLocationArrow,
            fa.faSearch, fa.faFileDownload, fa.faFileUpload, fa.faStop, fa.faCalculator, fa.faWindowMaximize, fa.faAddressCard, fa.faQuestionCircle, fa.faArrowLeft,
            fa.faArrowRight, fa.faArrowDown, fa.faArrowUp, fa.faBolt, fa.faBullseye, fa.faCaretUp, fa.faCat, fa.faCheck, fa.faChevronRight, fa.faChevronLeft, fa.faChevronDown, fa.faChevronUp,
            fa.faClone, fa.faCloudUploadAlt, fa.faCommentAlt, fa.faCompressArrowsAlt, fa.faCut, fa.faEllipsisV, fa.faEraser, fa.faExclamation, fa.faFileAlt,
            fa.faFileAudio, fa.faFilePdf, fa.faFilm, fa.faFilter, fa.faFont, fa.faGlobeAmericas, fa.faGlobeAsia, fa.faHighlighter, fa.faLongArrowAltRight, fa.faMousePointer,
            fa.faMusic, fa.faObjectGroup, fa.faPause, fa.faPen, fa.faPenNib, fa.faPhone, fa.faPlay, fa.faPortrait, fa.faRedoAlt, fa.faStamp, fa.faStickyNote,
            fa.faTimesCircle, fa.faThumbtack, fa.faTree, fa.faTv, fa.faUndoAlt, fa.faVideo, fa.faAsterisk, fa.faBrain, fa.faImage, fa.faPaintBrush, fa.faTimes,
            fa.faEye, fa.faArrowsAlt, fa.faQuoteLeft, fa.faSortAmountDown, fa.faAlignLeft, fa.faAlignCenter, fa.faAlignRight, fa.faHeading, fa.faRulerCombined,
            fa.faFillDrip, fa.faLink, fa.faUnlink, fa.faBold, fa.faItalic, fa.faClipboard, fa.faUnderline, fa.faStrikethrough, fa.faSuperscript, fa.faSubscript,
            fa.faIndent, fa.faEyeDropper, fa.faPaintRoller, fa.faBars, fa.faBrush, fa.faShapes, fa.faEllipsisH, fa.faHandPaper, fa.faMap, fa.faUser, faHireAHelper,
            fa.faDesktop, fa.faTrashRestore, fa.faUsers, fa.faWrench, fa.faCog, fa.faMap, fa.faBellSlash, fa.faExpandAlt, fa.faArchive, fa.faBezierCurve, fa.faCircle,
            fa.faLongArrowAltRight, fa.faPenFancy, fa.faAngleDoubleRight, faBuffer, fa.faExpand, fa.faUndo, fa.faSlidersH, fa.faAngleDoubleLeft, fa.faAngleUp,
            fa.faAngleDown, fa.faPlayCircle, fa.faClock, fa.faRocket, fa.faExchangeAlt, faBuffer, fa.faHashtag, fa.faAlignJustify, fa.faCheckSquare, fa.faListUl,
            fa.faWindowMinimize, fa.faWindowRestore, fa.faTextWidth, fa.faTextHeight, fa.faClosedCaptioning, fa.faInfoCircle, fa.faTag, fa.faSyncAlt, fa.faPhotoVideo,
            fa.faArrowAltCircleDown, fa.faArrowAltCircleUp, fa.faArrowAltCircleLeft, fa.faArrowAltCircleRight, fa.faStopCircle, fa.faCheckCircle, fa.faGripVertical,
            fa.faSortUp, fa.faSortDown, fa.faTable, fa.faTh, fa.faThList, fa.faProjectDiagram, fa.faSignature, fa.faColumns, fa.faChevronCircleUp, fa.faUpload,
            fa.faBraille, fa.faChalkboard, fa.faPencilAlt, fa.faEyeSlash, fa.faSmile, fa.faIndent, fa.faOutdent, fa.faChartBar, fa.faBan, fa.faPhoneSlash, fa.faGripLines);
        this.initEventListeners();
        this.initAuthenticationRouters();
    }

    globalPointerDown = action((e: PointerEvent) => {
        AudioBox.Enabled = true;
        const targets = document.elementsFromPoint(e.x, e.y);
        if (targets.length) {
            if (targets[0].className.toString().indexOf("contextMenu") === -1) {
                ContextMenu.Instance.closeMenu();
            }
            if (targets[0].className.toString() !== "timeline-menu-desc" && targets[0].className.toString() !== "timeline-menu-item" && targets[0].className.toString() !== "timeline-menu-input") {
                TimelineMenu.Instance.closeMenu();
            }
            if (SearchBox.Instance._searchbarOpen) {
                const check = targets.some((thing) =>
                    (thing.className === "collectionSchemaView-searchContainer" || (thing as any)?.dataset["icon"] === "filter" ||
                        thing.className === "collectionSchema-header-menuOptions"));
                !check && SearchBox.Instance.resetSearch(true);
            }
        }

    });

    initEventListeners = () => {
        window.addEventListener("drop", (e) => { e.preventDefault(); }, false); // drop event handler
        window.addEventListener("dragover", (e) => { e.preventDefault(); }, false); // drag event handler
        // click interactions for the context menu
        document.addEventListener("pointerdown", this.globalPointerDown);
    }

    initAuthenticationRouters = async () => {
        // Load the user's active dashboard, or create a new one if initial session after signup
        const received = CurrentUserUtils.MainDocId;
        if (received && !this.userDoc) {
            reaction(() => CurrentUserUtils.GuestTarget, target => target && CurrentUserUtils.createNewDashboard(Doc.UserDoc()), { fireImmediately: true });
        } else {
            if (received && CurrentUserUtils._urlState.sharing) {
                reaction(() => CollectionDockingView.Instance && CollectionDockingView.Instance.initialized,
                    initialized => initialized && received && DocServer.GetRefField(received).then(docField => {
                        if (docField instanceof Doc && docField._viewType !== CollectionViewType.Docking) {
                            CollectionDockingView.AddSplit(docField, "right");
                        }
                    }),
                );
            }
            const activeDash = PromiseValue(this.userDoc.activeDashboard);
            activeDash.then(dash => {
                if (dash instanceof Doc) CurrentUserUtils.openDashboard(this.userDoc, dash);
                else CurrentUserUtils.createNewDashboard(this.userDoc);
            });
        }
    }

    @action
    createNewPresentation = async () => {
        if (!await this.userDoc.myPresentations) {
            this.userDoc.myPresentations = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "PRESENTATION TRAILS", _height: 100, forceActive: true, boxShadow: "0 0", lockedPosition: true, treeViewOpen: true, system: true
            }));
        }
        const pres = Docs.Create.PresDocument(new List<Doc>(),
            { title: "Untitled Presentation", _viewType: CollectionViewType.Stacking, _width: 400, _height: 500, targetDropAction: "alias", _chromeStatus: "replaced", boxShadow: "0 0", system: true });
        CollectionDockingView.AddSplit(pres, "right");
        this.userDoc.activePresentation = pres;
        Doc.AddDocToList(this.userDoc.myPresentations as Doc, "data", pres);
    }

    onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }

    @action
    onResize = (r: any) => {
        this._panelWidth = r.offset.width;
        this._panelHeight = r.offset.height;
    }

    getPWidth = () => this._panelWidth - this.propertiesWidth();
    getPHeight = () => this._panelHeight;
    getContentsHeight = () => this._panelHeight - this._buttonBarHeight;

    defaultBackgroundColors = (doc: Opt<Doc>, renderDepth: number) => {
        if (doc?.type === DocumentType.COL) {
            const system = Doc.IsSystem(doc);
            return system ? "lightgrey" : StrCast(renderDepth > 0 ? Doc.UserDoc().activeCollectionNestedBackground : Doc.UserDoc().activeCollectionBackground);
        }
        if (this.darkScheme) {
            switch (doc?.type) {
                case DocumentType.FONTICON: return "white";
                case DocumentType.RTF || DocumentType.LABEL || DocumentType.BUTTON: return "#2d2d2d";
                case DocumentType.LINK:
                case DocumentType.COL:
                    if (doc._viewType !== CollectionViewType.Freeform && doc._viewType !== CollectionViewType.Time) return "rgb(62,62,62)";
                default: return "black";
            }
        } else {
            switch (doc?.type) {
                case DocumentType.FONTICON: return "black";
                case DocumentType.RTF: return "#f1efeb";
                case DocumentType.BUTTON:
                case DocumentType.LABEL: return "lightgray";
                case DocumentType.LINK:
                case DocumentType.COL:
                    if (doc._viewType !== CollectionViewType.Freeform && doc._viewType !== CollectionViewType.Time) return "lightgray";
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
            searchFilterDocs={returnEmptyDoclist}
            ContainingCollectionView={undefined}
            ContainingCollectionDoc={undefined}
            renderDepth={-1}
        />;
    }

    @computed get dockingContent() {
        TraceMobx();
        const width = this.flyoutWidth + this.propertiesWidth();
        return <div className="mainContent-div" onDrop={this.onDrop} style={{ width: `calc(100% - ${width}px)`, height: "100%" }}>
            {!this.mainContainer ? (null) : this.mainDocView}
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
                this.flyoutWidth = Math.max(e.clientX - 58, 0);
                if (this.flyoutWidth < 5) {
                    this._panelContent = "none";
                    this._lastButton && (this._lastButton.color = "white");
                    this._lastButton && (this._lastButton._backgroundColor = "");
                }
                return false;
            }), emptyFunction, action(() => {
                if (this.flyoutWidth < 15) this.expandFlyout();
                else this.closeFlyout();
            }));
        }
    }

    flyoutWidthFunc = () => this.flyoutWidth;
    addDocTabFunc = (doc: Doc, where: string, libraryPath?: Doc[]): boolean => {
        return where === "close" ? CollectionDockingView.CloseSplit(doc) :
            doc.dockingConfig ? CurrentUserUtils.openDashboard(Doc.UserDoc(), doc) : CollectionDockingView.AddSplit(doc, "right");
    }
    sidebarScreenToLocal = () => new Transform(0, (CollectionMenu.Instance.Pinned ? -35 : 0) - Number(SEARCH_PANEL_HEIGHT.replace("px", "")), 1);
    mainContainerXf = () => this.sidebarScreenToLocal().translate(-58, 0);

    @computed get flyout() {
        if (!this._sidebarContent) return null;
        return <div className="mainView-libraryFlyout">
            <div className="mainView-contentArea">
                <DocumentView
                    Document={this._sidebarContent}
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
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    relative={true}
                    forcedBackgroundColor={() => "lightgrey"}
                />
            </div>
            {this.docButtons}
        </div>;
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
                searchFilterDocs={returnEmptyDoclist}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                relative={true}
                scriptContext={this}
            />
        </div>;
    }


    @action
    closeFlyout = () => {
        this._lastButton && (this._lastButton.color = "white");
        this._lastButton && (this._lastButton._backgroundColor = "");
        this._panelContent = "none";
        this.flyoutWidth = 0;
    }

    @action
    selectMenu = (button: Doc) => {
        const title = StrCast(Doc.GetProto(button).title);
        this._lastButton && (this._lastButton.color = "white");
        this._lastButton && (this._lastButton._backgroundColor = "");
        if (this._panelContent === title && this.flyoutWidth !== 0) {
            this._panelContent = "none";
            this.flyoutWidth = 0;
        } else {
            switch (this._panelContent = title) {
                case "Settings":
                    SettingsManager.Instance.open();
                    this.flyoutWidth = 0;
                    break;
                case "Catalog":
                    SearchBox.Instance._searchFullDB = "My Stuff";
                    SearchBox.Instance.newsearchstring = "";
                    SearchBox.Instance.enter(undefined);
                    this.flyoutWidth = 0;
                    break;
                default:
                    this._sidebarContent.proto = button.target as any;
                    this.expandFlyout();
                    button._backgroundColor = "lightgrey";
                    button.color = "black";
                    this._lastButton = button;
            }
        }
        return true;
    }

    @computed get propertiesView() {
        TraceMobx();
        return <div className="mainView-propertiesView">
            <PropertiesView
                width={this.propertiesWidth()}
                height={this.getContentsHeight()}
                renderDepth={1}
                ScreenToLocalTransform={Transform.Identity}
                onDown={action(() => CurrentUserUtils.propertiesWidth = 0)} />
        </div>;
    }

    @computed get mainInnerContent() {
        return <>
            {this.menuPanel}
            <div className="mainView-innerContent" >
                <div className="mainView-flyoutContainer" style={{ width: this.flyoutWidth }}>
                    {this.flyoutWidth === 0 ? (null) :
                        <div className="mainView-libraryHandle" onPointerDown={this.onFlyoutPointerDown} >
                            <span className={`mainView-libraryDragger${this._flyoutTranslate ? "" : "-out"}`} />
                            <div className="mainview-libraryHandle-icon">
                                <FontAwesomeIcon icon="chevron-left" color="black" size="sm" />
                            </div>
                        </div>}
                    <div className={`mainView-libraryFlyout${this._flyoutTranslate ? "" : "-out"}`} >
                        {this.flyout}
                        {this.expandButton}
                    </div>
                </div>
                {this.dockingContent}
                <div className="mainView-propertiesDragger" onPointerDown={this.onPropertiesPointerDown} style={{ right: this.propertiesWidth() - 1 }}>
                    <div className="mainView-propertiesDragger-icon">
                        <FontAwesomeIcon icon={this.propertiesWidth() < 10 ? "chevron-left" : "chevron-right"} color="black" size="sm" />
                    </div>
                </div>
                {this.propertiesWidth() < 10 ? (null) : this.propertiesView}
            </div>
        </>;
    }

    @computed get mainContent() {
        const height = `calc(100% - ${this.topOffset}px)`;
        const pinned = FormatShapePane.Instance?.Pinned;
        const innerContent = this.mainInnerContent;
        return !this.userDoc ? (null) : (
            <Measure offset onResize={this.onResize}>
                {({ measureRef }) =>
                    <div className="mainView-mainContent" ref={measureRef} style={{
                        color: this.darkScheme ? "rgb(205,205,205)" : "black",
                        height,
                        width: pinned ? `calc(100% - 200px)` : "100%"
                    }} >
                        {innerContent}
                    </div>
                }
            </Measure>);
    }

    expandFlyout = action(() => {
        this._flyoutTranslate = true;
        this.flyoutWidth = (this.flyoutWidth || 250);
    });

    @computed get expandButton() {
        return !this._flyoutTranslate ? (<div className="mainView-expandFlyoutButton" title="Re-attach sidebar" onPointerDown={this.expandFlyout}></div>) : (null);
    }

    addButtonDoc = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg: boolean, doc) => {
        const ret = flg && Doc.AddDocToList(Doc.UserDoc().dockedBtns as Doc, "data", doc);
        ret && (doc._stayInCollection = undefined);
        return ret;
    }, true)
    remButtonDoc = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg: boolean, doc) => flg && Doc.RemoveDocFromList(Doc.UserDoc().dockedBtns as Doc, "data", doc), true);
    moveButtonDoc = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => this.remButtonDoc(doc) && addDocument(doc);

    buttonBarXf = () => {
        if (!this._docBtnRef.current) return Transform.Identity();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._docBtnRef.current);
        return new Transform(-translateX, -translateY, 1 / scale);
    }

    @computed get docButtons() {
        const dockedBtns = Doc.UserDoc()?.dockedBtns;
        return !(dockedBtns instanceof Doc) ? (null) :
            <div className="mainView-docButtons" ref={this._docBtnRef} style={{ height: !dockedBtns.linearViewIsExpanded ? "42px" : undefined }} >
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
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined} />
            </div>;
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
            <DocumentView Document={CurrentUserUtils.MySearchPanelDoc}
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
                searchFilterDocs={returnEmptyDoclist}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
            />
        </div>;
    }

    @computed get invisibleWebBox() { // see note under the makeLink method in HypothesisUtils.ts
        return !DocumentLinksButton.invisibleWebDoc ? null :
            <div className="mainView-invisibleWebRef" ref={DocumentLinksButton.invisibleWebRef}>
                <WebBox
                    fieldKey={"data"}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    Document={DocumentLinksButton.invisibleWebDoc}
                    LibraryPath={emptyPath}
                    dropAction={"move"}
                    isSelected={returnFalse}
                    select={returnFalse}
                    rootSelected={returnFalse}
                    renderDepth={0}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    ScreenToLocalTransform={Transform.Identity}
                    bringToFront={returnFalse}
                    active={returnFalse}
                    whenActiveChanged={returnFalse}
                    focus={returnFalse}
                    PanelWidth={() => 500}
                    PanelHeight={() => 800}
                    NativeHeight={() => 500}
                    NativeWidth={() => 800}
                    ContentScaling={returnOne}
                    docFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                />
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
            <DocumentDecorations />
            {this.search}
            <CollectionMenu />
            <FormatShapePane />
            {LinkDescriptionPopup.descriptionPopup ? <LinkDescriptionPopup /> : null}
            {DocumentLinksButton.EditLink ? <LinkMenu docView={DocumentLinksButton.EditLink} addDocTab={DocumentLinksButton.EditLink.props.addDocTab} changeFlyout={emptyFunction} /> : (null)}
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
            <div className="mainView-webRef" ref={this.makeWebRef} />
        </div >);
    }

    makeWebRef = (ele: HTMLDivElement) => {
        reaction(() => DocumentLinksButton.invisibleWebDoc,
            invisibleDoc => {
                ReactDOM.unmountComponentAtNode(ele);
                invisibleDoc && ReactDOM.render(<span title="Drag as document" className="invisible-webbox" >
                    <div className="mainView-webRef" ref={DocumentLinksButton.invisibleWebRef}>
                        <WebBox
                            fieldKey={"data"}
                            ContainingCollectionView={undefined}
                            ContainingCollectionDoc={undefined}
                            Document={invisibleDoc}
                            LibraryPath={emptyPath}
                            dropAction={"move"}
                            isSelected={returnFalse}
                            select={returnFalse}
                            rootSelected={returnFalse}
                            renderDepth={0}
                            addDocTab={returnFalse}
                            pinToPres={returnFalse}
                            ScreenToLocalTransform={Transform.Identity}
                            bringToFront={returnFalse}
                            active={returnFalse}
                            whenActiveChanged={returnFalse}
                            focus={returnFalse}
                            PanelWidth={() => 500}
                            PanelHeight={() => 800}
                            NativeHeight={() => 500}
                            NativeWidth={() => 800}
                            ContentScaling={returnOne}
                            docFilters={returnEmptyFilter}
                            searchFilterDocs={returnEmptyDoclist}
                        />
                    </div>;
                </span>, ele);

                var success = false;
                const onSuccess = () => {
                    success = true;
                    clearTimeout(interval);
                    document.removeEventListener("editSuccess", onSuccess);
                };

                // For some reason, Hypothes.is annotations don't load until a click is registered on the page,
                // so we keep simulating clicks until annotations have loaded and editing is successful
                const interval = setInterval(() => !success && simulateMouseClick(ele, 50, 50, 50, 50), 500);
                setTimeout(() => !success && clearInterval(interval), 10000); // give up if no success after 10s
                document.addEventListener("editSuccess", onSuccess);
            });
    }
}
Scripting.addGlobal(function selectMainMenu(doc: Doc, title: string) { MainView.Instance.selectMenu(doc); });
Scripting.addGlobal(function toggleComicMode() { Doc.UserDoc().fontFamily = "Comic Sans MS"; Doc.UserDoc().renderStyle = Doc.UserDoc().renderStyle === "comic" ? undefined : "comic"; });
