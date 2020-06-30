import * as React from "react";
import { library } from '@fortawesome/fontawesome-svg-core';
import {
    faTasks, faReply, faQuoteLeft, faHandPointLeft, faFolderOpen, faAngleDoubleLeft, faExternalLinkSquareAlt, faMobile, faThLarge, faWindowClose, faEdit, faTrashAlt, faPalette, faAngleRight, faBell, faTrash, faCamera, faExpand, faCaretDown, faCaretLeft, faCaretRight, faCaretSquareDown, faCaretSquareRight, faArrowsAltH, faPlus, faMinus,
    faTerminal, faToggleOn, faFile as fileSolid, faExternalLinkAlt, faLocationArrow, faSearch, faFileDownload, faStop, faCalculator, faWindowMaximize, faAddressCard,
    faQuestionCircle, faArrowLeft, faArrowRight, faArrowDown, faArrowUp, faBolt, faBullseye, faCaretUp, faCat, faCheck, faChevronRight, faClipboard, faClone, faCloudUploadAlt,
    faCommentAlt, faCompressArrowsAlt, faCut, faEllipsisV, faEraser, faExclamation, faFileAlt, faFileAudio, faFilePdf, faFilm, faFilter, faFont, faGlobeAsia, faHighlighter,
    faLongArrowAltRight, faMicrophone, faMousePointer, faMusic, faObjectGroup, faPause, faPen, faPenNib, faPhone, faPlay, faPortrait, faRedoAlt, faStamp, faStickyNote,
    faThumbtack, faTree, faTv, faBook, faUndoAlt, faVideo, faAsterisk, faBrain, faImage, faPaintBrush, faTimes, faEye, faHome, faLongArrowAltLeft, faBars, faTh, faChevronLeft
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, reaction, trace } from 'mobx';
import { observer } from 'mobx-react';
import { Doc, DocListCast } from '../fields/Doc';
import { CurrentUserUtils } from '../client/util/CurrentUserUtils';
import { emptyFunction, emptyPath, returnEmptyString, returnFalse, returnOne, returnTrue, returnZero, returnEmptyFilter } from '../Utils';
import { Docs, DocumentOptions } from '../client/documents/Documents';
import { Scripting } from '../client/util/Scripting';
import { DocumentView } from '../client/views/nodes/DocumentView';
import { Transform } from '../client/util/Transform';
import "./MobileInterface.scss";
import "./ImageUpload.scss";
import "./AudioUpload.scss";
import SettingsManager from '../client/util/SettingsManager';
import { Uploader } from "./ImageUpload";
import { DockedFrameRenderer } from '../client/views/collections/CollectionDockingView';
import { InkTool } from '../fields/InkField';
import GestureOverlay from "../client/views/GestureOverlay";
import { ScriptField } from "../fields/ScriptField";
import InkOptionsMenu from "../client/views/collections/collectionFreeForm/InkOptionsMenu";
import { RadialMenu } from "../client/views/nodes/RadialMenu";
import { UndoManager } from "../client/util/UndoManager";
import { List } from "../fields/List";
import { AudioUpload } from "./AudioUpload";
import { Cast, FieldValue } from '../fields/Types';
import RichTextMenu from "../client/views/nodes/formattedText/RichTextMenu";
import { AudioBox } from "../client/views/nodes/AudioBox";
import { Compute } from "google-auth-library";

library.add(faTasks, faReply, faQuoteLeft, faHandPointLeft, faFolderOpen, faAngleDoubleLeft, faExternalLinkSquareAlt, faMobile, faThLarge, faWindowClose, faEdit, faTrashAlt, faPalette, faAngleRight, faBell, faTrash, faCamera, faExpand, faCaretDown, faCaretLeft, faCaretRight, faCaretSquareDown, faCaretSquareRight, faArrowsAltH, faPlus, faMinus,
    faTerminal, faToggleOn, fileSolid, faExternalLinkAlt, faLocationArrow, faSearch, faFileDownload, faStop, faCalculator, faWindowMaximize, faAddressCard,
    faQuestionCircle, faArrowLeft, faArrowRight, faArrowDown, faArrowUp, faBolt, faBullseye, faCaretUp, faCat, faCheck, faChevronRight, faClipboard, faClone, faCloudUploadAlt,
    faCommentAlt, faCompressArrowsAlt, faCut, faEllipsisV, faEraser, faExclamation, faFileAlt, faFileAudio, faFilePdf, faFilm, faFilter, faFont, faGlobeAsia, faHighlighter,
    faLongArrowAltRight, faMicrophone, faMousePointer, faMusic, faObjectGroup, faPause, faPen, faPenNib, faPhone, faPlay, faPortrait, faRedoAlt, faStamp, faStickyNote,
    faThumbtack, faTree, faTv, faUndoAlt, faBook, faVideo, faAsterisk, faBrain, faImage, faPaintBrush, faTimes, faEye, faHome, faLongArrowAltLeft, faBars, faTh, faChevronLeft);

@observer
export class MobileInterface extends React.Component {
    @observable static Instance: MobileInterface;
    @computed private get userDoc() { return Doc.UserDoc(); }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    @observable private mainDoc: any = CurrentUserUtils.setupActiveMobileMenu(this.userDoc);
    @observable private renderView?: () => JSX.Element;
    @observable private sidebarActive: boolean = false; //to toggle sidebar display
    @observable private imageUploadActive: boolean = false; //to toggle image upload
    @observable private audioUploadActive: boolean = false;
    @observable private menuListView: boolean = false; //to switch between menu view (list / icon)
    @observable private _ink: boolean = false; //toggle whether ink is being dispalyed

    public _activeDoc: Doc = this.mainDoc; // doc updated as the active mobile page is updated (initially home menu)
    public _homeDoc: Doc = this.mainDoc; // home menu as a document
    private _homeMenu: boolean = true; // to determine whether currently at home menu
    private _child: Doc | null = null; // currently selected document
    private _parents: Array<Doc> = []; // array of parent docs (for pathbar)
    private _library: Doc = CurrentUserUtils.setupLibrary(this.userDoc); // to access documents in Dash Web

    constructor(props: Readonly<{}>) {
        super(props);
        MobileInterface.Instance = this;
    }

    @action
    componentDidMount = () => {
        // if the home menu is in list view -> adjust the menu toggle appropriately
        this._homeDoc._viewType === "stacking" ? this.menuListView = true : this.menuListView = false;
        Doc.SetSelectedTool(InkTool.None); // ink should intially be set to none
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
        if (!this.userDoc) return;
        if (this._activeDoc === this._homeDoc) {
            this._parents.push(this._activeDoc);
            this._homeMenu = false;
        }
        this._activeDoc = doc;
        Doc.UserDoc().activeMobile = doc;
        onSwitch && onSwitch();

        this.renderView = renderView;
        // Ensures that switching to home is not registed
        UndoManager.undoStack.length = 0;
        UndoManager.redoStack.length = 0;
    }

    // For toggling the hamburger menu
    @action
    toggleSidebar = () => {
        this.sidebarActive = !this.sidebarActive;

        if (this._ink) {
            this.onSwitchInking();
        }
    }
    /**
     * Method called when 'Library' button is pressed on the home screen
     */
    switchToLibrary = async () => {
        this.switchCurrentView(this._library);
        this._homeMenu = false;
        this.toggleSidebar();
        //setTimeout(this.toggleSidebar, 300);
    }

    /**
     * Back method for navigating through items
     */
    back = () => {
        const header = document.getElementById("header") as HTMLElement;
        const doc = Cast(this._parents.pop(), Doc) as Doc; // Parent document
        // Case 1: Parent document is 'workspaces'
        if (doc === Cast(this._library, Doc) as Doc) {
            this._child = null;
            this.switchCurrentView(this._library);
            // Case 2: Parent document is the 'home' menu (root node)
        } else if (doc === Cast(this._homeDoc, Doc) as Doc) {
            this._homeMenu = true;
            this._parents = [];
            this._child = null;
            this.switchCurrentView(this._homeDoc);
            // Case 3: Parent document is any document
        } else {
            if (doc) {
                this._child = doc;
                this.switchCurrentView(doc);
                this._homeMenu = false;
                header.textContent = String(doc.title);
            }
        }
        this._ink = false; // turns ink off
    }

    /**
     * Return 'Home", which implies returning to 'Home' menu buttons
     */
    returnHome = () => {
        if (!this._homeMenu || this.sidebarActive) {
            this._homeMenu = true;
            this._parents = [];
            this._child = null;
            this.switchCurrentView(this._homeDoc);
        }
        if (this.sidebarActive) {
            this.toggleSidebar();
        }
    }

    /**
     * Return to primary Workspace in library (Workspaces Doc)
     */
    returnMain = () => {
        this._parents = [this._homeDoc];
        this.switchCurrentView(this._library);
        this._homeMenu = false;
        this._child = null;
    }

    /**
     * DocumentView for graphic display of all documents
     */
    @computed get displayWorkspaces() {
        if (this.mainContainer) {
            const backgroundColor = () => "white";
            return (
                <div style={{ position: "relative", top: '198px', height: `calc(100% - 350px)`, width: "100%", left: "0%" }}>
                    <DocumentView
                        Document={this.mainContainer}
                        DataDoc={undefined}
                        LibraryPath={emptyPath}
                        addDocument={returnFalse}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        rootSelected={returnFalse}
                        removeDocument={undefined}
                        onClick={undefined}
                        ScreenToLocalTransform={Transform.Identity}
                        ContentScaling={returnOne}
                        PanelWidth={this.returnWidth}
                        PanelHeight={this.returnHeight}
                        NativeHeight={returnZero}
                        NativeWidth={returnZero}
                        renderDepth={0}
                        focus={emptyFunction}
                        backgroundColor={backgroundColor}
                        parentActive={returnTrue}
                        whenActiveChanged={emptyFunction}
                        bringToFront={emptyFunction}
                        docFilters={returnEmptyFilter}
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
                    />
                </div>
            );
        }
    }

    /**
     * Note: window.innerWidth and window.screen.width compute different values.
     * window.screen.width is the display size, however window.innerWidth is the
     * display resolution which computes differently.
     */
    returnWidth = () => window.innerWidth; //The windows width
    returnHeight = () => (window.innerHeight - 300); //Calculating the windows height (-300 to account for topbar)

    /**
     * Handles the click functionality in the library panel.
     * Navigates to the given doc and updates the sidebar.
     * @param doc: doc for which the method is called
     */
    handleClick = async (doc: Doc) => {
        const children = DocListCast(doc.data);
        if (doc.type !== "collection" && this.sidebarActive) {
            this._parents.push(this._activeDoc);
            this.switchCurrentView(doc);
            this._homeMenu = false;
            this.toggleSidebar();
        }
        else {
            this._parents.push(this._activeDoc);
            this.switchCurrentView(doc);
            this._homeMenu = false;
            this._child = doc;
        }
    }

    /**
     * Called when an item in the library is clicked and should
     * be opened (open icon on RHS of all menu items)
     * @param doc doc to be opened
     */
    openFromSidebar = (doc: Doc) => {
        this._parents.push(this._activeDoc);
        this.switchCurrentView(doc);
        this._homeMenu = false;
        this._child = doc;
        this.toggleSidebar();
    }

    /**
     * Handles creation of array which is then rendered in renderPathbar()
     */
    createPathname = () => {
        const docArray = [];
        this._parents.map((doc: Doc, index: any) => {
            docArray.push(doc);
        });
        docArray.push(this._activeDoc);
        return docArray;
    }

    // Renders the graphical pathbar
    renderPathbar = () => {
        const docArray = this.createPathname();
        const items = docArray.map((doc: Doc, index: any) => {
            if (index === 0) {
                return (
                    <>
                        {this._homeMenu ?
                            <div className="pathbarItem">
                                <div className="pathbarText"
                                    style={{ backgroundColor: "rgb(119, 37, 37)" }}
                                    key={index}
                                    onClick={() => this.handlePathClick(doc, index)}>{doc.title}
                                </div>
                            </div>
                            :
                            <div className="pathbarItem">
                                <div className="pathbarText"
                                    key={index}
                                    onClick={() => this.handlePathClick(doc, index)}>{doc.title}
                                </div>
                            </div>}
                    </>);

            } else if (doc === this._activeDoc) {
                return (
                    <div className="pathbarItem">
                        <FontAwesomeIcon className="pathIcon" icon="angle-right" size="lg" />
                        <div className="pathbarText"
                            style={{ backgroundColor: "rgb(119, 37, 37)" }}
                            key={index}
                            onClick={() => this.handlePathClick(doc, index)}>{doc.title}
                        </div>
                    </div>);
            } else {
                return (
                    <div className="pathbarItem">
                        <FontAwesomeIcon className="pathIcon" icon="angle-right" size="lg" />
                        <div className="pathbarText"
                            key={index}
                            onClick={() => this.handlePathClick(doc, index)}>{doc.title}
                        </div>
                    </div>);
            }

        });
        if (this._parents.length !== 0) {
            return (<div className="pathbar">
                <div className="scrollmenu">
                    {items}
                </div>
                <div className="back" >
                    <FontAwesomeIcon onClick={this.back} icon={"chevron-left"} color="white" size={"2x"} />
                </div>
                <div className="hidePath" />
            </div>);
        } else {
            return (<div className="pathbar">
                <div className="scrollmenu">
                    {items}
                </div>
                <div className="hidePath" />
            </div>);
        }
    }

    // Handles when user clicks on a document in the pathbar
    handlePathClick = (doc: Doc, index: number) => {
        if (doc === this._library) {
            this._child = null;
            this.switchCurrentView(doc);
            this._parents.length = index;
        } else if (doc === this._homeDoc) {
            this.returnHome();
        } else {
            this._child = doc;
            this.switchCurrentView(doc);
            this._parents.length = index;
        }
    }

    // Renders the contents of the menu and sidebar
    renderDefaultContent = () => {
        if (this._homeMenu) {
            return (
                <div>
                    <div className="navbar">
                        <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
                        <div className="header" id="header">{this._homeDoc.title}</div>
                        <div className="cover" id="cover" onClick={(e) => this.stop(e)}></div>
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
        // stores workspace documents as 'workspaces' variable
        let workspaces = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
        if (this._child) {
            workspaces = this._child;
        }
        // returns a list of navbar buttons as 'buttons'
        const buttons = DocListCast(workspaces.data).map((doc: Doc, index: any) => {
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
                    <div className="header" id="header">{this.sidebarActive ? "library" : this._activeDoc.title}</div>
                    <div className={`toggle-btn ${this.sidebarActive ? "active" : ""}`} onClick={this.toggleSidebar}>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <div className={`background ${this.sidebarActive ? "active" : ""}`} onClick={this.toggleSidebar}></div>
                </div>
                {this.renderPathbar()}
                <div className={`sidebar ${this.sidebarActive ? "active" : ""}`}>
                    <div className="sidebarButtons">
                        {this._child ?
                            <>
                                {buttons}
                                <div
                                    className="item" key="home"
                                    onClick={this.returnMain}
                                    style={{ opacity: 0.7 }}>
                                    <FontAwesomeIcon className="right" icon="angle-double-left" size="lg" />
                                    <div className="item-type">Return to workspaces</div>
                                </div>
                            </> :
                            <>
                                {buttons}
                                <div
                                    className="item"
                                    style={{ opacity: 0.7 }}
                                    onClick={() => this.createNewWorkspace()}>
                                    <FontAwesomeIcon className="right" icon="plus" size="lg" />
                                    <div className="item-type">Create New Workspace</div>
                                </div>
                            </>
                        }
                    </div>
                </div>
                <div className={`blanket ${this.sidebarActive ? "active" : ""}`} onClick={this.toggleSidebar}>
                </div>
            </div>
        );
    }

    /**
     * Handles the 'Create New Workspace' button in the menu (taken from MainView.tsx)
     */
    @action
    createNewWorkspace = async (id?: string) => {
        const workspaces = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
        const workspaceCount = DocListCast(workspaces.data).length + 1;
        const freeformOptions: DocumentOptions = {
            x: 0,
            y: 400,
            title: "Collection " + workspaceCount,
        };
        const freeformDoc = CurrentUserUtils.GuestTarget || Docs.Create.FreeformDocument([], freeformOptions);
        const workspaceDoc = Docs.Create.StandardCollectionDockingDocument([{ doc: freeformDoc, initialWidth: 600, path: [Doc.UserDoc().myCatalog as Doc] }], { title: `Workspace ${workspaceCount}` }, id, "row");

        const toggleTheme = ScriptField.MakeScript(`self.darkScheme = !self.darkScheme`);
        const toggleComic = ScriptField.MakeScript(`toggleComicMode()`);
        const cloneWorkspace = ScriptField.MakeScript(`cloneWorkspace()`);
        workspaceDoc.contextMenuScripts = new List<ScriptField>([toggleTheme!, toggleComic!, cloneWorkspace!]);
        workspaceDoc.contextMenuLabels = new List<string>(["Toggle Theme Colors", "Toggle Comic Mode", "New Workspace Layout"]);

        Doc.AddDocToList(workspaces, "data", workspaceDoc);
    }

    stop = (e: React.MouseEvent) => {
        e.stopPropagation();
    }

    // Button for switching between pen and ink mode
    @action
    onSwitchInking = () => {
        const button = document.getElementById("inkButton") as HTMLElement;
        button.style.backgroundColor = this._ink ? "white" : "black";
        button.style.color = this._ink ? "black" : "white";

        if (!this._ink) {
            Doc.SetSelectedTool(InkTool.Pen);
            this._ink = true;
        } else {
            Doc.SetSelectedTool(InkTool.None);
            this._ink = false;
        }
    }

    // The static ink menu that appears at the top
    inkMenu = () => {
        if (this._activeDoc._viewType === "docking") {
            if (this._ink) {
                return <div className="colorSelector">
                    <InkOptionsMenu />
                </div>;

            }
        }
    }

    // DocButton that uses UndoManager and handles the opacity change if CanUndo is true
    @computed get undo() {
        if (this.mainContainer) {
            if (this._activeDoc.type === "collection" && this._activeDoc !== this._homeDoc && this._activeDoc !== this.userDoc.rightSidebarCollection && this._activeDoc.title !== "WORKSPACES") {
                return (<>
                    <div className="docButton"
                        style={{ backgroundColor: "black", color: "white", fontSize: "60", opacity: UndoManager.CanUndo() ? "1" : "0.4", }}
                        id="undoButton"
                        title="undo"
                        onClick={(e: React.MouseEvent) => {
                            UndoManager.Undo();
                            e.stopPropagation();
                        }}>
                        <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="undo-alt" />
                    </div>
                </>);
            }
        }
    }

    // DocButton that uses UndoManager and handles the opacity change if CanRedo is true
    @computed get redo() {
        if (this.mainContainer) {
            if (this._activeDoc.type === "collection" && this._activeDoc !== this._homeDoc && this._activeDoc !== this.userDoc.rightSidebarCollection && this._activeDoc.title !== "WORKSPACES") {
                return (<>
                    <div className="docButton"
                        style={{ backgroundColor: "black", color: "white", fontSize: "60", opacity: UndoManager.CanRedo() ? "1" : "0.4", }}
                        id="undoButton"
                        title="redo"
                        onClick={(e: React.MouseEvent) => {
                            UndoManager.Redo();
                            e.stopPropagation();
                        }}>
                        <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="redo-alt" />
                    </div>
                </>);
            }
        }
    }

    // DocButton for switching into ink mode
    @computed get drawInk() {
        if (this.mainContainer) {
            if (this._activeDoc._viewType === "docking") {
                return (
                    <>
                        <div className="docButton"
                            id="inkButton"
                            title={Doc.isDocPinned(this._activeDoc) ? "Pen on" : "Pen off"}
                            onClick={this.onSwitchInking}>
                            <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="pen-nib"
                            />
                        </div>
                    </>);
            }
        }
    }

    // DocButton: Button that appears on the bottom of the screen to initiate image upload
    uploadImageButton = () => {
        if (this._activeDoc.type === "collection" && this._activeDoc !== this._homeDoc && this._activeDoc._viewType !== "docking" && this._activeDoc.title !== "WORKSPACES") {
            return <div className="docButton"
                id="imageButton"
                title={Doc.isDocPinned(this._activeDoc) ? "Pen on" : "Pen off"}
                onClick={this.toggleUpload}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="upload"
                />
            </div>;
        }
    }

    // DocButton to download images on the mobile
    downloadDocument = () => {
        if (this._activeDoc.type === "image" || this._activeDoc.type === "pdf" || this._activeDoc.type === "video") {
            const url = this._activeDoc["data-path"]?.toString();
            return <div className="docButton"
                title={"Download Image"}
                style={{ backgroundColor: "white", color: "black" }}
                onClick={e => {
                    window.open(url);
                }}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="download"
                />
            </div>;
        }
    }

    // DocButton for pinning images to presentation
    pinToPresentation = () => {
        // Only making button available if it is an image
        if (!(this._activeDoc.type === "collection" || this._activeDoc.type === "presentation")) {
            const isPinned = this._activeDoc && Doc.isDocPinned(this._activeDoc);
            return <div className="docButton"
                title={Doc.isDocPinned(this._activeDoc) ? "Unpin from presentation" : "Pin to presentation"}
                style={{ backgroundColor: isPinned ? "black" : "white", color: isPinned ? "white" : "black" }}
                onClick={e => {
                    if (isPinned) {
                        DockedFrameRenderer.UnpinDoc(this._activeDoc);
                    }
                    else {
                        DockedFrameRenderer.PinDoc(this._activeDoc);
                    }
                }}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="map-pin"
                />
            </div>;
        }
    }

    // Buttons for switching the menu between large and small icons
    switchMenuView = () => {
        if (this._activeDoc.title === this._homeDoc.title) {
            return (
                <div className="homeSwitch">
                    <div className={`list ${!this.menuListView ? "active" : ""}`} onClick={this.changeToIconView}>
                        <FontAwesomeIcon size="sm" icon="th-large" />
                    </div>
                    <div className={`list ${this.menuListView ? "active" : ""}`} onClick={this.changeToListView}>
                        <FontAwesomeIcon size="sm" icon="bars" />
                    </div>
                </div>
            );
        }
    }

    // Logic for switching the menu into the icons
    @action
    changeToIconView = () => {
        if (this._homeDoc._viewType = "stacking") {
            this.menuListView = false;
            this._homeDoc._viewType = "masonry";
            this._homeDoc.columnWidth = 300;
            const menuButtons = DocListCast(this._homeDoc.data);
            menuButtons.map((doc: Doc, index: any) => {
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
            this.menuListView = true;
            const menuButtons = DocListCast(this._homeDoc.data);
            menuButtons.map((doc: Doc, index: any) => {
                const buttonData = DocListCast(doc.data);
                buttonData[1]._nativeWidth = 450;
                buttonData[1]._dimMagnitude = 2;
                buttonData[1]._opacity = 1;
                doc._nativeWidth = 900;
            });
        }
    }

    // For setting up the presentation document for the home menu
    setupDefaultPresentation = () => {
        const presentation = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;

        if (presentation) {
            this.switchCurrentView(presentation);
            this._homeMenu = false;
        }
    }

    // For toggling image upload pop up
    @action
    toggleUpload = () => this.imageUploadActive = !this.imageUploadActive

    // For toggling audio record and dictate pop up
    @action
    toggleAudio = () => this.audioUploadActive = !this.audioUploadActive

    // Button for toggling the upload pop up in a collection
    @action
    toggleUploadInCollection = () => {
        const button = document.getElementById("imageButton") as HTMLElement;
        button.style.backgroundColor = this.imageUploadActive ? "white" : "black";
        button.style.color = this.imageUploadActive ? "black" : "white";

        this.imageUploadActive = !this.imageUploadActive;
    }

    // For closing the image upload pop up
    @action
    closeUpload = () => {
        this.imageUploadActive = false;
    }

    // Returns the image upload pop up
    uploadImage = () => {
        let doc;
        let toggle;
        if (this._homeMenu === false) {
            doc = this._activeDoc;
            toggle = this.toggleUploadInCollection;
        } else {
            doc = Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc;
            toggle = this.toggleUpload;
        }
        return (
            <Uploader Document={doc} />
        );
    }

    // Radial menu can only be used if it is a colleciton and it is not a homeDoc
    displayRadialMenu = () => {
        if (this._activeDoc.type === "collection" && this._activeDoc !== this._homeDoc) {
            return <RadialMenu />;
        }
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
    switchToMobileUploads = () => {
        const mobileUpload = Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc;
        this.switchCurrentView(mobileUpload);
        this._homeMenu = false;
    }

    render() {
        trace();
        return (
            <div className="mobileInterface-container" onDragOver={this.onDragOver}>
                <SettingsManager />
                <div className={`image-upload ${this.imageUploadActive ? "active" : ""}`}>
                    {this.uploadImage()}
                </div>
                <div className={`audio-upload ${this.audioUploadActive ? "active" : ""}`}>
                    <AudioUpload />
                </div>
                {this.switchMenuView()}
                {this.inkMenu()}
                <GestureOverlay>
                    <div style={{ display: "none" }}><RichTextMenu key="rich" /></div>
                    <div className="docButtonContainer">
                        {this.pinToPresentation()}
                        {this.downloadDocument()}
                        {this.undo}
                        {this.redo}
                        {this.drawInk}
                        {this.uploadImageButton()}
                    </div>
                    {this.displayWorkspaces}
                    {this.renderDefaultContent()}
                </GestureOverlay>
                {this.displayRadialMenu()}
            </div>
        );
    }
}


//Global functions for mobile menu
Scripting.addGlobal(function switchToMobileLibrary() { return MobileInterface.Instance.switchToLibrary(); },
    "opens the library to navigate through workspaces on Dash Mobile");
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
