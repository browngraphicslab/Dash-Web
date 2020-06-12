import * as React from "react";
import { library } from '@fortawesome/fontawesome-svg-core';
import {
    faTasks, faMobile, faThLarge, faWindowClose, faEdit, faTrashAlt, faPalette, faAngleRight, faBell, faTrash, faCamera, faExpand, faCaretDown, faCaretLeft, faCaretRight, faCaretSquareDown, faCaretSquareRight, faArrowsAltH, faPlus, faMinus,
    faTerminal, faToggleOn, faFile as fileSolid, faExternalLinkAlt, faLocationArrow, faSearch, faFileDownload, faStop, faCalculator, faWindowMaximize, faAddressCard,
    faQuestionCircle, faArrowLeft, faArrowRight, faArrowDown, faArrowUp, faBolt, faBullseye, faCaretUp, faCat, faCheck, faChevronRight, faClipboard, faClone, faCloudUploadAlt,
    faCommentAlt, faCompressArrowsAlt, faCut, faEllipsisV, faEraser, faExclamation, faFileAlt, faFileAudio, faFilePdf, faFilm, faFilter, faFont, faGlobeAsia, faHighlighter,
    faLongArrowAltRight, faMicrophone, faMousePointer, faMusic, faObjectGroup, faPause, faPen, faPenNib, faPhone, faPlay, faPortrait, faRedoAlt, faStamp, faStickyNote,
    faThumbtack, faTree, faTv, faBook, faUndoAlt, faVideo, faAsterisk, faBrain, faImage, faPaintBrush, faTimes, faEye, faHome, faLongArrowAltLeft, faBars, faTh, faChevronLeft
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as rp from 'request-promise';
import { Doc, DocListCast, FieldResult } from '../fields/Doc';
import { Id } from '../fields/FieldSymbols';
import { FieldValue, Cast, StrCast } from '../fields/Types';
import { CurrentUserUtils } from '../client/util/CurrentUserUtils';
import { emptyPath, emptyFunction, returnFalse, returnOne, returnTrue, returnZero, Utils } from '../Utils';
import { DocServer } from '../client/DocServer';
import { Docs } from '../client/documents/Documents';
import { Scripting } from '../client/util/Scripting';
import { DocumentView } from '../client/views/nodes/DocumentView';
import { Transform } from '../client/util/Transform';
// import { InkingControl } from '../client/views/InkingControl';
import "./MobileInterface.scss";
import "./MobileMenu.scss";
import "./MobileHome.scss";
import "./ImageUpload.scss";
import { DocumentManager } from '../client/util/DocumentManager';
import SettingsManager from '../client/util/SettingsManager';
import { Uploader } from "./ImageUpload";
import { DockedFrameRenderer } from '../client/views/collections/CollectionDockingView';
import { InkTool } from '../fields/InkField';
import { listSpec } from '../fields/Schema';
import { nullAudio, WebField } from '../fields/URLField';
import GestureOverlay from "../client/views/GestureOverlay";
import { SelectionManager } from "../client/util/SelectionManager";
import { SketchPicker } from "react-color";
import { ScriptField } from "../fields/ScriptField";

library.add(faTasks, faMobile, faThLarge, faWindowClose, faEdit, faTrashAlt, faPalette, faAngleRight, faBell, faTrash, faCamera, faExpand, faCaretDown, faCaretLeft, faCaretRight, faCaretSquareDown, faCaretSquareRight, faArrowsAltH, faPlus, faMinus,
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
    // @computed private get activeContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    // Sets up new mobile menu only if activeMobile already exists
    // @observable private mainDoc: any = this.userDoc.activeMobile === undefined ? CurrentUserUtils.setupMobileMenu() : this.userDoc.activeMobile;
    @observable private mainDoc: any = CurrentUserUtils.setupMobileMenu();
    @observable private renderView?: () => JSX.Element;
    @observable private audioState: any;
    @observable private activeToolbar: boolean = false;
    @observable private sidebarActive: boolean = false;
    @observable private imageUploadActive: boolean = false;
    @observable private menuListView: boolean = false;

    public _activeDoc: Doc = this.mainDoc;
    public _homeDoc: Doc = this.mainDoc;
    private _homeMenu: boolean = true;

    // private inkDoc?: Doc;
    public drawingInk: boolean = false;

    // private _uploadDoc: Doc = this.userDoc;
    private _child: Doc | null = null;
    private _parents: Array<Doc> = [];
    private _library: Doc = CurrentUserUtils.setupLibrary(this.userDoc);
    private _open: boolean = false;

    // private _library: Doc = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
    private _ink: boolean = false;

    constructor(props: Readonly<{}>) {
        super(props);
        MobileInterface.Instance = this;
    }

    @action
    componentDidMount = () => {
        library.add(...[faPenNib, faHighlighter, faEraser, faMousePointer, faThumbtack]);
        if (this.userDoc.activeMobile) {
            console.log(Doc.UserDoc().activeMobile);
        }
        if (this.userDoc && !this.mainContainer) {
            this.userDoc.activeMobile = this._homeDoc;
        }
        this._homeDoc._viewType === "stacking" ? this.menuListView = true : this.menuListView = false;
        // InkingStroke.switchTool(InkTool.None);
        MobileInterface.Instance.drawingInk = false;
        // InkingControl.Instance.updateSelectedColor("#FF0000");
        // InkingControl.Instance.switchWidth("2");
        this.switchCurrentView((userDoc: Doc) => this._homeDoc);
    }

    @action
    switchCurrentView = (doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) => {
        if (!this.userDoc) return;

        Doc.UserDoc().activeMobile = doc(this.userDoc);
        onSwitch && onSwitch();

        this.renderView = renderView;
    }

    onSwitchUpload = async () => {
        let width = 300;
        let height = 300;
        const res = await rp.get(Utils.prepend("/getUserDocumentId"));

        // get width and height of the collection doc
        if (this.mainContainer) {
            const data = Cast(this.mainContainer.data, listSpec(Doc));
            if (data) {
                const collectionDoc = await data[1]; // this should be the collection doc since the positions should be locked
                const docView = DocumentManager.Instance.getDocumentView(collectionDoc);
                if (docView) {
                    width = docView.nativeWidth ? docView.nativeWidth : 300;
                    height = docView.nativeHeight ? docView.nativeHeight : 300;
                }
            }
        }
        DocServer.Mobile.dispatchOverlayTrigger({
            enableOverlay: true,
            width: width,
            height: height,
            text: "Documents uploaded from mobile will show here",
        });
    }

    @action
    toggleSidebar = () => this.sidebarActive = !this.sidebarActive

    /**
     * Method called when 'Library' button is pressed
     */
    switchToLibrary = () => {
        this._parents.push(this._activeDoc);
        this.switchCurrentView((userDoc: Doc) => this._library);
        this._activeDoc = this._library;
        this._homeMenu = false;
        this.sidebarActive = true;
    }

    /**
     * Back method for navigating within library
     */
    back = () => {
        let header = document.getElementById("header") as HTMLElement;
        let doc = Cast(this._parents.pop(), Doc) as Doc;
        if (doc === Cast(this._library, Doc) as Doc) {
            this._child = null;
            this.userDoc.activeMobile = this._library;
        } else if (doc === Cast(this._homeDoc, Doc) as Doc) {
            this._homeMenu = true;
            this._parents = [];
            this._activeDoc = this._homeDoc;
            this._child = null;
            this.switchCurrentView((userDoc: Doc) => this._homeDoc);
        } else {
            if (doc) {
                this._child = doc;
                this.switchCurrentView((userDoc: Doc) => doc);
                this._homeMenu = false;
                header.textContent = String(doc.title);
            }
        }
        if (doc) {
            this._activeDoc = doc;
        }
        this._ink = false;
    }

    /**
     * Return 'Home", which implies returning to 'Home' buttons
     */
    returnHome = () => {
        if (this._homeMenu === false || this.sidebarActive === true) {
            this._homeMenu = true;
            this._parents = [];
            this._activeDoc = this._homeDoc;
            this._child = null;
            this.switchCurrentView((userDoc: Doc) => this._homeDoc);
        }
        if (this.sidebarActive) {
            this.toggleSidebar();
        }
    }

    /**
     * Return to primary Workspace in library (Workspaces Doc)
     */
    returnMain = () => {
        console.log("home");
        this._parents = [];
        // this.toggleSidebar();
        this._activeDoc = this._library;
        this.switchCurrentView((userDoc: Doc) => this._library);
        this._homeMenu = false;
        this._child = null;
    }

    // @computed get onChildClickHandler() { return ScriptCast(Doc.UserDoc.onClick); }

    /**
     * DocumentView for graphic display of all documents
     */
    displayWorkspaces = () => {
        if (this.mainContainer) {
            const backgroundColor = () => "white";
            return (
                <div style={{ position: "relative", top: '200px', height: `calc(100% - 200px)`, width: "100%", overflow: "hidden", left: "0%" }}>
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
                        ContainingCollectionView={undefined}
                        ContainingCollectionDoc={undefined}
                    />
                </div>
            );
        }
    }

    returnWidth = () => window.innerWidth; //The windows width
    returnHeight = () => (window.innerHeight - 300); //Calculating the windows height (-300 to account for topbar)

    /**
     * Handles the click functionality in the library panel
     * @param doc: doc for which the method is called
     */
    handleClick(doc: Doc) {
        let children = DocListCast(doc.data);
        if (doc.type !== "collection") {
            this._parents.push(this._activeDoc);
            this._activeDoc = doc;
            this.switchCurrentView((userDoc: Doc) => doc);
            this._homeMenu = false;
            this.toggleSidebar();
        } else if (doc.type === "collection" && children.length === 0) {
            console.log("This collection has no children");
        } else {
            this._parents.push(this._activeDoc);
            this._activeDoc = doc;
            this.switchCurrentView((userDoc: Doc) => doc);
            this._homeMenu = false;
            this._child = doc;
        }

        // let sidebar = document.getElementById("sidebar") as HTMLElement;
        // sidebar.classList.toggle('active');
    }

    /**
     * Handles creation of array which is then rendered in renderPathbar()
     */
    createPathname = () => {
        // let pathname = 'workspaces';
        // let titleArray = [];
        let docArray = [];
        this._parents.map((doc: Doc, index: any) => {
            docArray.push(doc);
        });
        docArray.push(this._activeDoc);
        return docArray;
    }

    // Renders the graphical pathbar
    renderPathbar = () => {
        // if (this._homeMenu == false) {
        let docArray = this.createPathname();
        let items = docArray.map((doc: Doc, index: any) => {
            if (index === 0) {
                return (
                    <div className="pathbarItem">
                        <div className="pathbarText"
                            key={index}
                            onClick={() => this.handlePathClick(doc, index)}>{doc.title}
                        </div>
                    </div>);
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
        //     }
        // } else {

        //     return (
        //         <div className="pathbar">
        //             <div className="scrollmenu">
        //                 <div className="pathbarItem">
        //                     <div className="pathbarText"
        //                         style={{ backgroundColor: "rgb(119, 37, 37)" }}
        //                         key={0}
        //                         onClick={() => this.returnHome()}>Home
        //                     </div>
        //                 </div>
        //             </div>
        //             <div className="hidePath" />
        //         </div>
        //     );
        // }

        // }
    }

    // Handles when user clicks on document in the pathbar
    handlePathClick = (doc: Doc, index: number) => {
        if (doc === this._library) {
            this._activeDoc = doc;
            this._child = null;
            this.switchCurrentView((userDoc: Doc) => doc);
            this._parents.length = index;
        } else if (doc === this._homeDoc) {
            this.returnHome();
        } else {
            this._activeDoc = doc;
            this._child = doc;
            this.switchCurrentView((userDoc: Doc) => doc);
            this._parents.length = index;
        }
    }

    renderDefaultContent = () => {
        let menuButtons = DocListCast(this._homeDoc.data).map((doc: Doc, index: any) => {
            if (doc.type !== "ink") {
                return (
                    <div
                        className="item"
                        key={index}
                        onClick={() => doc.onClick}>{doc.title}
                    </div>);
            }
        });

        if (this._homeMenu === true) {
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
                    <div className="sidebar" id="sidebar">
                        <div className="sidebarButtons">
                            {menuButtons}
                        </div>
                    </div>
                </div>
            );
        }

        let workspaces = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
        if (this._child) {
            workspaces = this._child
        }

        let buttons = DocListCast(workspaces.data).map((doc: Doc, index: any) => {
            if (doc.type !== "ink") {
                return (
                    <div
                        className="item"
                        key={index}
                        onClick={() => this.handleClick(doc)}>{doc.title}
                        <div className="type">{doc.type}</div>
                        <FontAwesomeIcon className="right" icon="angle-right" size="lg" />
                    </div>);
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
                </div>
                {this.renderPathbar()}
                <div className={`sidebar ${this.sidebarActive ? "active" : ""}`}>
                    <div className="sidebarButtons">
                        {this._child ?
                            <>
                                {buttons}
                                <div className="item" key="home" onClick={this.returnMain}>
                                    Return to library
                            </div>
                            </> :
                            <>
                                {buttons}
                            </>
                        }
                    </div>
                </div>
            </div>
        );
    }

    stop = (e: React.MouseEvent) => {
        e.stopPropagation();
    }

    uploadAudioButton = () => {
        if (this._activeDoc.type === "audio") {
            return <div className="docButton"
                title={Doc.isDocPinned(this._activeDoc) ? "Pen on" : "Pen off"}
                style={{ backgroundColor: "black", color: "white" }}
                onClick={this.uploadAudio}
            >
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="upload"
                />
            </div>;
        }
    }


    @action
    toggleSelector = () => this.activeToolbar = !this.activeToolbar


    colorTool = () => {
        if (this._activeDoc._viewType === "docking") {
            // const color = InkingControl.Instance.selectedColor;
            const color = "lightpink";
            const selDoc = SelectionManager.SelectedDocuments()?.[0]?.rootDoc;
            return (
                <div
                    className="docButton"
                    style={{ backgroundColor: color }}
                    onClick={this.toggleSelector}
                >
                    <div className={`toolbar ${this.activeToolbar ? "active" : ""}`}>
                        <div className="colorSelector">
                            {/* <SketchPicker onChange={InkingControl.Instance.switchColor} presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF', '#f1efeb', 'transparent']}
                                color={StrCast(CurrentUserUtils.ActivePen ? CurrentUserUtils.ActivePen.backgroundColor : undefined,
                                StrCast(selDoc?._backgroundColor, StrCast(selDoc?.backgroundColor, "black")))} /> */}
                        </div>
                        <div className="widthSelector">
                            {/* <input type="range" min="1" max="100" defaultValue="2" id="myRange" onChange={(e: React.ChangeEvent<HTMLInputElement>) => InkingControl.Instance.switchWidth(e.target.value)} /> */}
                        </div>
                    </div>
                </div>
            );
        }
    }

    onSwitchInking = () => {
        const button = document.getElementById("inkButton") as HTMLElement;
        // const color = InkingControl.Instance.selectedColor;
        const color = "lightpink";
        button.style.backgroundColor = this._ink ? "white" : color;
        button.style.color = this._ink ? "black" : "white";

        if (!this._ink) {
            console.log("INK IS ACTIVE");
            // InkingControl.Instance.switchTool(InkTool.Pen);
            MobileInterface.Instance.drawingInk = true;
            this._ink = true;
        } else {
            console.log("INK IS INACTIVE");
            // InkingControl.Instance.switchTool(InkTool.None);
            MobileInterface.Instance.drawingInk = false;
            this._ink = false;
        }
    }

    drawInk = () => {
        if (this._activeDoc._viewType === "docking") {
            const inkIsOn = this._ink;
            return <div className="docButton"
                id="inkButton"
                title={Doc.isDocPinned(this._activeDoc) ? "Pen on" : "Pen off"}
                onClick={this.onSwitchInking}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="pen-nib"
                />
            </div>;
        }
    }

    downloadDocument = () => {
        if (this._activeDoc.type === "image") {
            const url = this._activeDoc["data-path"]?.toString();
            return <div className="docButton"
                title={"Download Image"}
                style={{ backgroundColor: "white", color: "black" }}
                onClick={e => {
                    window.open(url);
                    console.log(url);
                }}>
                <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="download"
                />
            </div>;
        }
    }

    recordAudio = async () => {
        // upload to server with known URL
        if (this._activeDoc.title !== "mobile audio") {
            this._parents.push(this._activeDoc);
        }
        const audioDoc = Cast(Docs.Create.AudioDocument(nullAudio, { _width: 200, _height: 100, title: "mobile audio" }), Doc) as Doc;
        if (audioDoc) {
            this._activeDoc = audioDoc;
            this.switchCurrentView((userDoc: Doc) => audioDoc);
            this._homeMenu = false;
            // this.toggleSidebar();
        }
        // const audioRightSidebar = Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc;
        // this.audioState = await audioDoc.getProto;
        // if (this.audioState) {
        //     console.log(this.audioState);
        //     const data = Cast(audioRightSidebar.data, listSpec(Doc));
        //     if (data) {
        //         data.push(audioDoc);
        //     }
        // }
    }

    uploadAudio = () => {
        const audioRightSidebar = Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc;
        const audioDoc = this._activeDoc;
        const data = Cast(audioRightSidebar.data, listSpec(Doc));
        if (data) {
            data.push(audioDoc);
        }
        // this.recordAudio();
    }

    // renderActiveCollection = (userDoc: Doc) => {
    //     if (this.activeContainer) {
    //         const active = Cast(this.activeContainer.data, listSpec(Doc));
    //         if (active) {
    //             return (
    //                 <div className="mobileInterface-background">HELLO!</div>
    //             );
    //         }
    //     }
    // }

    onBack = (e: React.MouseEvent) => {
        this.switchCurrentView((userDoc: Doc) => this.mainDoc);
        Doc.SetSelectedTool(InkTool.None); // TODO: switch to previous tool

        DocServer.Mobile.dispatchOverlayTrigger({
            enableOverlay: false,
            width: window.innerWidth,
            height: window.innerHeight
        });

        // this.inkDoc = undefined;
        this.drawingInk = false;
    }

    shiftLeft = (e: React.MouseEvent) => {
        DocServer.Mobile.dispatchOverlayPositionUpdate({
            dx: -10
        });
        e.preventDefault();
        e.stopPropagation();
    }

    shiftRight = (e: React.MouseEvent) => {
        DocServer.Mobile.dispatchOverlayPositionUpdate({
            dx: 10
        });
        e.preventDefault();
        e.stopPropagation();
    }

    panelHeight = () => window.innerHeight;
    panelWidth = () => window.innerWidth;
    //WAS 3

    //WAS 1

    upload = async (e: React.MouseEvent) => {
        if (this.mainContainer) {
            const data = Cast(this.mainContainer.data, listSpec(Doc));
            if (data) {
                const collectionDoc = await data[1]; //this should be the collection doc since the positions should be locked
                const children = DocListCast(collectionDoc.data);
                const uploadDoc = children.length === 1 ? children[0] : Docs.Create.StackingDocument(children, {
                    title: "Mobile Upload Collection", backgroundColor: "white", lockedPosition: true, _width: 300, _height: 300
                });
                if (uploadDoc) {
                    DocServer.Mobile.dispatchMobileDocumentUpload({
                        docId: uploadDoc[Id],
                    });
                }
            }
        }
        e.stopPropagation();
        e.preventDefault();
    }

    addWebToCollection = async () => {
        let url = "https://en.wikipedia.org/wiki/Hedgehog";
        if (this.mainContainer) {
            const data = Cast(this.mainContainer.data, listSpec(Doc));
            if (data) {
                const webDoc = await data[0];
                const urlField: FieldResult<WebField> = Cast(webDoc.data, WebField);
                url = urlField ? urlField.url.toString() : "https://en.wikipedia.org/wiki/Hedgehog";

            }
        }
        Docs.Create.WebDocument(url, { _width: 300, _height: 300, title: "Mobile Upload Web Doc" });
    }

    clearUpload = async () => {
        if (this.mainContainer) {
            const data = Cast(this.mainContainer.data, listSpec(Doc));
            if (data) {
                const collectionDoc = await data[1];
                const children = DocListCast(collectionDoc.data);
                children.forEach(doc => {
                });
                // collectionDoc[data] = new List<Doc>();
            }
        }
    }

    pinToPresentation = () => {
        // Only making button available if it is an image
        if (this._activeDoc.type === "image") {
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

    @action
    changeToIconView = () => {
        if (this._homeDoc._viewType = "stacking") {
            this.menuListView = false;
            this._homeDoc._viewType = "masonry";
            this._homeDoc.columnWidth = 300;
            const menuButtons = DocListCast(this._homeDoc.data);
            console.log('hello');
            menuButtons.map((doc: Doc, index: any) => {
                console.log(index);
                const buttonData = DocListCast(doc.data);
                buttonData[1]._nativeWidth = 0.1;
                buttonData[1]._width = 0.1;
                buttonData[1]._dimMagnitude = 0;
                buttonData[1]._opacity = 0;
                console.log(buttonData);
                console.log(doc._nativeWidth);
                doc._nativeWidth = 400;
                console.log(doc._nativeWidth);
            });
        }
    }

    @action
    changeToListView = () => {
        if (this._homeDoc._viewType = "masonry") {
            this._homeDoc._viewType = "stacking";
            this.menuListView = true;
            const menuButtons = DocListCast(this._homeDoc.data);
            console.log('hello');
            menuButtons.map((doc: Doc, index: any) => {
                const buttonData = DocListCast(doc.data);
                buttonData[1]._nativeWidth = 450;
                buttonData[1]._dimMagnitude = 2;
                buttonData[1]._opacity = 1;
                console.log(doc._nativeWidth);
                doc._nativeWidth = 900;
                console.log(doc._nativeWidth);
            });
        }
    }

    setupDefaultPresentation = () => {
        if (this._activeDoc.title !== "Presentation") {
            this._parents.push(this._activeDoc);
        }

        const presentation = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;

        if (presentation) {
            console.log("presentation clicked: " + presentation.title);
            this._activeDoc = presentation;
            this.switchCurrentView((userDoc: Doc) => presentation);
            this._homeMenu = false;
            // this.toggleSidebar();
        }
    }

    onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }

    render() {
        // const content = this.currentView === "main" ? this.mainContent :
        //     this.currentView === "ink" ? this.inkContent :
        //         this.currentView === "upload" ? this.uploadContent : <></>;onDragOver={this.onDragOver}
        return (
            <div className="mobileInterface-container" onDragOver={this.onDragOver}>
                {/* <DocumentDecorations />
                <GestureOverlay>
                    {this.renderView ? this.renderView() : this.renderDefaultContent()}
                </GestureOverlay> */}
                {/* <GestureOverlay> */}
                <SettingsManager />
                {/* {this.menuOptions()} */}
                {/* {this.displayHome()} */}
                <div className={`image-upload ${this.imageUploadActive ? "active" : ""}`}>
                    {this.uploadImage()}
                </div>
                {this.switchMenuView()}
                <div className="docButtonContainer">
                    {this.pinToPresentation()}
                    {this.downloadDocument()}
                    {this.drawInk()}
                    {this.uploadAudioButton()}
                    {this.colorTool()}
                </div>
                <GestureOverlay>
                    {this.displayWorkspaces()}
                    {this.renderDefaultContent()}
                </GestureOverlay>
                {/* </GestureOverlay> */}
                {/* <DictationOverlay />
                <SharingManager />
                <GoogleAuthenticationManager /> */}
                {/* <DocumentDecorations /> */}
                {/* <div>
                    {this.renderDefaultContent()}
                </div> */}
                {/* <PreviewCursor /> */}
                {/* <ContextMenu /> */}
                {/* <RadialMenu />
                <RichTextMenu /> */}
                {/* <PDFMenu />
                <MarqueeOptionsMenu />
                <OverlayView /> */}
            </div>
        );
    }

    @action
    toggleUpload = () => this.imageUploadActive = !this.imageUploadActive


    @action
    closeUpload = () => {
        this.imageUploadActive = false;
    }

    // toggleUpload = () => {
    //     if (this.imageUploadActive === true) {
    //         this.imageUploadActive = false;
    //     } else {
    //         this.imageUploadActive = true;
    //     }
    // }

    uploadImage = () => {
        if (this.imageUploadActive) {
            console.log("active");
        } else if (!this.imageUploadActive) {

        }
        console.log("upload");
        return (
            <div>
                <div className="closeUpload" onClick={this.toggleUpload}>
                    <FontAwesomeIcon icon="window-close" size={"lg"} />
                </div>
                <Uploader />
            </div>
        );
    }
}



const inputRef = React.createRef<HTMLInputElement>();


Scripting.addGlobal(function switchMobileView(doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) { return MobileInterface.Instance.switchCurrentView(doc, renderView, onSwitch); });
Scripting.addGlobal(function openMobilePresentation() { return MobileInterface.Instance.setupDefaultPresentation(); });
Scripting.addGlobal(function toggleMobileSidebar() { return MobileInterface.Instance.toggleSidebar(); });
Scripting.addGlobal(function openMobileAudio() { return MobileInterface.Instance.recordAudio(); });
Scripting.addGlobal(function openMobileSettings() { return SettingsManager.Instance.open(); });
Scripting.addGlobal(function switchToLibrary() { return MobileInterface.Instance.switchToLibrary(); });
Scripting.addGlobal(function uploadImageMobile() { return MobileInterface.Instance.toggleUpload(); });



// WAS 2

// 1
// renderUploadContent() {
//     if (this.mainContainer) {
//         return (
//             <div className="mobileInterface" onDragOver={this.onDragOver}>
//                 <div className="mobileInterface-inkInterfaceButtons">
//                     <button className="mobileInterface-button cancel" onClick={this.onBack} title="Back">BACK</button>
//                     {/* <button className="mobileInterface-button" onClick={this.clearUpload} title="Clear Upload">CLEAR</button> */}
//                     {/* <button className="mobileInterface-button" onClick={this.addWeb} title="Add Web Doc to Upload Collection"></button> */}
//                     <button className="mobileInterface-button" onClick={this.upload} title="Upload">UPLOAD</button>
//                 </div>
//                 <DocumentView
//                     Document={this.mainContainer}
//                     DataDoc={undefined}
//                     LibraryPath={emptyPath}
//                     addDocument={returnFalse}
//                     addDocTab={returnFalse}
//                     pinToPres={emptyFunction}
//                     rootSelected={returnFalse}
//                     removeDocument={undefined}
//                     onClick={undefined}
//                     ScreenToLocalTransform={Transform.Identity}
//                     ContentScaling={returnOne}
//                     NativeHeight={returnZero}
//                     NativeWidth={returnZero}
//                     PanelWidth={() => window.screen.width}
//                     PanelHeight={() => window.screen.height}
//                     renderDepth={0}
//                     focus={emptyFunction}
//                     backgroundColor={returnEmptyString}
//                     parentActive={returnTrue}
//                     whenActiveChanged={emptyFunction}
//                     bringToFront={emptyFunction}
//                     ContainingCollectionView={undefined}
//                     ContainingCollectionDoc={undefined} />
//             </div>
//         );
//     }
// }

// 3
    // renderInkingContent = () => {
        //     console.log("rendering inking content");
        //     // TODO: support panning and zooming
        //     // TODO: handle moving of ink strokes
        //     if (this.mainContainer) {
        //         return (
        //             <div className="mobileInterface">
        //                 <div className="mobileInterface-inkInterfaceButtons">
        //                     <div className="navButtons">
        //                         <button className="mobileInterface-button cancel" onClick={this.onBack} title="Cancel drawing">BACK</button>
        //                     </div>
        //                     <div className="inkSettingButtons">
        //                         <button className="mobileInterface-button cancel" onClick={this.onBack} title="Cancel drawing"><FontAwesomeIcon icon="long-arrow-alt-left" /></button>
        //                     </div>
        //                     <div className="navButtons">
        //                         <button className="mobileInterface-button" onClick={this.shiftLeft} title="Shift left">left</button>
        //                         <button className="mobileInterface-button" onClick={this.shiftRight} title="Shift right">right</button>
        //                     </div>
        //                 </div>
        //                 <CollectionView
        //                     Document={this.mainContainer}
        //                     DataDoc={undefined}
        //                     LibraryPath={emptyPath}
        //                     fieldKey={""}
        //                     dropAction={"alias"}
        //                     bringToFront={emptyFunction}
        //                     addDocTab={returnFalse}
        //                     pinToPres={emptyFunction}
        //                     PanelWidth={this.panelWidth}
        //                     PanelHeight={this.panelHeight}
        //                     NativeHeight={returnZero}
        //                     NativeWidth={returnZero}
        //                     focus={emptyFunction}
        //                     isSelected={returnFalse}
        //                     select={emptyFunction}
        //                     active={returnFalse}
        //                     ContentScaling={returnOne}
        //                     whenActiveChanged={returnFalse}
        //                     ScreenToLocalTransform={Transform.Identity}
        //                     renderDepth={0}
        //                     ContainingCollectionView={undefined}
        //                     ContainingCollectionDoc={undefined}
        //                     rootSelected={returnTrue}>
        //                 </CollectionView>
        //             </div>
        //         );
        //     }
        // }
