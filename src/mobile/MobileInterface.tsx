
import { library } from '@fortawesome/fontawesome-svg-core';
import {
    faTasks, faReply, faQuoteLeft, faHandPointLeft, faFolderOpen, faAngleDoubleLeft, faExternalLinkSquareAlt, faMobile, faThLarge, faWindowClose, faEdit, faTrashAlt, faPalette, faAngleRight, faBell, faTrash, faCamera, faExpand, faCaretDown, faCaretLeft, faCaretRight, faCaretSquareDown, faCaretSquareRight, faArrowsAltH, faPlus, faMinus,
    faTerminal, faToggleOn, faFile as fileSolid, faExternalLinkAlt, faLocationArrow, faSearch, faFileDownload, faStop, faCalculator, faWindowMaximize, faAddressCard,
    faQuestionCircle, faArrowLeft, faArrowRight, faArrowDown, faArrowUp, faBolt, faBullseye, faCaretUp, faCat, faCheck, faChevronRight, faClipboard, faClone, faCloudUploadAlt,
    faCommentAlt, faCompressArrowsAlt, faCut, faEllipsisV, faEraser, faExclamation, faFileAlt, faFileAudio, faFilePdf, faFilm, faFilter, faFont, faGlobeAsia, faHighlighter,
    faLongArrowAltRight, faMicrophone, faMousePointer, faMusic, faObjectGroup, faPause, faPen, faPenNib, faPhone, faPlay, faPortrait, faRedoAlt, faStamp, faStickyNote,
    faThumbtack, faTree, faTv, faBook, faUndoAlt, faVideo, faAsterisk, faBrain, faImage, faPaintBrush, faTimes, faEye, faHome, faLongArrowAltLeft, faBars, faTh, faChevronLeft,
    faAlignRight, faAlignLeft
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from "react";
import { Docs, DocumentOptions, DocUtils } from '../client/documents/Documents';
import { DocumentType } from "../client/documents/DocumentTypes";
import { CurrentUserUtils } from '../client/util/CurrentUserUtils';
import { Scripting } from '../client/util/Scripting';
import { SettingsManager } from '../client/util/SettingsManager';
import { Transform } from '../client/util/Transform';
import { UndoManager } from "../client/util/UndoManager";
import { TabDocView } from '../client/views/collections/TabDocView';
import { CollectionViewType } from "../client/views/collections/CollectionView";
import { GestureOverlay } from "../client/views/GestureOverlay";
import { AudioBox } from "../client/views/nodes/AudioBox";
import { DocumentView } from '../client/views/nodes/DocumentView';
import { RichTextMenu } from "../client/views/nodes/formattedText/RichTextMenu";
import { RadialMenu } from "../client/views/nodes/RadialMenu";
import { Doc, DocListCast } from '../fields/Doc';
import { InkTool } from '../fields/InkField';
import { List } from "../fields/List";
import { ScriptField } from "../fields/ScriptField";
import { Cast, FieldValue } from '../fields/Types';
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnOne, returnTrue, returnZero } from '../Utils';
import { AudioUpload } from "./AudioUpload";
import { Uploader } from "./ImageUpload";
import "./AudioUpload.scss";
import "./ImageUpload.scss";
import "./MobileInterface.scss";

library.add(faTasks, faReply, faQuoteLeft, faHandPointLeft, faFolderOpen, faAngleDoubleLeft, faExternalLinkSquareAlt, faMobile, faThLarge, faWindowClose, faEdit, faTrashAlt, faPalette, faAngleRight, faBell, faTrash, faCamera, faExpand, faCaretDown, faCaretLeft, faCaretRight, faCaretSquareDown, faCaretSquareRight, faArrowsAltH, faPlus, faMinus,
    faTerminal, faToggleOn, fileSolid, faExternalLinkAlt, faLocationArrow, faSearch, faFileDownload, faStop, faCalculator, faWindowMaximize, faAddressCard,
    faQuestionCircle, faArrowLeft, faArrowRight, faArrowDown, faArrowUp, faBolt, faBullseye, faCaretUp, faCat, faCheck, faChevronRight, faClipboard, faClone, faCloudUploadAlt,
    faCommentAlt, faCompressArrowsAlt, faCut, faEllipsisV, faEraser, faExclamation, faFileAlt, faFileAudio, faFilePdf, faFilm, faFilter, faFont, faGlobeAsia, faHighlighter,
    faLongArrowAltRight, faMicrophone, faMousePointer, faMusic, faObjectGroup, faPause, faPen, faPenNib, faPhone, faPlay, faPortrait, faRedoAlt, faStamp, faStickyNote,
    faThumbtack, faTree, faTv, faUndoAlt, faBook, faVideo, faAsterisk, faBrain, faImage, faPaintBrush, faTimes, faEye, faHome, faLongArrowAltLeft, faBars, faTh, faChevronLeft,
    faAlignLeft, faAlignRight);


@observer
export class MobileInterface extends React.Component {
    static Instance: MobileInterface;
    private _library: Promise<Doc>;
    private _mainDoc: any = CurrentUserUtils.setupActiveMobileMenu(Doc.UserDoc());
    @observable private _sidebarActive: boolean = false; //to toggle sidebar display
    @observable private _imageUploadActive: boolean = false; //to toggle image upload
    @observable private _audioUploadActive: boolean = false;
    @observable private _menuListView: boolean = false; //to switch between menu view (list / icon)
    @observable private _ink: boolean = false; //toggle whether ink is being dispalyed
    @observable private _homeMenu: boolean = true; // to determine whether currently at home menu
    @observable private dashboards: Doc | null = null; // currently selected document
    @observable private _activeDoc: Doc = this._mainDoc; // doc updated as the active mobile page is updated (initially home menu)
    @observable private _homeDoc: Doc = this._mainDoc; // home menu as a document
    @observable private _parents: Array<Doc> = []; // array of parent docs (for pathbar)

    @computed private get mainContainer() { return Doc.UserDoc() ? FieldValue(Cast(Doc.UserDoc().activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }

    constructor(props: Readonly<{}>) {
        super(props);
        this._library = CurrentUserUtils.setupLibrary(Doc.UserDoc()); // to access documents in Dash Web
        MobileInterface.Instance = this;
    }

    @action
    componentDidMount = () => {
        // if the home menu is in list view -> adjust the menu toggle appropriately
        this._menuListView = this._homeDoc._viewType === "stacking" ? true : false;
        CurrentUserUtils.SelectedTool = InkTool.None; // ink should intially be set to none
        Doc.UserDoc().activeMobile = this._homeDoc; // active mobile set to home
        AudioBox.Enabled = true;

        // remove double click to avoid mobile zoom in
        document.removeEventListener("dblclick", this.onReactDoubleClick);
        document.addEventListener("dblclick", this.onReactDoubleClick);
    }

    @action
    componentWillUnmount = () => {
        document.removeEventListener('dblclick', this.onReactDoubleClick);
    }

    // Prevent zooming in when double tapping the screen
    onReactDoubleClick = (e: MouseEvent) => {
        e.stopPropagation();
    }

    // Switch the mobile view to the given doc
    @action
    switchCurrentView = (doc: Doc, renderView?: () => JSX.Element, onSwitch?: () => void) => {
        if (!Doc.UserDoc()) return;
        if (this._activeDoc === this._homeDoc) {
            this._parents.push(this._activeDoc);
            this._homeMenu = false;
        }
        this._activeDoc = doc;
        Doc.UserDoc().activeMobile = doc;
        onSwitch?.();

        // Ensures that switching to home is not registed
        UndoManager.undoStack.length = 0;
        UndoManager.redoStack.length = 0;
    }

    // For toggling the hamburger menu
    @action
    toggleSidebar = () => {
        this._sidebarActive = !this._sidebarActive;

        if (this._ink) {
            this.onSwitchInking();
        }
    }
    /**
     * Method called when 'Library' button is pressed on the home screen
     */
    switchToLibrary = async () => {
        this._library.then(library => this.switchCurrentView(library));
        runInAction(() => this._homeMenu = false);
        this.toggleSidebar();
    }

    /**
     * Back method for navigating through items
     */
    @action
    back = () => {
        const header = document.getElementById("header") as HTMLElement;
        const doc = Cast(this._parents.pop(), Doc) as Doc; // Parent document
        // Case 1: Parent document is 'dashboards'
        if (doc === Cast(this._library, Doc) as Doc) {
            this.dashboards = null;
            this._library.then(library => this.switchCurrentView(library));
            // Case 2: Parent document is the 'home' menu (root node)
        } else if (doc === Cast(this._homeDoc, Doc) as Doc) {
            this._homeMenu = true;
            this._parents = [];
            this.dashboards = null;
            this.switchCurrentView(this._homeDoc);
            // Case 3: Parent document is any document
        } else if (doc) {
            this.dashboards = doc;
            this.switchCurrentView(doc);
            this._homeMenu = false;
            header.textContent = String(doc.title);
        }
        this._ink = false; // turns ink off
    }

    /**
     * Return 'Home", which implies returning to 'Home' menu buttons
     */
    @action
    returnHome = () => {
        if (!this._homeMenu || this._sidebarActive) {
            this._homeMenu = true;
            this._parents = [];
            this.dashboards = null;
            this.switchCurrentView(this._homeDoc);
        }
        if (this._sidebarActive) {
            this.toggleSidebar();
        }
    }

    /**
     * Return to primary Dashboard in library (Dashboards Doc)
     */
    @action
    returnMain = () => {
        this._parents = [this._homeDoc];
        this._library.then(library => this.switchCurrentView(library));
        this._homeMenu = false;
        this.dashboards = null;
    }

    /**
     * Note: window.innerWidth and window.screen.width compute different values.
     * window.screen.width is the display size, however window.innerWidth is the
     * display resolution which computes differently.
     */
    returnWidth = () => window.innerWidth; //The windows width
    returnHeight = () => (window.innerHeight - 300); //Calculating the windows height (-300 to account for topbar)
    whitebackground = () => "white";
    /**
     * DocumentView for graphic display of all documents
     */
    @computed get displayDashboards() {
        return !this.mainContainer ? (null) :
            <div style={{ position: "relative", top: '198px', height: `calc(100% - 350px)`, width: "100%", left: "0%" }}>
                <DocumentView
                    Document={this.mainContainer}
                    DataDoc={undefined}
                    addDocument={returnFalse}
                    addDocTab={returnFalse}
                    pinToPres={emptyFunction}
                    rootSelected={returnFalse}
                    removeDocument={undefined}
                    ScreenToLocalTransform={Transform.Identity}
                    PanelWidth={this.returnWidth}
                    PanelHeight={this.returnHeight}
                    renderDepth={0}
                    focus={DocUtils.DefaultFocus}
                    styleProvider={this.whitebackground}
                    layerProvider={undefined}
                    docViewPath={returnEmptyDoclist}
                    parentActive={returnTrue}
                    whenActiveChanged={emptyFunction}
                    bringToFront={emptyFunction}
                    docFilters={returnEmptyFilter}
                    docRangeFilters={returnEmptyFilter}
                    searchFilterDocs={returnEmptyDoclist}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                />
            </div>;
    }

    /**
     * Handles the click functionality in the library panel.
     * Navigates to the given doc and updates the sidebar.
     * @param doc: doc for which the method is called
     */
    handleClick = async (doc: Doc) => {
        runInAction(() => {
            if (doc.type !== "collection" && this._sidebarActive) {
                this._parents.push(this._activeDoc);
                this.switchCurrentView(doc);
                this._homeMenu = false;
                this.toggleSidebar();
            }
            else {
                this._parents.push(this._activeDoc);
                this.switchCurrentView(doc);
                this._homeMenu = false;
                this.dashboards = doc;
            }
        });
    }

    /**
     * Called when an item in the library is clicked and should
     * be opened (open icon on RHS of all menu items)
     * @param doc doc to be opened
     */
    @action
    openFromSidebar = (doc: Doc) => {
        this._parents.push(this._activeDoc);
        this.switchCurrentView(doc);
        this._homeMenu = false;
        this.dashboards = doc;
        this.toggleSidebar();
    }

    // Renders the graphical pathbar
    renderPathbar = () => {
        const docPath = [...this._parents, this._activeDoc];
        const items = docPath.map((doc: Doc, index: any) =>
            <div className="pathbarItem" key={index}>
                {index === 0 ? (null) : <FontAwesomeIcon key="icon" className="pathIcon" icon="angle-right" size="lg" />}
                <div className="pathbarText"
                    style={{ backgroundColor: this._homeMenu || doc === this._activeDoc ? "rgb(119,17,37)" : undefined }}
                    onClick={() => this.handlePathClick(doc, index)}>{doc.title}
                </div>
            </div>);
        return (<div className="pathbar">
            <div className="scrollmenu">
                {items}
            </div>
            {!this._parents.length ? (null) :
                <div className="back" >
                    <FontAwesomeIcon onClick={this.back} icon={"chevron-left"} color="white" size={"2x"} />
                </div>}
            <div className="hidePath" />
        </div>);
    }

    // Handles when user clicks on a document in the pathbar
    @action
    handlePathClick = async (doc: Doc, index: number) => {
        const library = await this._library;
        if (doc === library) {
            this.dashboards = null;
            this.switchCurrentView(doc);
            this._parents.length = index;
        } else if (doc === this._homeDoc) {
            this.returnHome();
        } else {
            this.dashboards = doc;
            this.switchCurrentView(doc);
            this._parents.length = index;
        }
    }

    // Renders the contents of the menu and sidebar
    @computed get renderDefaultContent() {
        if (this._homeMenu) {
            return (
                <div>
                    <div className="navbar">
                        <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
                        <div className="header" id="header">{this._homeDoc.title}</div>
                        <div className="cover" id="cover" onClick={e => e.stopPropagation()}></div>
                        <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                    {this.renderPathbar()}
                </div>
            );
        }
        // stores dashboards documents as 'dashboards' variable
        let dashboards = CurrentUserUtils.MyDashboards;
        if (this.dashboards) {
            dashboards = this.dashboards;
        }
        // returns a list of navbar buttons as 'buttons'
        const buttons = DocListCast(dashboards.data).map((doc: Doc, index: any) => {
            if (doc.type !== "ink") {
                return (
                    <div
                        className="item"
                        key={index}>
                        <div className="item-title" onClick={() => this.handleClick(doc)}> {doc.title} </div>
                        <div className="item-type" onClick={() => this.handleClick(doc)}>{doc.type}</div>
                        <FontAwesomeIcon onClick={() => this.handleClick(doc)} className="right" icon="angle-right" size="lg" style={{ display: `${doc.type === "collection" ? "block" : "none"}` }} />
                        <FontAwesomeIcon className="open" onClick={() => this.openFromSidebar(doc)} icon="external-link-alt" size="lg" />
                    </div>
                );
            }
        });

        return (
            <div>
                <div className="navbar">
                    <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
                    <div className="header" id="header">{this._sidebarActive ? "library" : this._activeDoc.title}</div>
                    <div className={`toggle-btn ${this._sidebarActive ? "active" : ""}`} onClick={this.toggleSidebar}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <div className={`background ${this._sidebarActive ? "active" : ""}`} onClick={this.toggleSidebar}></div>
                </div>
                {this.renderPathbar()}
                <div className={`sidebar ${this._sidebarActive ? "active" : ""}`}>
                    <div className="sidebarButtons">
                        {this.dashboards ?
                            <>
                                {buttons}
                                <div
                                    className="item" key="home"
                                    onClick={this.returnMain}
                                    style={{ opacity: 0.7 }}>
                                    <FontAwesomeIcon className="right" icon="angle-double-left" size="lg" />
                                    <div className="item-type">Return to dashboards</div>
                                </div>
                            </> :
                            <>
                                {buttons}
                                <div
                                    className="item"
                                    style={{ opacity: 0.7 }}
                                    onClick={() => this.createNewDashboard()}>
                                    <FontAwesomeIcon className="right" icon="plus" size="lg" />
                                    <div className="item-type">Create New Dashboard</div>
                                </div>
                            </>
                        }
                    </div>
                </div>
                <div className={`blanket ${this._sidebarActive ? "active" : ""}`} onClick={this.toggleSidebar}>
                </div>
            </div>
        );
    }

    /**
     * Handles the 'Create New Dashboard' button in the menu (taken from MainView.tsx)
     */
    @action
    createNewDashboard = async (id?: string) => {
        const scens = CurrentUserUtils.MyDashboards;
        const dashboardCount = DocListCast(scens.data).length + 1;
        const freeformOptions: DocumentOptions = {
            x: 0,
            y: 400,
            title: "Collection " + dashboardCount,
        };
        const freeformDoc = CurrentUserUtils.GuestTarget || Docs.Create.FreeformDocument([], freeformOptions);
        const dashboardDoc = Docs.Create.StandardCollectionDockingDocument([{ doc: freeformDoc, initialWidth: 600 }], { title: `Dashboard ${dashboardCount}` }, id, "row");

        const toggleTheme = ScriptField.MakeScript(`self.darkScheme = !self.darkScheme`);
        const toggleComic = ScriptField.MakeScript(`toggleComicMode()`);
        const cloneDashboard = ScriptField.MakeScript(`cloneDashboard()`);
        dashboardDoc.contextMenuScripts = new List<ScriptField>([toggleTheme!, toggleComic!, cloneDashboard!]);
        dashboardDoc.contextMenuLabels = new List<string>(["Toggle Theme Colors", "Toggle Comic Mode", "New Dashboard Layout"]);

        Doc.AddDocToList(scens, "data", dashboardDoc);
    }

    // Button for switching between pen and ink mode
    @action
    onSwitchInking = () => {
        const button = document.getElementById("inkButton") as HTMLElement;
        button.style.backgroundColor = this._ink ? "white" : "black";
        button.style.color = this._ink ? "black" : "white";

        if (!this._ink) {
            CurrentUserUtils.SelectedTool = InkTool.Pen;
            this._ink = true;
        } else {
            CurrentUserUtils.SelectedTool = InkTool.None;
            this._ink = false;
        }
    }

    // The static ink menu that appears at the top
    @computed get inkMenu() {
        return this._activeDoc._viewType !== CollectionViewType.Docking || !this._ink ? (null) :
            <div className="colorSelector">
                {/* <CollectionFreeFormViewChrome /> */}
            </div>;
    }

    // DocButton that uses UndoManager and handles the opacity change if CanUndo is true
    @computed get undo() {
        if (this.mainContainer && this._activeDoc.type === "collection" && this._activeDoc !== this._homeDoc &&
            this._activeDoc !== Doc.SharingDoc() && this._activeDoc.title !== "WORKSPACES") {
            return (
                <div className="docButton"
                    style={{ backgroundColor: "black", color: "white", fontSize: "60", opacity: UndoManager.CanUndo() ? "1" : "0.4", }}
                    id="undoButton"
                    title="undo"
                    onClick={(e: React.MouseEvent) => {
                        UndoManager.Undo();
                        e.stopPropagation();
                    }}>
                    <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="undo-alt" />
                </div>);
        } else return (null);
    }

    // DocButton that uses UndoManager and handles the opacity change if CanRedo is true
    @computed get redo() {
        if (this.mainContainer && this._activeDoc.type === "collection" && this._activeDoc !== this._homeDoc &&
            this._activeDoc !== Doc.SharingDoc() && this._activeDoc.title !== "WORKSPACES") {
            return (
                <div className="docButton"
                    style={{ backgroundColor: "black", color: "white", fontSize: "60", opacity: UndoManager.CanRedo() ? "1" : "0.4", }}
                    id="undoButton"
                    title="redo"
                    onClick={(e: React.MouseEvent) => {
                        UndoManager.Redo();
                        e.stopPropagation();
                    }}>
                    <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="redo-alt" />
                </div>);
        } else return (null);
    }

    // DocButton for switching into ink mode
    @computed get drawInk() {
        return !this.mainContainer || this._activeDoc._viewType !== CollectionViewType.Docking ? (null) :
            <div className="docButton"
                id="inkButton"
                title={Doc.isDocPinned(this._activeDoc) ? "Pen on" : "Pen off"}
                onClick={this.onSwitchInking}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="pen-nib" />
            </div>;
    }

    // DocButton: Button that appears on the bottom of the screen to initiate image upload
    @computed get uploadImageButton() {
        if (this._activeDoc.type === DocumentType.COL && this._activeDoc !== this._homeDoc && this._activeDoc._viewType !== CollectionViewType.Docking && this._activeDoc.title !== "WORKSPACES") {
            return <div className="docButton"
                id="imageButton"
                title={Doc.isDocPinned(this._activeDoc) ? "Pen on" : "Pen off"}
                onClick={this.toggleUpload}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="upload" />
            </div>;
        } else return (null);
    }

    // DocButton to download images on the mobile
    @computed get downloadDocument() {
        if (this._activeDoc.type === "image" || this._activeDoc.type === "pdf" || this._activeDoc.type === "video") {
            return <div className="docButton"
                title={"Download Image"}
                style={{ backgroundColor: "white", color: "black" }}
                onClick={e => window.open(this._activeDoc["data-path"]?.toString())}> {/*  daa-path holds the url */}
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="download" />
            </div>;
        } else return (null);
    }

    // DocButton for pinning images to presentation
    @computed get pinToPresentation() {
        // Only making button available if it is an image
        if (!(this._activeDoc.type === "collection" || this._activeDoc.type === "presentation")) {
            const isPinned = this._activeDoc && Doc.isDocPinned(this._activeDoc);
            return <div className="docButton"
                title={Doc.isDocPinned(this._activeDoc) ? "Unpin from presentation" : "Pin to presentation"}
                style={{ backgroundColor: isPinned ? "black" : "white", color: isPinned ? "white" : "black" }}
                onClick={e => TabDocView.PinDoc(this._activeDoc, { unpin: isPinned })}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="map-pin" />
            </div>;
        } else return (null);
    }

    // Buttons for switching the menu between large and small icons
    @computed get switchMenuView() {
        return this._activeDoc.title !== this._homeDoc.title ? (null) :
            <div className="homeSwitch">
                <div className={`list ${!this._menuListView ? "active" : ""}`} onClick={this.changeToIconView}>
                    <FontAwesomeIcon size="sm" icon="th-large" />
                </div>
                <div className={`list ${this._menuListView ? "active" : ""}`} onClick={this.changeToListView}>
                    <FontAwesomeIcon size="sm" icon="bars" />
                </div>
            </div>;
    }

    // Logic for switching the menu into the icons
    @action
    changeToIconView = () => {
        if (this._homeDoc._viewType = "stacking") {
            this._menuListView = false;
            this._homeDoc._viewType = "masonry";
            this._homeDoc.columnWidth = 300;
            this._homeDoc._columnWidth = 300;
            const menuButtons = DocListCast(this._homeDoc.data);
            menuButtons.map(doc => {
                const buttonData = DocListCast(doc.data);
                buttonData[1]._nativeWidth = 0.1;
                buttonData[1]._width = 0.1;
                buttonData[1]._dimMagnitude = 0;
                buttonData[1]._opacity = 0;
                doc._nativeWidth = 400;
            });
        }
    }

    // Logic for switching the menu into the stacking view
    @action
    changeToListView = () => {
        if (this._homeDoc._viewType = "masonry") {
            this._homeDoc._viewType = "stacking";
            this._menuListView = true;
            const menuButtons = DocListCast(this._homeDoc.data);
            menuButtons.map(doc => {
                const buttonData = DocListCast(doc.data);
                buttonData[1]._nativeWidth = 450;
                buttonData[1]._dimMagnitude = 2;
                buttonData[1]._opacity = 1;
                doc._nativeWidth = 900;
            });
        }
    }

    // For setting up the presentation document for the home menu
    @action
    setupDefaultPresentation = () => {
        const presentation = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;

        if (presentation) {
            this.switchCurrentView(presentation);
            this._homeMenu = false;
        }
    }

    // For toggling image upload pop up
    @action
    toggleUpload = () => this._imageUploadActive = !this._imageUploadActive

    // For toggling audio record and dictate pop up
    @action
    toggleAudio = () => this._audioUploadActive = !this._audioUploadActive

    // Button for toggling the upload pop up in a collection
    @action
    toggleUploadInCollection = () => {
        const button = document.getElementById("imageButton") as HTMLElement;
        button.style.backgroundColor = this._imageUploadActive ? "white" : "black";
        button.style.color = this._imageUploadActive ? "black" : "white";

        this._imageUploadActive = !this._imageUploadActive;
    }

    // For closing the image upload pop up
    @action
    closeUpload = () => {
        this._imageUploadActive = false;
    }

    // Returns the image upload pop up
    @computed get uploadImage() {
        const doc = !this._homeMenu ? this._activeDoc : Cast(Doc.SharingDoc(), Doc) as Doc;
        return <Uploader Document={doc} />;
    }

    // Radial menu can only be used if it is a colleciton and it is not a homeDoc 
    // (and cannot be used on Dashboard to avoid pin to presentation opening on right)
    @computed get displayRadialMenu() {
        return this._activeDoc.type === "collection" && this._activeDoc !== this._homeDoc &&
            this._activeDoc._viewType !== CollectionViewType.Docking ? <RadialMenu /> : (null);
    }

    onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * MENU BUTTON
     * Switch view from mobile menu to access the mobile uploads
     * Global function name: openMobileUploads()
     */
    @action
    switchToMobileUploads = () => {
        const mobileUpload = Cast(Doc.SharingDoc(), Doc) as Doc;
        this.switchCurrentView(mobileUpload);
        this._homeMenu = false;
    }

    render() {
        return (
            <div className="mobileInterface-container" onDragOver={this.onDragOver}>
                <SettingsManager />
                <div className={`image-upload ${this._imageUploadActive ? "active" : ""}`}>
                    {this.uploadImage}
                </div>
                <div className={`audio-upload ${this._audioUploadActive ? "active" : ""}`}>
                    <AudioUpload />
                </div>
                {this.switchMenuView}
                {this.inkMenu}
                <GestureOverlay>
                    <div style={{ display: "none" }}><RichTextMenu key="rich" /></div>
                    <div className="docButtonContainer">
                        {this.pinToPresentation}
                        {this.downloadDocument}
                        {this.undo}
                        {this.redo}
                        {this.drawInk}
                        {this.uploadImageButton}
                    </div>
                    {this.displayDashboards}
                    {this.renderDefaultContent}
                </GestureOverlay>
                {this.displayRadialMenu}
            </div>
        );
    }
}


//Global functions for mobile menu
Scripting.addGlobal(function switchToMobileLibrary() { return MobileInterface.Instance.switchToLibrary(); },
    "opens the library to navigate through dashboards on Dash Mobile");
Scripting.addGlobal(function openMobileUploads() { return MobileInterface.Instance.toggleUpload(); },
    "opens the upload files menu for Dash Mobile");
Scripting.addGlobal(function switchToMobileUploadCollection() { return MobileInterface.Instance.switchToMobileUploads(); },
    "opens the mobile uploads collection on Dash Mobile");
Scripting.addGlobal(function openMobileAudio() { return MobileInterface.Instance.toggleAudio(); },
    "opens the record and dictate menu on Dash Mobile");
Scripting.addGlobal(function switchToMobilePresentation() { return MobileInterface.Instance.setupDefaultPresentation(); },
    "opens the presentation on Dash Mobile");
Scripting.addGlobal(function openMobileSettings() { return SettingsManager.Instance.open(); },
    "opens settings on Dash Mobile");

// Other global functions for mobile
Scripting.addGlobal(function switchMobileView(doc: Doc, renderView?: () => JSX.Element, onSwitch?: () => void) { return MobileInterface.Instance.switchCurrentView(doc, renderView, onSwitch); },
    "changes the active document displayed on the Dash Mobile", "(doc: any)");