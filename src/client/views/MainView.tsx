import { library } from '@fortawesome/fontawesome-svg-core';
import { faBuffer, faHireAHelper } from '@fortawesome/free-brands-svg-icons';
import * as far from '@fortawesome/free-regular-svg-icons';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Doc, DocListCast, Opt } from '../../fields/Doc';
import { List } from '../../fields/List';
import { PrefetchProxy } from '../../fields/Proxy';
import { BoolCast, PromiseValue, StrCast } from '../../fields/Types';
import { TraceMobx } from '../../fields/util';
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnTrue, setupMoveUpEvents, simulateMouseClick, Utils } from '../../Utils';
import { GoogleAuthenticationManager } from '../apis/GoogleAuthenticationManager';
import { DocServer } from '../DocServer';
import { Docs } from '../documents/Documents';
import { CurrentUserUtils } from '../util/CurrentUserUtils';
import { DocumentManager } from '../util/DocumentManager';
import { GroupManager } from '../util/GroupManager';
import { HistoryUtil } from '../util/History';
import { Hypothesis } from '../util/HypothesisUtils';
import { Scripting } from '../util/Scripting';
import { SelectionManager } from '../util/SelectionManager';
import { SettingsManager } from '../util/SettingsManager';
import { SharingManager } from '../util/SharingManager';
import { SnappingManager } from '../util/SnappingManager';
import { Transform } from '../util/Transform';
import { UndoManager, undoBatch } from '../util/UndoManager';
import { TimelineMenu } from './animationtimeline/TimelineMenu';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { MarqueeOptionsMenu } from './collections/collectionFreeForm/MarqueeOptionsMenu';
import { CollectionLinearView } from './collections/CollectionLinearView';
import { CollectionMenu } from './collections/CollectionMenu';
import { CollectionViewType } from './collections/CollectionView';
import { ContextMenu } from './ContextMenu';
import { DictationOverlay } from './DictationOverlay';
import { DocumentDecorations } from './DocumentDecorations';
import { GestureOverlay } from './GestureOverlay';
import { MENU_PANEL_WIDTH, SEARCH_PANEL_HEIGHT } from './globalCssVariables.scss';
import { KeyManager } from './GlobalKeyHandler';
import { InkStrokeProperties } from './InkStrokeProperties';
import { LinkMenu } from './linking/LinkMenu';
import "./MainView.scss";
import { AudioBox } from './nodes/AudioBox';
import { DocumentLinksButton } from './nodes/DocumentLinksButton';
import { DocumentView, DocumentViewProps } from './nodes/DocumentView';
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
import { DefaultStyleProvider, StyleProp } from './StyleProvider';
import { FieldViewProps } from './nodes/FieldView';
const _global = (window /* browser */ || global /* node */) as any;

@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    private _docBtnRef = React.createRef<HTMLDivElement>();
    private _mainViewRef = React.createRef<HTMLDivElement>();
    @observable public LastButton: Opt<Doc>;
    @observable private _panelWidth: number = 0;
    @observable private _panelHeight: number = 0;
    @observable private _panelContent: string = "none";
    @observable private _sidebarContent: any = this.userDoc?.sidebar;
    @observable private _flyoutWidth: number = 0;

    @computed private get topOffset() { return (CollectionMenu.Instance?.Pinned ? 35 : 0) + Number(SEARCH_PANEL_HEIGHT.replace("px", "")); }
    @computed private get leftOffset() { return this.menuPanelWidth() - 2; }
    @computed private get userDoc() { return Doc.UserDoc(); }
    @computed private get darkScheme() { return BoolCast(CurrentUserUtils.ActiveDashboard?.darkScheme); }
    @computed private get mainContainer() { return this.userDoc ? CurrentUserUtils.ActiveDashboard : CurrentUserUtils.GuestDashboard; }
    @computed public get mainFreeform(): Opt<Doc> { return (docs => (docs && docs.length > 1) ? docs[1] : undefined)(DocListCast(this.mainContainer!.data)); }

    menuPanelWidth = () => Number(MENU_PANEL_WIDTH.replace("px", ""));
    propertiesWidth = () => Math.max(0, Math.min(this._panelWidth - 50, CurrentUserUtils.propertiesWidth || 0));

    componentDidMount() {
        document.getElementById("root")?.addEventListener("scroll", e => ((ele) => ele.scrollLeft = ele.scrollTop = 0)(document.getElementById("root")!));
        const ele = document.getElementById("loader");
        const prog = document.getElementById("dash-progress");
        if (ele && prog) {
            // remove from DOM
            setTimeout(() => {
                clearTimeout();
                prog.style.transition = "1s";
                prog.style.width = "100%";
            }, 0);
            setTimeout(() => ele.outerHTML = '', 1000);
        }
        new InkStrokeProperties();
        this._sidebarContent.proto = undefined;
        DocServer.setPlaygroundFields(["x", "y", "dataTransition", "_delayAutoHeight", "_autoHeight", "_showSidebar", "_sidebarWidthPercent", "_width", "_height", "_viewTransition", "_panX", "_panY", "_viewScale", "_scrollY", "_scrollTop", "hidden", "_curPage", "_viewType", "_chromeStatus"]); // can play with these fields on someone else's

        DocServer.GetRefField("rtfProto").then(proto => (proto instanceof Doc) && reaction(() => StrCast(proto.BROADCAST_MESSAGE), msg => msg && alert(msg)));

        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode!.insertBefore(tag, firstScriptTag);
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.addEventListener("keydown", KeyManager.Instance.handle);
        window.removeEventListener("keyup", KeyManager.Instance.unhandle);
        window.addEventListener("keyup", KeyManager.Instance.unhandle);
        window.addEventListener("paste", KeyManager.Instance.paste as any);
        document.addEventListener("dash", (e: any) => {  // event used by chrome plugin to tell Dash which document to focus on
            const id = FormattedTextBox.GetDocFromUrl(e.detail);
            DocServer.GetRefField(id).then(doc => (doc instanceof Doc) ? DocumentManager.Instance.jumpToDocument(doc, false, undefined) : (null));
        });
        document.addEventListener("linkAnnotationToDash", Hypothesis.linkListener);
        this.initEventListeners();
    }

    componentWillUnMount() {
        window.removeEventListener("keyup", KeyManager.Instance.unhandle);
        window.removeEventListener("keydown", KeyManager.Instance.handle);
        window.removeEventListener("pointerdown", this.globalPointerDown);
        window.removeEventListener("paste", KeyManager.Instance.paste as any);
        document.removeEventListener("linkAnnotationToDash", Hypothesis.linkListener);
    }

    constructor(props: Readonly<{}>) {
        super(props);
        MainView.Instance = this;
        CurrentUserUtils._urlState = HistoryUtil.parseUrl(window.location) || {} as any;

        // causes errors to be generated when modifying an observable outside of an action
        configure({ enforceActions: "observed" });

        if (window.location.pathname !== "/home") {
            const pathname = window.location.pathname.substr(1).split("/");
            if (pathname.length > 1 && pathname[0] === "doc") {
                CurrentUserUtils.MainDocId = pathname[1];
                !this.userDoc && DocServer.GetRefField(pathname[1]).then(action(field => field instanceof Doc && (CurrentUserUtils.GuestTarget = field)));
            }
        }

        library.add(fa.faEdit, fa.faTrash, fa.faTrashAlt, fa.faShare, fa.faDownload, fa.faExpandArrowsAlt, fa.faLayerGroup, fa.faExternalLinkAlt, fa.faCalendar,
            fa.faSquare, far.faSquare, fa.faConciergeBell, fa.faWindowRestore, fa.faFolder, fa.faMapPin, fa.faMapMarker, fa.faFingerprint, fa.faCrosshairs, fa.faDesktop, fa.faUnlock,
            fa.faLock, fa.faLaptopCode, fa.faMale, fa.faCopy, fa.faHandPointLeft, fa.faHandPointRight, fa.faCompass, fa.faSnowflake, fa.faMicrophone, fa.faKeyboard,
            fa.faQuestion, fa.faTasks, fa.faPalette, fa.faAngleLeft, fa.faAngleRight, fa.faBell, fa.faCamera, fa.faExpand, fa.faCaretDown, fa.faCaretLeft, fa.faCaretRight,
            fa.faCaretSquareDown, fa.faCaretSquareRight, fa.faArrowsAltH, fa.faPlus, fa.faMinus, fa.faTerminal, fa.faToggleOn, fa.faFile, fa.faLocationArrow,
            fa.faSearch, fa.faFileDownload, fa.faFileUpload, fa.faStop, fa.faCalculator, fa.faWindowMaximize, fa.faAddressCard, fa.faQuestionCircle, fa.faArrowLeft,
            fa.faArrowRight, fa.faArrowDown, fa.faArrowUp, fa.faBolt, fa.faBullseye, fa.faCaretUp, fa.faCat, fa.faCheck, fa.faChevronRight, fa.faChevronLeft, fa.faChevronDown, fa.faChevronUp,
            fa.faClone, fa.faCloudUploadAlt, fa.faCommentAlt, fa.faCompressArrowsAlt, fa.faCut, fa.faEllipsisV, fa.faEraser, fa.faExclamation, fa.faFileAlt,
            fa.faFileAudio, fa.faFileVideo, fa.faFilePdf, fa.faFilm, fa.faFilter, fa.faFont, fa.faGlobeAmericas, fa.faGlobeAsia, fa.faHighlighter, fa.faLongArrowAltRight, fa.faMousePointer,
            fa.faMusic, fa.faObjectGroup, fa.faPause, fa.faPen, fa.faPenNib, fa.faPhone, fa.faPlay, fa.faPortrait, fa.faRedoAlt, fa.faStamp, fa.faStickyNote,
            fa.faTimesCircle, fa.faThumbtack, fa.faTree, fa.faTv, fa.faUndoAlt, fa.faVideo, fa.faAsterisk, fa.faBrain, fa.faImage, fa.faPaintBrush, fa.faTimes,
            fa.faEye, fa.faArrowsAlt, fa.faQuoteLeft, fa.faSortAmountDown, fa.faAlignLeft, fa.faAlignCenter, fa.faAlignRight, fa.faHeading, fa.faRulerCombined,
            fa.faFillDrip, fa.faLink, fa.faUnlink, fa.faBold, fa.faItalic, fa.faClipboard, fa.faUnderline, fa.faStrikethrough, fa.faSuperscript, fa.faSubscript,
            fa.faIndent, fa.faEyeDropper, fa.faPaintRoller, fa.faBars, fa.faBrush, fa.faShapes, fa.faEllipsisH, fa.faHandPaper, fa.faMap, fa.faUser, faHireAHelper,
            fa.faTrashRestore, fa.faUsers, fa.faWrench, fa.faCog, fa.faMap, fa.faBellSlash, fa.faExpandAlt, fa.faArchive, fa.faBezierCurve, fa.faCircle, far.faCircle,
            fa.faLongArrowAltRight, fa.faPenFancy, fa.faAngleDoubleRight, faBuffer, fa.faExpand, fa.faUndo, fa.faSlidersH, fa.faAngleDoubleLeft, fa.faAngleUp,
            fa.faAngleDown, fa.faPlayCircle, fa.faClock, fa.faRocket, fa.faExchangeAlt, faBuffer, fa.faHashtag, fa.faAlignJustify, fa.faCheckSquare, fa.faListUl,
            fa.faWindowMinimize, fa.faWindowRestore, fa.faTextWidth, fa.faTextHeight, fa.faClosedCaptioning, fa.faInfoCircle, fa.faTag, fa.faSyncAlt, fa.faPhotoVideo,
            fa.faArrowAltCircleDown, fa.faArrowAltCircleUp, fa.faArrowAltCircleLeft, fa.faArrowAltCircleRight, fa.faStopCircle, fa.faCheckCircle, fa.faGripVertical,
            fa.faSortUp, fa.faSortDown, fa.faTable, fa.faTh, fa.faThList, fa.faProjectDiagram, fa.faSignature, fa.faColumns, fa.faChevronCircleUp, fa.faUpload, fa.faBorderAll,
            fa.faBraille, fa.faChalkboard, fa.faPencilAlt, fa.faEyeSlash, fa.faSmile, fa.faIndent, fa.faOutdent, fa.faChartBar, fa.faBan, fa.faPhoneSlash, fa.faGripLines, fa.faBookmark);
        this.initAuthenticationRouters();
    }

    globalPointerDown = action((e: PointerEvent) => {
        AudioBox.Enabled = true;
        const targets = document.elementsFromPoint(e.x, e.y);
        if (targets.length) {
            const targClass = targets[0].className.toString();
            if (SearchBox.Instance._searchbarOpen || SearchBox.Instance.open) {
                const check = targets.some((thing) =>
                    (thing.className === "collectionSchemaView-searchContainer" || (thing as any)?.dataset.icon === "filter" ||
                        thing.className === "collectionSchema-header-menuOptions"));
                !check && SearchBox.Instance.resetSearch(true);
            }
            !targClass.includes("contextMenu") && ContextMenu.Instance.closeMenu();
            !["timeline-menu-desc", "timeline-menu-item", "timeline-menu-input"].includes(targClass) && TimelineMenu.Instance.closeMenu();
        }
    });

    initEventListeners = () => {
        window.addEventListener("drop", e => e.preventDefault(), false);  // prevent default behavior of navigating to a new web page
        window.addEventListener("dragover", e => e.preventDefault(), false);
        document.addEventListener("pointermove", action(e => SearchBox.Instance._undoBackground = UndoManager.batchCounter ? "#000000a8" : undefined));
        document.addEventListener("pointerdown", this.globalPointerDown);
        document.addEventListener("click", (e: MouseEvent) => {
            if (!e.cancelBubble) {
                const pathstr = (e as any)?.path.map((p: any) => p.classList?.toString()).join();
                if (pathstr.includes("libraryFlyout")) {
                    SelectionManager.DeselectAll();
                }
            }
        }, false);
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
            { title: "Untitled Presentation", _viewType: CollectionViewType.Stacking, _width: 400, _height: 500, targetDropAction: "alias", _chromeStatus: "replaced", boxShadow: "0 0" });
        CollectionDockingView.AddSplit(pres, "right");
        this.userDoc.activePresentation = pres;
        Doc.AddDocToList(this.userDoc.myPresentations as Doc, "data", pres);
    }

    getPWidth = () => this._panelWidth - this.propertiesWidth();
    getPHeight = () => this._panelHeight;
    getContentsHeight = () => this._panelHeight;

    @computed get mainDocView() {
        return <DocumentView
            Document={this.mainContainer!}
            DataDoc={undefined}
            addDocument={undefined}
            addDocTab={this.addDocTabFunc}
            pinToPres={emptyFunction}
            rootSelected={returnTrue}
            removeDocument={undefined}
            ScreenToLocalTransform={Transform.Identity}
            PanelWidth={this.getPWidth}
            PanelHeight={this.getPHeight}
            focus={emptyFunction}
            parentActive={returnTrue}
            whenActiveChanged={emptyFunction}
            bringToFront={emptyFunction}
            docFilters={returnEmptyFilter}
            docRangeFilters={returnEmptyFilter}
            searchFilterDocs={returnEmptyDoclist}
            ContainingCollectionView={undefined}
            ContainingCollectionDoc={undefined}
            renderDepth={-1}
        />;
    }

    @computed get dockingContent() {
        return <div className={`mainContent-div${this._flyoutWidth ? "-flyout" : ""}`} onDrop={e => { e.stopPropagation(); e.preventDefault(); }}
            style={{ minWidth: `calc(100% - ${this._flyoutWidth + this.menuPanelWidth() + this.propertiesWidth()}px)`, width: `calc(100% - ${this._flyoutWidth + this.menuPanelWidth() + this.propertiesWidth()}px)` }}>
            {!this.mainContainer ? (null) : this.mainDocView}
        </div>;
    }

    @action
    onPropertiesPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e,
            action(e => (CurrentUserUtils.propertiesWidth = Math.max(0, this._panelWidth - e.clientX)) ? false : false),
            action(() => CurrentUserUtils.propertiesWidth < 5 && (CurrentUserUtils.propertiesWidth = 0)),
            action(() => CurrentUserUtils.propertiesWidth = this.propertiesWidth() < 15 ? Math.min(this._panelWidth - 50, 250) : 0), false);
    }

    @action
    onFlyoutPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e,
            action(e => (this._flyoutWidth = Math.max(e.clientX - 58, 0)) ? false : false),
            () => this._flyoutWidth < 5 && this.closeFlyout(),
            this.closeFlyout);
    }

    flyoutWidthFunc = () => this._flyoutWidth;
    sidebarScreenToLocal = () => new Transform(0, -this.topOffset, 1);
    mainContainerXf = () => this.sidebarScreenToLocal().translate(-this.leftOffset, 0);
    addDocTabFunc = (doc: Doc, where: string): boolean => {
        return where === "close" ? CollectionDockingView.CloseSplit(doc) :
            doc.dockingConfig ? CurrentUserUtils.openDashboard(Doc.UserDoc(), doc) : CollectionDockingView.AddSplit(doc, "right");
    }


    /**
     * add lock and hide button decorations for the "Dashboards" flyout TreeView
     */
    DashboardStyleProvider(doc: Opt<Doc>, props: Opt<FieldViewProps | DocumentViewProps>, property: string) {
        const toggleField = undoBatch(action((e: React.MouseEvent, doc: Doc, field: string) => {
            e.stopPropagation();
            doc[field] = doc[field] ? undefined : true;
        }));
        switch (property.split(":")[0]) {
            case StyleProp.Decorations:
                return !doc || property.includes(":afterHeader") || // bcz: Todo: afterHeader should be generalized into a renderPath that is a list of the documents rendered so far which would mimic much of CSS property selectors
                    DocListCast((Doc.UserDoc().myDashboards as Doc).data).some(dash => dash === doc ||
                        DocListCast(dash.data).some(tabset => tabset === doc)) ? (null) :
                    <>
                        <div className={`styleProvider-treeView-hide${doc.hidden ? "-active" : ""}`} onClick={e => toggleField(e, doc, "hidden")}>
                            <FontAwesomeIcon icon={doc.hidden ? "eye-slash" : "eye"} size="sm" />
                        </div>
                        <div className={`styleProvider-treeView-lock${doc.lockedPosition ? "-active" : ""}`} onClick={e => toggleField(e, doc, "lockedPosition")}>
                            <FontAwesomeIcon icon={doc.lockedPosition ? "lock" : "unlock"} size="sm" />
                        </div>
                    </>;
        }
        return DefaultStyleProvider(doc, props, property);
    }


    @computed get flyout() {
        return !this._flyoutWidth ? <div className={`mainView-libraryFlyout-out`}>
            {this.docButtons}
        </div> :
            <div className="mainView-libraryFlyout" style={{ minWidth: this._flyoutWidth, width: this._flyoutWidth }} >
                <div className="mainView-contentArea" >
                    <DocumentView
                        Document={this._sidebarContent.proto || this._sidebarContent}
                        DataDoc={undefined}
                        addDocument={undefined}
                        addDocTab={this.addDocTabFunc}
                        pinToPres={emptyFunction}
                        rootSelected={returnTrue}
                        removeDocument={returnFalse}
                        ScreenToLocalTransform={this.mainContainerXf}
                        PanelWidth={this.flyoutWidthFunc}
                        PanelHeight={this.getContentsHeight}
                        renderDepth={0}
                        focus={emptyFunction}
                        styleProvider={this._sidebarContent.proto === Doc.UserDoc().myDashboards ? this.DashboardStyleProvider : DefaultStyleProvider}
                        parentActive={returnTrue}
                        whenActiveChanged={emptyFunction}
                        bringToFront={emptyFunction}
                        docFilters={returnEmptyFilter}
                        docRangeFilters={returnEmptyFilter}
                        searchFilterDocs={returnEmptyDoclist}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
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
                addDocument={undefined}
                addDocTab={this.addDocTabFunc}
                pinToPres={emptyFunction}
                rootSelected={returnTrue}
                removeDocument={returnFalse}
                ScreenToLocalTransform={this.sidebarScreenToLocal}
                PanelWidth={this.menuPanelWidth}
                PanelHeight={this.getContentsHeight}
                renderDepth={0}
                focus={emptyFunction}
                styleProvider={DefaultStyleProvider}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                docFilters={returnEmptyFilter}
                docRangeFilters={returnEmptyFilter}
                searchFilterDocs={returnEmptyDoclist}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                scriptContext={this}
            />
        </div>;
    }

    @action
    selectMenu = (button: Doc) => {
        const title = StrCast(Doc.GetProto(button).title);
        const willOpen = !this._flyoutWidth || this._panelContent !== title;
        this.closeFlyout();
        if (willOpen) {
            switch (this._panelContent = title) {
                case "Settings":
                    SettingsManager.Instance.open();
                    break;
                case "Catalog":
                    SearchBox.Instance._searchFullDB = "My Stuff";
                    SearchBox.Instance.enter(undefined);
                    break;
                case "Help":
                    break;
                default:
                    this.expandFlyout(button);
            }
        }
        return true;
    }

    @computed get mainInnerContent() {
        return <>
            {this.menuPanel}
            <div className={`mainView-innerContent${this.darkScheme ? "-dark" : ""}`}>
                {this.flyout}
                <div className="mainView-libraryHandle" style={{ display: !this._flyoutWidth ? "none" : undefined, }} onPointerDown={this.onFlyoutPointerDown} >
                    <FontAwesomeIcon icon="chevron-left" color={this.darkScheme ? "white" : "black"} style={{ opacity: "50%" }} size="sm" />
                </div>

                {this.dockingContent}

                <div className="mainView-propertiesDragger" onPointerDown={this.onPropertiesPointerDown} style={{ right: this.propertiesWidth() - 1 }}>
                    <FontAwesomeIcon icon={this.propertiesWidth() < 10 ? "chevron-left" : "chevron-right"} color={this.darkScheme ? "white" : "black"} size="sm" />
                </div>
                {this.propertiesWidth() < 10 ? (null) : <PropertiesView styleProvider={DefaultStyleProvider} width={this.propertiesWidth()} height={this.getContentsHeight()} />}
            </div>
        </>;
    }

    @computed get mainContent() {
        return !this.userDoc ? (null) :
            <div className="mainView-mainContent" ref={r => {
                r && new _global.ResizeObserver(action(() => { this._panelWidth = r.getBoundingClientRect().width; this._panelHeight = r.getBoundingClientRect().height; })).observe(r);
            }} style={{
                color: this.darkScheme ? "rgb(205,205,205)" : "black",
                height: `calc(100% - ${this.topOffset}px)`,
                width: "100%",
            }} >
                {this.mainInnerContent}
            </div>;
    }

    expandFlyout = action((button: Doc) => {
        this._flyoutWidth = (this._flyoutWidth || 250);
        this._sidebarContent.proto = button.target as any;
        this.LastButton = button;
    });

    closeFlyout = action(() => {
        this.LastButton = undefined;
        this._panelContent = "none";
        this._sidebarContent.proto = undefined;
        this._flyoutWidth = 0;
    });

    remButtonDoc = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg: boolean, doc) => flg && Doc.RemoveDocFromList(Doc.UserDoc().dockedBtns as Doc, "data", doc), true);
    moveButtonDoc = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => this.remButtonDoc(doc) && addDocument(doc);
    addButtonDoc = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg: boolean, doc) => flg && Doc.AddDocToList(Doc.UserDoc().dockedBtns as Doc, "data", doc), true);

    buttonBarXf = () => {
        if (!this._docBtnRef.current) return Transform.Identity();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._docBtnRef.current);
        return new Transform(-translateX, -translateY, 1 / scale);
    }

    @computed get docButtons() {
        return !(this.userDoc.dockedBtns instanceof Doc) ? (null) :
            <div className="mainView-docButtons" ref={this._docBtnRef} style={{ height: !this.userDoc.dockedBtns.linearViewIsExpanded ? "42px" : undefined }} >
                <CollectionLinearView
                    Document={this.userDoc.dockedBtns}
                    DataDoc={undefined}
                    fieldKey={"data"}
                    dropAction={"alias"}
                    parentActive={returnFalse}
                    styleProvider={DefaultStyleProvider}
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
                    ScreenToLocalTransform={this.buttonBarXf}
                    PanelWidth={this.flyoutWidthFunc}
                    PanelHeight={this.getContentsHeight}
                    renderDepth={0}
                    focus={emptyFunction}
                    whenActiveChanged={emptyFunction}
                    docFilters={returnEmptyFilter}
                    docRangeFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined} />
            </div>;
    }
    @computed get snapLines() {
        return !this.userDoc.showSnapLines ? (null) : <div className="mainView-snapLines">
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
        TraceMobx();
        return <div className="mainView-searchPanel">
            <SearchBox Document={CurrentUserUtils.MySearchPanelDoc}
                DataDoc={CurrentUserUtils.MySearchPanelDoc}
                fieldKey="data"
                dropAction="move"
                isSelected={returnTrue}
                active={returnTrue}
                select={returnTrue}
                addDocument={undefined}
                addDocTab={this.addDocTabFunc}
                pinToPres={emptyFunction}
                rootSelected={returnTrue}
                styleProvider={DefaultStyleProvider}
                removeDocument={undefined}
                ScreenToLocalTransform={Transform.Identity}
                PanelWidth={this.getPWidth}
                PanelHeight={this.getPHeight}
                renderDepth={0}
                focus={emptyFunction}
                parentActive={returnFalse}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                docFilters={returnEmptyFilter}
                docRangeFilters={returnEmptyFilter}
                searchFilterDocs={returnEmptyDoclist}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined} />
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
                    dropAction={"move"}
                    isSelected={returnFalse}
                    select={returnFalse}
                    rootSelected={returnFalse}
                    renderDepth={0}
                    parentActive={returnFalse}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    ScreenToLocalTransform={Transform.Identity}
                    bringToFront={returnFalse}
                    active={returnFalse}
                    whenActiveChanged={returnFalse}
                    focus={returnFalse}
                    PanelWidth={() => 500}
                    PanelHeight={() => 800}
                    docFilters={returnEmptyFilter}
                    docRangeFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                />
            </div>;
    }

    render() {
        return (<div className={"mainView-container" + (this.darkScheme ? "-dark" : "")} onScroll={() => ((ele) => ele.scrollTop = ele.scrollLeft = 0)(document.getElementById("root")!)} ref={this._mainViewRef}>
            {this.inkResources}
            <DictationOverlay />
            <SharingManager />
            <SettingsManager />
            <GroupManager />
            <GoogleAuthenticationManager />
            <DocumentDecorations boundsLeft={this.leftOffset} boundsTop={this.topOffset} />
            {this.search}
            <CollectionMenu />
            {LinkDescriptionPopup.descriptionPopup ? <LinkDescriptionPopup /> : null}
            {DocumentLinksButton.EditLink ? <LinkMenu docView={DocumentLinksButton.EditLink} docprops={DocumentLinksButton.EditLink.props} changeFlyout={emptyFunction} /> : (null)}
            {LinkDocPreview.LinkInfo ? <LinkDocPreview location={LinkDocPreview.LinkInfo.Location} docprops={LinkDocPreview.LinkInfo.docprops}
                linkDoc={LinkDocPreview.LinkInfo.linkDoc} linkSrc={LinkDocPreview.LinkInfo.linkSrc} href={LinkDocPreview.LinkInfo.href} /> : (null)}
            <GestureOverlay >
                {this.mainContent}
            </GestureOverlay>
            <PreviewCursor />
            <TaskCompletionBox />
            <ContextMenu />
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
                            parentActive={returnFalse}
                            whenActiveChanged={returnFalse}
                            focus={returnFalse}
                            PanelWidth={() => 500}
                            PanelHeight={() => 800}
                            docFilters={returnEmptyFilter}
                            docRangeFilters={returnEmptyFilter}
                            searchFilterDocs={returnEmptyDoclist}
                        />
                    </div>;
                </span>, ele);

                let success = false;
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