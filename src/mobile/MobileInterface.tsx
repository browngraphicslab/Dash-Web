import * as React from "react";
import { library } from '@fortawesome/fontawesome-svg-core';
import {
    faTasks, faEdit, faTrashAlt, faPalette, faAngleRight, faBell, faTrash, faCamera, faExpand, faCaretDown, faCaretLeft, faCaretRight, faCaretSquareDown, faCaretSquareRight, faArrowsAltH, faPlus, faMinus,
    faTerminal, faToggleOn, faFile as fileSolid, faExternalLinkAlt, faLocationArrow, faSearch, faFileDownload, faStop, faCalculator, faWindowMaximize, faAddressCard,
    faQuestionCircle, faArrowLeft, faArrowRight, faArrowDown, faArrowUp, faBolt, faBullseye, faCaretUp, faCat, faCheck, faChevronRight, faClipboard, faClone, faCloudUploadAlt,
    faCommentAlt, faCompressArrowsAlt, faCut, faEllipsisV, faEraser, faExclamation, faFileAlt, faFileAudio, faFilePdf, faFilm, faFilter, faFont, faGlobeAsia, faHighlighter,
    faLongArrowAltRight, faMicrophone, faMousePointer, faMusic, faObjectGroup, faPause, faPen, faPenNib, faPhone, faPlay, faPortrait, faRedoAlt, faStamp, faStickyNote,
    faThumbtack, faTree, faTv, faUndoAlt, faVideo, faAsterisk, faBrain, faImage, faPaintBrush, faTimes, faEye, faHome, faLongArrowAltLeft, faBars, faTh, faChevronLeft
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
import { InkingControl } from '../client/views/InkingControl';
import "./MobileInterface.scss";
import "./MobileMenu.scss";
import "./MobileHome.scss";
import { DocumentManager } from '../client/util/DocumentManager';
import SettingsManager from '../client/util/SettingsManager';
import { Uploader } from "./ImageUpload";
import { DockedFrameRenderer } from '../client/views/collections/CollectionDockingView';
import { InkTool } from '../fields/InkField';
import { listSpec } from '../fields/Schema';
import { nullAudio, WebField } from '../fields/URLField';
import GestureOverlay from "../client/views/GestureOverlay";

library.add(faTasks, faEdit, faTrashAlt, faPalette, faAngleRight, faBell, faTrash, faCamera, faExpand, faCaretDown, faCaretLeft, faCaretRight, faCaretSquareDown, faCaretSquareRight, faArrowsAltH, faPlus, faMinus,
    faTerminal, faToggleOn, fileSolid, faExternalLinkAlt, faLocationArrow, faSearch, faFileDownload, faStop, faCalculator, faWindowMaximize, faAddressCard,
    faQuestionCircle, faArrowLeft, faArrowRight, faArrowDown, faArrowUp, faBolt, faBullseye, faCaretUp, faCat, faCheck, faChevronRight, faClipboard, faClone, faCloudUploadAlt,
    faCommentAlt, faCompressArrowsAlt, faCut, faEllipsisV, faEraser, faExclamation, faFileAlt, faFileAudio, faFilePdf, faFilm, faFilter, faFont, faGlobeAsia, faHighlighter,
    faLongArrowAltRight, faMicrophone, faMousePointer, faMusic, faObjectGroup, faPause, faPen, faPenNib, faPhone, faPlay, faPortrait, faRedoAlt, faStamp, faStickyNote,
    faThumbtack, faTree, faTv, faUndoAlt, faVideo, faAsterisk, faBrain, faImage, faPaintBrush, faTimes, faEye, faHome, faLongArrowAltLeft, faBars, faTh, faChevronLeft);

// @observer
// export class MobileInterface extends React.Component {
//     @observable static Instance: MobileInterface;
//     @computed private get userDoc() { return Doc.UserDoc(); }
//     @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
//     @computed private get activeContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
//     // @observable private currentView: "main" | "ink" | "upload" = "main";
//     @observable private mainDoc: any = CurrentUserUtils.setupMobileDoc(this.userDoc);
//     @observable private renderView?: () => JSX.Element;
//     @observable private sidebarActive = true;

//     public _activeDoc: Doc = this.mainDoc;
//     public _homeDoc: Doc = this.mainDoc;
//     private _homeMenu: boolean = true;

//     // private inkDoc?: Doc;
//     public drawingInk: boolean = false;
//     private _ink: boolean = false;

//     // private _uploadDoc: Doc = this.userDoc;
//     private _child: Doc | null = null;
//     private _parents: Array<Doc> = [];
//     private _library: Doc = CurrentUserUtils.setupLibrary(this.userDoc);
//     private _open: boolean = false;

//     constructor(props: Readonly<{}>) {
//         super(props);
//         MobileInterface.Instance = this;
//     }

//     @action
//     componentDidMount = () => {
//         library.add(...[faPenNib, faHighlighter, faEraser, faMousePointer, faThumbtack]);

//         if (this.userDoc && !this.mainContainer) {
//             this.userDoc.activeMobile = this._homeDoc;
//         }

//         InkingControl.Instance.switchTool(InkTool.None);
//         MobileInterface.Instance.drawingInk = false;
//         InkingControl.Instance.updateSelectedColor("#FF0000");
//         InkingControl.Instance.switchWidth("2");
//         this.switchCurrentView((userDoc: Doc) => this._homeDoc);
//     }

//     @action
//     switchCurrentView = (doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) => {
//         if (!this.userDoc) return;

//         this.userDoc.activeMobile = doc(this.userDoc);
//         onSwitch && onSwitch();

//         this.renderView = renderView;
//     }

//     onSwitchInking = () => {
//         const button = document.getElementById("inkButton") as HTMLElement;
//         const color = InkingControl.Instance.selectedColor;
//         button.style.backgroundColor = this._ink ? "white" : color;
//         button.style.color = this._ink ? "black" : "white";

//         if (!this._ink) {
//             console.log("INK IS ACTIVE");
//             InkingControl.Instance.switchTool(InkTool.Pen);
//             MobileInterface.Instance.drawingInk = true;
//             this._ink = true;
//         } else {
//             console.log("INK IS INACTIVE");
//             InkingControl.Instance.switchTool(InkTool.None);
//             MobileInterface.Instance.drawingInk = false;
//             this._ink = false;
//         }
//     }

//     onSwitchUpload = async () => {
//         let width = 300;
//         let height = 300;
//         const res = await rp.get(Utils.prepend("/getUserDocumentId"));

//         // get width and height of the collection doc
//         if (this.mainContainer) {
//             const data = Cast(this.mainContainer.data, listSpec(Doc));
//             if (data) {
//                 const collectionDoc = await data[1]; // this should be the collection doc since the positions should be locked
//                 const docView = DocumentManager.Instance.getDocumentView(collectionDoc);
//                 if (docView) {
//                     width = docView.nativeWidth ? docView.nativeWidth : 300;
//                     height = docView.nativeHeight ? docView.nativeHeight : 300;
//                 }
//             }
//         }
//         DocServer.Mobile.dispatchOverlayTrigger({
//             enableOverlay: true,
//             width: width,
//             height: height,
//             text: "Documents uploaded from mobile will show here",
//         });
//     }

//     back = () => {
//         let header = document.getElementById("header") as HTMLElement;
//         let doc = Cast(this._parents.pop(), Doc) as Doc;
//         if (doc === Cast(this._library, Doc) as Doc) {
//             this._child = null;
//             this.userDoc.activeMobile = this._library;
//         } else if (doc === Cast(this._homeDoc, Doc) as Doc) {
//             this._homeMenu = true;
//             this._parents = [];
//             this._activeDoc = this._homeDoc;
//             this._child = null;
//             this.switchCurrentView((userDoc: Doc) => this._homeDoc);
//         } else {
//             if (doc) {
//                 this._child = doc;
//                 this.switchCurrentView((userDoc: Doc) => doc);
//                 this._homeMenu = false;
//                 header.textContent = String(doc.title);
//             }
//         }
//         if (doc) {
//             this._activeDoc = doc;
//         }
//         this._ink = false;
//     }

//     returnHome = () => {
//         if (this._homeMenu === false || this._open === true) {
//             this._homeMenu = true;
//             this._parents = [];
//             this._activeDoc = this._homeDoc;
//             this._child = null;
//             this.switchCurrentView((userDoc: Doc) => this._homeDoc);
//         }
//         if (this._open) {
//             this.toggleSidebar();
//         }
//     }

//     returnMain = () => {
//         this._parents = [];
//         // this.toggleSidebar();
//         this._activeDoc = this._library;
//         this.switchCurrentView((userDoc: Doc) => this._library);
//         this._homeMenu = false;
//         this._child = null;
//     }

//     displayWorkspaces = () => {
//         if (this.mainContainer) {
//             const backgroundColor = () => "white";
//             if (this._activeDoc.title === "mobile audio") {
//                 return (
//                     <div style={{ position: "relative", top: '600px', height: `calc(50% - 450px)`, width: "80%", overflow: "hidden", left: "10%", cursor: "pointer" }}>
//                         <DocumentView
//                             Document={this.mainContainer}
//                             DataDoc={undefined}
//                             LibraryPath={emptyPath}
//                             addDocument={returnFalse}
//                             addDocTab={returnFalse}
//                             pinToPres={emptyFunction}
//                             rootSelected={returnFalse}
//                             removeDocument={undefined}
//                             onClick={undefined}
//                             ScreenToLocalTransform={Transform.Identity}
//                             ContentScaling={returnOne}
//                             NativeHeight={returnZero}
//                             NativeWidth={returnZero}
//                             PanelWidth={() => window.screen.width}
//                             PanelHeight={() => window.screen.height}
//                             renderDepth={0}
//                             focus={emptyFunction}
//                             backgroundColor={backgroundColor}
//                             parentActive={returnTrue}
//                             whenActiveChanged={emptyFunction}
//                             bringToFront={emptyFunction}
//                             ContainingCollectionView={undefined}
//                             ContainingCollectionDoc={undefined}
//                         />
//                     </div>
//                 );
//             } else {
//                 return (
//                     <div style={{ position: "relative", top: '200px', height: `calc(100% - 200px)`, width: "100%", overflow: "hidden", left: "0%" }}>
//                         <DocumentView
//                             Document={this.mainContainer}
//                             DataDoc={undefined}
//                             LibraryPath={emptyPath}
//                             addDocument={returnFalse}
//                             addDocTab={returnFalse}
//                             pinToPres={emptyFunction}
//                             rootSelected={returnFalse}
//                             removeDocument={undefined}
//                             onClick={undefined}
//                             ScreenToLocalTransform={Transform.Identity}
//                             ContentScaling={returnOne}
//                             PanelWidth={this.returnWidth}
//                             PanelHeight={this.returnHeight}
//                             NativeHeight={returnZero}
//                             NativeWidth={returnZero}
//                             renderDepth={0}
//                             focus={emptyFunction}
//                             backgroundColor={backgroundColor}
//                             parentActive={returnTrue}
//                             whenActiveChanged={emptyFunction}
//                             bringToFront={emptyFunction}
//                             ContainingCollectionView={undefined}
//                             ContainingCollectionDoc={undefined}
//                         // mobile={true}
//                         />
//                     </div>
//                 );
//             }
//         }
//     }

//     returnWidth = () => 2000;
//     returnHeight = () => 2000;

//     handleClick(doc: Doc) {
//         let children = DocListCast(doc.data);
//         if (doc.type !== "collection") {
//             this._parents.push(this._activeDoc);
//             this._activeDoc = doc;
//             this.switchCurrentView((userDoc: Doc) => doc);
//             this._homeMenu = false;
//             this.toggleSidebar();
//         } else if (doc.type === "collection" && children.length === 0) {
//             console.log("This collection has no children");
//         } else {
//             this._parents.push(this._activeDoc);
//             this._activeDoc = doc;
//             this.switchCurrentView((userDoc: Doc) => doc);
//             this._homeMenu = false;
//             this._child = doc;
//         }

//         // let sidebar = document.getElementById("sidebar") as HTMLElement;
//         // sidebar.classList.toggle('active');
//     }

//     createPathname = () => {
//         let docArray = [];
//         this._parents.map((doc: Doc, index: any) => {
//             // if (doc === this.mainDoc) {
//             //     pathname = pathname;
//             // } else if (doc.type === "audio" || doc.type === "presentation") {
//             //     pathname = pathname;
//             // } else if (doc.type !== "collection") {
//             //     pathname = pathname;
//             // } else {
//             //     pathname = pathname + " > " + doc.title;
//             //     titleArray.push(doc.title);
//             //     docArray.push(doc);
//             // }
//             docArray.push(doc);
//         });
//         docArray.push(this._activeDoc);
//         // if (this._activeDoc.title === "mobile audio") {
//         //     pathname = this._activeDoc.title;
//         // } else if (this._activeDoc.title === "Presentation") {
//         //     pathname = this._activeDoc.title;
//         // } else if (this._activeDoc === this.mainDoc) {
//         //     pathname = pathname;
//         // } else {
//         //     pathname = pathname + " > " + this._activeDoc.title;
//         //     docArray.push(this._activeDoc);
//         //     titleArray.push(this._activeDoc.title);
//         // }

//         return docArray;
//     }

//     renderPathbar = () => {
//         // if (this._homeMenu == false) {
//         let docArray = this.createPathname();
//         let items = docArray.map((doc: Doc, index: any) => {
//             if (index == 0) {
//                 return (
//                     <div className="pathbarItem">
//                         <div className="pathbarText"
//                             key={index}
//                             onClick={() => this.handlePathClick(doc, index)}>{doc.title}
//                         </div>
//                     </div>);
//             } else if (doc === this._activeDoc) {
//                 return (
//                     <div className="pathbarItem">
//                         <FontAwesomeIcon className="pathIcon" icon="angle-right" size="lg" />
//                         <div className="pathbarText"
//                             style={{ backgroundColor: "rgb(119, 37, 37)" }}
//                             key={index}
//                             onClick={() => this.handlePathClick(doc, index)}>{doc.title}
//                         </div>
//                     </div>);
//             } else {
//                 return (
//                     <div className="pathbarItem">
//                         <FontAwesomeIcon className="pathIcon" icon="angle-right" size="lg" />
//                         <div className="pathbarText"
//                             key={index}
//                             onClick={() => this.handlePathClick(doc, index)}>{doc.title}
//                         </div>
//                     </div>);
//             }

//         });
//         if (this._parents.length !== 0) {
//             return (<div className="pathbar">
//                 <div className="scrollmenu">
//                     {items}
//                 </div>
//                 <div className="back" >
//                     <FontAwesomeIcon onClick={this.back} icon={"chevron-left"} color="white" size={"2x"} />
//                 </div>
//                 <div className="hidePath" />
//             </div>);
//         } else {
//             return (<div className="pathbar">
//                 <div className="scrollmenu">
//                     {items}
//                 </div>
//                 <div className="hidePath" />
//             </div>);
//         }
//         //     }
//         // } else {

//         //     return (
//         //         <div className="pathbar">
//         //             <div className="scrollmenu">
//         //                 <div className="pathbarItem">
//         //                     <div className="pathbarText"
//         //                         style={{ backgroundColor: "rgb(119, 37, 37)" }}
//         //                         key={0}
//         //                         onClick={() => this.returnHome()}>Home
//         //                     </div>
//         //                 </div>
//         //             </div>
//         //             <div className="hidePath" />
//         //         </div>
//         //     );
//         // }

//         // }
//     }

//     handlePathClick = (doc: Doc, index: number) => {
//         if (doc === this._library) {
//             this._activeDoc = doc;
//             this._child = null;
//             this.switchCurrentView((userDoc: Doc) => doc);
//             this._parents.length = index;
//         } else if (doc === this._homeDoc) {
//             this.returnHome();
//         } else {
//             console.log(index);
//             this._activeDoc = doc;
//             this._child = doc;
//             this.switchCurrentView((userDoc: Doc) => doc);
//             this._parents.length = index;
//         }
//     }

//     @action
//     toggleSidebar = () => this.sidebarActive = !this.sidebarActive

//     switchToLibrary = () => {
//         this._parents.push(this._activeDoc);
//         this.switchCurrentView((userDoc: Doc) => this._library);
//         this._activeDoc = this._library;
//         this._homeMenu = false;
//         this.toggleSidebar();
//     }

//     // renderDefaultContent = () => {
//     //     let menuButtons = DocListCast(this._homeDoc.data).map((doc: Doc, index: any) => {
//     //         if (doc.type !== "ink") {
//     //             return (
//     //                 <div
//     //                     className="item"
//     //                     key={index}
//     //                     onClick={() => doc.click}>{doc.title}
//     //                 </div>);
//     //         }
//     //     });

//     //     if (this._homeMenu === true) {
//     //         return (
//     //             <div>
//     //                 <div className="navbar">
//     //                     <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
//     //                     <div className="header" id="header">{this._homeDoc.title}</div>
//     //                     <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
//     //                         <span></span>
//     //                         <span></span>
//     //                         <span></span>
//     //                     </div>
//     //                 </div>
//     //                 {this.renderPathbar()}
//     //                 <div className="sidebar" id="sidebar">
//     //                     <div className="sidebarButtons">
//     //                         {menuButtons}
//     //                     </div>
//     //                 </div>
//     //             </div>
//     //         );
//     //     }

//     //     const workspaces = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
//     //     const buttons = DocListCast(this._child ? this._child.data : workspaces.data).map((doc: Doc, index: any) => {
//     //         return (
//     //             <div
//     //                 className="item"
//     //                 key={index}
//     //                 onClick={() => this.handleClick(doc)}>{doc.title}
//     //                 <div className="type">{doc.type}</div>
//     //                 <FontAwesomeIcon className="right" icon="angle-right" size="lg" />
//     //             </div>);
//     //     });
//     //     return (
//     //         <>
//     //             <div className="navbar">
//     //                 <div className={"header"}>{this.sidebarActive ? StrCast(this._activeDoc.title) : "Menu"}</div>
//     //                 <div
//     //                     className={`toggle-btn ${this.sidebarActive ? "active" : ""}`}
//     //                     onClick={this.toggleSidebar}
//     //                 />
//     //             </div>
//     //             <div className="pathbar">
//     //                 <div className="pathname">{this.createPathname()}</div>
//     //             </div>
//     //             <div className={`sidebar ${this.sidebarActive ? "active" : ""}`}>
//     //                 <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
//     //                 {this._child ?
//     //                     <>
//     //                         <div className="back" onClick={this.back}>&#8592;</div>
//     //                         <div>{buttons}</div>
//     //                         <div className="item" key="home" onClick={this.returnHome}>Home</div>
//     //                     </> :
//     //                     <>
//     //                         {buttons}
//     //                         {/* <div className="item" key="library" onClick={this.openLibrary}>
//     //                             Library
//     //                             </div> */}
//     //                         <Uploader Document={workspaces} />
//     //                         <div className="item" key="audio" onClick={this.recordAudio}>Record Audio</div>
//     //                         <div className="item" key="presentation" onClick={this.setupDefaultPresentation}>Presentation</div>
//     //                         <div className="item" key="settings" onClick={() => SettingsManager.Instance.open()}>Settings</div>
//     //                     </>
//     //                 }
//     //             </div>
//     //             {this._child ? null : <div>{this.renderView}</div>}
//     //         </>
//     //     );
//     // }

//     renderDefaultContent = () => {
//         let menuButtons = DocListCast(this._homeDoc.data).map((doc: Doc, index: any) => {
//             if (doc.type !== "ink") {
//                 return (
//                     <div
//                         className="item"
//                         key={index}
//                         onClick={() => doc.click}>{doc.title}
//                     </div>);
//             }
//         });

//         if (this._homeMenu === true) {
//             return (
//                 <div>
//                     <div className="navbar">
//                         <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
//                         <div className="header" id="header">{this._homeDoc.title}</div>
//                         <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
//                             <span></span>
//                             <span></span>
//                             <span></span>
//                         </div>
//                     </div>
//                     {this.renderPathbar()}
//                     <div className="sidebar" id="sidebar">
//                         <div className="sidebarButtons">
//                             {menuButtons}
//                         </div>
//                     </div>
//                 </div>
//             );
//         }
//         const workspaces = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
//         let buttons = DocListCast(workspaces.data).map((doc: Doc, index: any) => {
//             if (doc.type !== "ink") {
//                 return (
//                     <div
//                         className="item"
//                         key={index}
//                         onClick={() => this.handleClick(doc)}>{doc.title}
//                         <div className="type">{doc.type}</div>
//                         <FontAwesomeIcon className="right" icon="angle-right" size="lg" />
//                     </div>);
//             }
//         });

//         if (this._child) {
//             buttons = DocListCast(this._child.data).map((doc: Doc, index: any) => {
//                 if (doc.type !== "ink") {
//                     return (
//                         <div
//                             className="item"
//                             key={index}
//                             onClick={() => this.handleClick(doc)}>{doc.title}
//                             <div className="type">{doc.type}</div>
//                             <FontAwesomeIcon className="right" icon="angle-right" size="lg" />
//                         </div>);
//                 }
//             });
//         }

//         if (!this._child) {
//             return (
//                 <div>
//                     <div className="navbar">
//                         <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
//                         <div className="header" id="header">{this._homeDoc.title}</div>
//                         <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
//                             <span></span>
//                             <span></span>
//                             <span></span>
//                         </div>
//                     </div>
//                     {this.renderPathbar()}
//                     <div className="sidebar" id="sidebar">
//                         <div className="sidebarButtons">
//                             {buttons}
//                             {/* <div className="item" key="library" onClick={this.openLibrary}>
//                                 Library
//                             </div> */}
//                             {/* <Uploader Document={workspaces} />
//                             <div className="item" key="audio" onClick={this.recordAudio}>
//                                 Record Audio
//                             </div>
//                             <div className="item" key="presentation" onClick={this.openDefaultPresentation}>
//                                 Presentation
//                             </div> */}
//                             {/* <div className="item" key="settings" onClick={() => SettingsManager.Instance.open()}>
//                                 Settings
//                             </div> */}
//                             <div className="item" key="ink" id="ink" onClick={() => this.onSwitchInking()}>
//                                 Ink On
//                             </div>
//                         </div>
//                     </div>
//                     {/* <div>
//                         {this.renderView}
//                     </div> */}
//                 </div>
//             );
//         }
//         else {
//             return (
//                 <div>
//                     <div className="navbar">
//                         <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
//                         <div className="header" id="header">library</div>
//                         <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
//                             <span></span>
//                             <span></span>
//                             <span></span>
//                         </div>
//                     </div>
//                     {this.renderPathbar()}
//                     <div className="sidebar" id="sidebar">
//                         <div className="sidebarButtons">
//                             {buttons}
//                             <div className="item" key="ink" id="ink" onClick={() => this.onSwitchInking()}>
//                                 Ink On
//                             </div>
//                             <div className="item" key="home" onClick={this.returnMain}>
//                                 Home
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             );
//         }
//     }

//     recordAudio = async () => {
//         // upload to server with known URL
//         if (this._activeDoc.title !== "mobile audio") {
//             this._parents.push(this._activeDoc);
//         }
//         const audioDoc = Cast(Docs.Create.AudioDocument(nullAudio, { _width: 200, _height: 100, title: "mobile audio" }), Doc) as Doc;
//         console.log(audioDoc);
//         if (audioDoc) {
//             console.log("audioClicked: " + audioDoc.title);
//             this._activeDoc = audioDoc;
//             this.switchCurrentView((userDoc: Doc) => audioDoc);
//             this._homeMenu = false;
//             // this.toggleSidebar();
//         }
//         // const audioRightSidebar = Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc;
//         // this.audioState = await audioDoc.getProto;
//         // if (this.audioState) {
//         //     console.log(this.audioState);
//         //     const data = Cast(audioRightSidebar.data, listSpec(Doc));
//         //     if (data) {
//         //         data.push(audioDoc);
//         //     }
//         // }
//     }

//     uploadAudio = () => {
//         const audioRightSidebar = Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc;
//         const audioDoc = this._activeDoc;
//         const data = Cast(audioRightSidebar.data, listSpec(Doc));
//         console.log(audioDoc.proto);
//         if (data) {
//             data.push(audioDoc);
//         }
//         // this.recordAudio();
//     }

//     uploadAudioButton = () => {
//         if (this._activeDoc.type === "audio") {
//             return <div className="docButton"
//                 title={Doc.isDocPinned(this._activeDoc) ? "Pen on" : "Pen off"}
//                 style={{ backgroundColor: "black", color: "white" }}
//                 onClick={this.uploadAudio}
//             >
//                 <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="upload"
//                 />
//             </div>;
//         }
//     }

//     toggleSelector = () => {
//         console.log("toggle selector!");
//         let toolbar = document.getElementById("toolbar") as HTMLElement;
//         toolbar.classList.toggle('active');
//     }

//     colorTool = () => {
//         if (this._activeDoc._viewType === "docking") {
//             const color = InkingControl.Instance.selectedColor;
//             console.log(color);
//             return (
//                 <div
//                     className="docButton"
//                     style={{ backgroundColor: color }}
//                     onClick={this.toggleSelector}
//                 >
//                     <div className="toolbar" id="toolbar">
//                         <div className="colorSelector">
//                             <div className="colorButton"
//                                 style={{ backgroundColor: "red" }}
//                                 onClick={() => {
//                                     InkingControl.Instance.updateSelectedColor("rgb(255,0,0)");
//                                     Doc.UserDoc().inkColor = "rgb(255,0,0)";
//                                     console.log(InkingControl.Instance.selectedColor);
//                                 }}>
//                             </div>
//                             <div className="colorButton"
//                                 style={{ backgroundColor: "green" }}
//                                 onClick={e => {
//                                     InkingControl.Instance.updateSelectedColor("rgb(0,128,0)");
//                                     Doc.UserDoc().inkColor = "rgb(0,128,0)";
//                                     console.log(InkingControl.Instance.selectedColor);
//                                 }}>
//                             </div>
//                             <div className="colorButton"
//                                 style={{ backgroundColor: "blue" }}
//                                 onClick={e => {
//                                     InkingControl.Instance.updateSelectedColor("rgb(0,0,255)");
//                                     Doc.UserDoc().inkColor = "rgb(0,0,255)";
//                                     console.log(InkingControl.Instance.selectedColor);
//                                 }}>
//                             </div>
//                         </div>
//                         <div className="widthSelector">
//                             <input type="range" min="1" max="100" defaultValue="2" id="myRange" onChange={(e: React.ChangeEvent<HTMLInputElement>) => InkingControl.Instance.switchWidth(e.target.value)} />
//                         </div>
//                     </div>
//                 </div>
//             );
//         }
//     }

//     drawInk = () => {
//         if (this._activeDoc._viewType === "docking") {
//             const inkIsOn = this._ink;
//             return <div className="docButton"
//                 id="inkButton"
//                 title={Doc.isDocPinned(this._activeDoc) ? "Pen on" : "Pen off"}
//                 onClick={this.onSwitchInking}>
//                 <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="pen-nib"
//                 />
//             </div>;
//         }
//     }

//     downloadDocument = () => {
//         if (this._activeDoc.type === "image") {
//             const url = this._activeDoc["data-path"]?.toString();
//             return <div className="docButton"
//                 title={"Download Image"}
//                 style={{ backgroundColor: "white", color: "black" }}
//                 onClick={e => {
//                     window.open(url);
//                     console.log(url);
//                 }}>
//                 <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="download"
//                 />
//             </div>;
//         }
//     }

//     pinToPresentation = () => {
//         // Only making button available if it is an image
//         if (this._activeDoc.type === "image") {
//             const isPinned = this._activeDoc && Doc.isDocPinned(this._activeDoc);
//             return <div className="docButton"
//                 title={Doc.isDocPinned(this._activeDoc) ? "Unpin from presentation" : "Pin to presentation"}
//                 style={{ backgroundColor: isPinned ? "black" : "white", color: isPinned ? "white" : "black" }}
//                 onClick={e => {
//                     if (isPinned) {
//                         DockedFrameRenderer.UnpinDoc(this._activeDoc);
//                     }
//                     else {
//                         DockedFrameRenderer.PinDoc(this._activeDoc);
//                     }
//                 }}>
//                 <FontAwesomeIcon className="documentdecorations-icon" size="sm" icon="map-pin"
//                 />
//             </div>;
//         }
//     }

//     setupDefaultPresentation = () => {
//         if (this._activeDoc.title !== "Presentation") {
//             this._parents.push(this._activeDoc);
//         }

//         const presentation = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;

//         if (presentation) {
//             console.log(this._activeDoc.mobile);
//             console.log("presentation clicked: " + presentation.title);
//             this._activeDoc = presentation;
//             this.switchCurrentView((userDoc: Doc) => presentation);
//             this._homeMenu = false;
//             // this.toggleSidebar();
//         }
//     }

//     // mobileHome = () => {
//     //     return (
//     //         <div className="homeContainer">
//     //             <div className="uploadButton">

//     //             </div>
//     //             <div className="presentationButton">

//     //             </div>
//     //             <div className="recordAudioButton">

//     //             </div>
//     //             <div className="inkButton">

//     //             </div>
//     //             <div className="settingsButton">

//     //             </div>
//     //         </div>
//     //     );
//     // }

//     renderActiveCollection = (userDoc: Doc) => {
//         if (this.activeContainer) {
//             const active = Cast(this.activeContainer.data, listSpec(Doc));
//             if (active) {
//                 return (
//                     <div className="mobileInterface-background">HELLO!</div>
//                 );
//             }
//         }
//     }

//     onBack = (e: React.MouseEvent) => {
//         this.switchCurrentView((userDoc: Doc) => this.mainDoc);
//         InkingControl.Instance.switchTool(InkTool.None); // TODO: switch to previous tool

//         DocServer.Mobile.dispatchOverlayTrigger({
//             enableOverlay: false,
//             width: window.innerWidth,
//             height: window.innerHeight
//         });

//         // this.inkDoc = undefined;
//         this.drawingInk = false;
//     }

//     shiftLeft = (e: React.MouseEvent) => {
//         DocServer.Mobile.dispatchOverlayPositionUpdate({
//             dx: -10
//         });
//         e.preventDefault();
//         e.stopPropagation();
//     }

//     shiftRight = (e: React.MouseEvent) => {
//         DocServer.Mobile.dispatchOverlayPositionUpdate({
//             dx: 10
//         });
//         e.preventDefault();
//         e.stopPropagation();
//     }

//     panelHeight = () => window.innerHeight;
//     panelWidth = () => window.innerWidth;
//     //WAS 3

//     //WAS 1

//     upload = async (e: React.MouseEvent) => {
//         if (this.mainContainer) {
//             const data = Cast(this.mainContainer.data, listSpec(Doc));
//             if (data) {
//                 const collectionDoc = await data[1]; //this should be the collection doc since the positions should be locked
//                 const children = DocListCast(collectionDoc.data);
//                 const uploadDoc = children.length === 1 ? children[0] : Docs.Create.StackingDocument(children, {
//                     title: "Mobile Upload Collection", backgroundColor: "white", lockedPosition: true, _width: 300, _height: 300
//                 });
//                 if (uploadDoc) {
//                     DocServer.Mobile.dispatchMobileDocumentUpload({
//                         docId: uploadDoc[Id],
//                     });
//                 }
//             }
//         }
//         e.stopPropagation();
//         e.preventDefault();
//     }

//     addWebToCollection = async () => {
//         let url = "https://en.wikipedia.org/wiki/Hedgehog";
//         if (this.mainContainer) {
//             const data = Cast(this.mainContainer.data, listSpec(Doc));
//             if (data) {
//                 const webDoc = await data[0];
//                 const urlField: FieldResult<WebField> = Cast(webDoc.data, WebField);
//                 url = urlField ? urlField.url.toString() : "https://en.wikipedia.org/wiki/Hedgehog";

//             }
//         }
//         Docs.Create.WebDocument(url, { _width: 300, _height: 300, title: "Mobile Upload Web Doc" });
//     }

//     clearUpload = async () => {
//         if (this.mainContainer) {
//             const data = Cast(this.mainContainer.data, listSpec(Doc));
//             if (data) {
//                 const collectionDoc = await data[1];
//                 const children = DocListCast(collectionDoc.data);
//                 children.forEach(doc => {
//                 });
//                 // collectionDoc[data] = new List<Doc>();
//             }
//         }
//     }

//     onDragOver = (e: React.DragEvent) => {
//         e.preventDefault();
//         e.stopPropagation();
//     }

//     render() {
//         // const content = this.currentView === "main" ? this.mainContent :
//         //     this.currentView === "ink" ? this.inkContent :
//         //         this.currentView === "upload" ? this.uploadContent : <></>;
//         return (
//             <div className="mobileInterface-container" onDragOver={this.onDragOver}>
//                 {/* <DocumentDecorations />
//                 <GestureOverlay>
//                     {this.renderView ? this.renderView() : this.renderDefaultContent()}
//                 </GestureOverlay> */}
//                 {/* <GestureOverlay> */}
//                 <SettingsManager />
//                 {/* {this.menuOptions()} */}
//                 {/* {this.displayHome()} */}
//                 <div className="docButtonContainer">
//                     {this.pinToPresentation()}
//                     {this.downloadDocument()}
//                     {this.drawInk()}
//                     {this.uploadAudioButton()}
//                     {this.colorTool()}
//                 </div>
//                 <GestureOverlay>

//                 </GestureOverlay>
//                 {this.renderDefaultContent()}
//                 {this.displayWorkspaces()}
//                 {/* </GestureOverlay> */}
//                 {/* <DictationOverlay />
//                 <SharingManager />
//                 <GoogleAuthenticationManager /> */}
//                 {/* <DocumentDecorations /> */}
//                 {/* <div>
//                     {this.renderDefaultContent()}
//                 </div> */}
//                 {/* <PreviewCursor /> */}
//                 {/* <ContextMenu /> */}
//                 {/* <RadialMenu />
//                 <RichTextMenu /> */}
//                 {/* <PDFMenu />
//                 <MarqueeOptionsMenu />
//                 <OverlayView /> */}
//             </div>
//         );
//     }
// }

// Scripting.addGlobal(function switchMobileView(doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) { return MobileInterface.Instance.switchCurrentView(doc, renderView, onSwitch); });
// Scripting.addGlobal(function openMobilePresentation() { return MobileInterface.Instance.setupDefaultPresentation(); });
// Scripting.addGlobal(function toggleMobileSidebar() { return MobileInterface.Instance.toggleSidebar(); });
// Scripting.addGlobal(function openMobileAudio() { return MobileInterface.Instance.recordAudio(); });
// Scripting.addGlobal(function openMobileSettings() { return SettingsManager.Instance.open(); });
// Scripting.addGlobal(function switchToLibrary() { return MobileInterface.Instance.switchToLibrary(); });
// // WAS 2

// // 1
// // renderUploadContent() {
// //     if (this.mainContainer) {
// //         return (
// //             <div className="mobileInterface" onDragOver={this.onDragOver}>
// //                 <div className="mobileInterface-inkInterfaceButtons">
// //                     <button className="mobileInterface-button cancel" onClick={this.onBack} title="Back">BACK</button>
// //                     {/* <button className="mobileInterface-button" onClick={this.clearUpload} title="Clear Upload">CLEAR</button> */}
// //                     {/* <button className="mobileInterface-button" onClick={this.addWeb} title="Add Web Doc to Upload Collection"></button> */}
// //                     <button className="mobileInterface-button" onClick={this.upload} title="Upload">UPLOAD</button>
// //                 </div>
// //                 <DocumentView
// //                     Document={this.mainContainer}
// //                     DataDoc={undefined}
// //                     LibraryPath={emptyPath}
// //                     addDocument={returnFalse}
// //                     addDocTab={returnFalse}
// //                     pinToPres={emptyFunction}
// //                     rootSelected={returnFalse}
// //                     removeDocument={undefined}
// //                     onClick={undefined}
// //                     ScreenToLocalTransform={Transform.Identity}
// //                     ContentScaling={returnOne}
// //                     NativeHeight={returnZero}
// //                     NativeWidth={returnZero}
// //                     PanelWidth={() => window.screen.width}
// //                     PanelHeight={() => window.screen.height}
// //                     renderDepth={0}
// //                     focus={emptyFunction}
// //                     backgroundColor={returnEmptyString}
// //                     parentActive={returnTrue}
// //                     whenActiveChanged={emptyFunction}
// //                     bringToFront={emptyFunction}
// //                     ContainingCollectionView={undefined}
// //                     ContainingCollectionDoc={undefined} />
// //             </div>
// //         );
// //     }
// // }

// // 2
// // Scripting.addGlobal(function onSwitchMobileInking() { return MobileInterface.Instance.onSwitchInking(); });
// // Scripting.addGlobal(function renderMobileInking() { return MobileInterface.Instance.renderInkingContent(); });
// // Scripting.addGlobal(function onSwitchMobileUpload() { return MobileInterface.Instance.onSwitchUpload(); });
// // Scripting.addGlobal(function renderMobileUpload() { return MobileInterface.Instance.renderUploadContent(); });
//     // Scripting.addGlobal(function addWebToMobileUpload() { return MobileInterface.Instance.addWebToCollection(); });


// // 3   
//     // renderInkingContent = () => {
//         //     console.log("rendering inking content");
//         //     // TODO: support panning and zooming
//         //     // TODO: handle moving of ink strokes
//         //     if (this.mainContainer) {
//         //         return (
//         //             <div className="mobileInterface">
//         //                 <div className="mobileInterface-inkInterfaceButtons">
//         //                     <div className="navButtons">
//         //                         <button className="mobileInterface-button cancel" onClick={this.onBack} title="Cancel drawing">BACK</button>
//         //                     </div>
//         //                     <div className="inkSettingButtons">
//         //                         <button className="mobileInterface-button cancel" onClick={this.onBack} title="Cancel drawing"><FontAwesomeIcon icon="long-arrow-alt-left" /></button>
//         //                     </div>
//         //                     <div className="navButtons">
//         //                         <button className="mobileInterface-button" onClick={this.shiftLeft} title="Shift left">left</button>
//         //                         <button className="mobileInterface-button" onClick={this.shiftRight} title="Shift right">right</button>
//         //                     </div>
//         //                 </div>
//         //                 <CollectionView
//         //                     Document={this.mainContainer}
//         //                     DataDoc={undefined}
//         //                     LibraryPath={emptyPath}
//         //                     fieldKey={""}
//         //                     dropAction={"alias"}
//         //                     bringToFront={emptyFunction}
//         //                     addDocTab={returnFalse}
//         //                     pinToPres={emptyFunction}
//         //                     PanelWidth={this.panelWidth}
//         //                     PanelHeight={this.panelHeight}
//         //                     NativeHeight={returnZero}
//         //                     NativeWidth={returnZero}
//         //                     focus={emptyFunction}
//         //                     isSelected={returnFalse}
//         //                     select={emptyFunction}
//         //                     active={returnFalse}
//         //                     ContentScaling={returnOne}
//         //                     whenActiveChanged={returnFalse}
//         //                     ScreenToLocalTransform={Transform.Identity}
//         //                     renderDepth={0}
//         //                     ContainingCollectionView={undefined}
//         //                     ContainingCollectionDoc={undefined}
//         //                     rootSelected={returnTrue}>
//         //                 </CollectionView>
//         //             </div>
//         //         );
//         //     }
//         // }

@observer
export class MobileInterface extends React.Component {
    @observable static Instance: MobileInterface;
    @computed private get userDoc() { return Doc.UserDoc(); }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    // @computed private get activeContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    @observable private mainDoc: any = CurrentUserUtils.setupMobileMenu();
    @observable private renderView?: () => JSX.Element;
    @observable private audioState: any;

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
            console.log(Doc.UserDoc().activeMobile)
        }
        if (this.userDoc && !this.mainContainer) {
            this.userDoc.activeMobile = this._homeDoc;
        }
        InkingControl.Instance.switchTool(InkTool.None);
        MobileInterface.Instance.drawingInk = false;
        InkingControl.Instance.updateSelectedColor("#FF0000");
        console.log(this.userDoc.inkColor);
        console.log(InkingControl.Instance.selectedColor);
        InkingControl.Instance.switchWidth("2");
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

    toggleSidebar = () => {
        if (this._open === false) {
            this._open = true;
        } else {
            this._open = false;
        }
        console.log("clicked");
        let menuButton = document.getElementById("menuButton") as HTMLElement;
        menuButton.classList.toggle('active');

        let sidebar = document.getElementById("sidebar") as HTMLElement;
        sidebar.classList.toggle('active');

        let header = document.getElementById("header") as HTMLElement;

        if (!sidebar.classList.contains('active')) {
            header.textContent = String(this._activeDoc.title);
        } else {
            header.textContent = "library";
        }
    }

    switchToLibrary = () => {
        this._parents.push(this._activeDoc);
        this.switchCurrentView((userDoc: Doc) => this._library);
        this._activeDoc = this._library;
        this._homeMenu = false;
        this.toggleSidebar();
    }

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

    returnHome = () => {
        if (this._homeMenu === false || this._open === true) {
            this._homeMenu = true;
            this._parents = [];
            this._activeDoc = this._homeDoc;
            this._child = null;
            this.switchCurrentView((userDoc: Doc) => this._homeDoc);
        }
        if (this._open) {
            this.toggleSidebar();
        }
    }

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

    displayWorkspaces = () => {
        if (this.mainContainer) {
            const backgroundColor = () => "white";
            if (this._activeDoc.title === "mobile audio") {
                return (
                    <div style={{ position: "relative", top: '600px', height: `calc(50% - 450px)`, width: "80%", overflow: "hidden", left: "10%", cursor: "pointer" }}>
                        <DocumentView
                            Document={this.mainContainer}
                            DataDoc={undefined}
                            LibraryPath={emptyPath}
                            addDocument={returnFalse}
                            addDocTab={returnFalse}
                            pinToPres={emptyFunction}
                            rootSelected={returnFalse}
                            removeDocument={undefined}
                            ScreenToLocalTransform={Transform.Identity}
                            ContentScaling={returnOne}
                            NativeHeight={returnZero}
                            NativeWidth={returnZero}
                            PanelWidth={() => window.screen.width}
                            PanelHeight={() => window.screen.height}
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
            } else {
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
    }

    returnWidth = () => window.innerWidth;
    returnHeight = () => (window.innerHeight - 300);

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
            // if (doc === this.mainDoc) {
            //     pathname = pathname;
            // } else if (doc.type === "audio" || doc.type === "presentation") {
            //     pathname = pathname;
            // } else if (doc.type !== "collection") {
            //     pathname = pathname;
            // } else {
            //     pathname = pathname + " > " + doc.title;
            //     titleArray.push(doc.title);
            //     docArray.push(doc);
            // }
            docArray.push(doc);
        });
        docArray.push(this._activeDoc);
        // if (this._activeDoc.title === "mobile audio") {
        //     pathname = this._activeDoc.title;
        // } else if (this._activeDoc.title === "Presentation") {
        //     pathname = this._activeDoc.title;
        // } else if (this._activeDoc === this.mainDoc) {
        //     pathname = pathname;
        // } else {
        //     pathname = pathname + " > " + this._activeDoc.title;
        //     docArray.push(this._activeDoc);
        //     titleArray.push(this._activeDoc.title);
        // }

        return docArray;
    }

    // Renders the graphical pathbar
    renderPathbar = () => {
        // if (this._homeMenu == false) {
        let docArray = this.createPathname();
        let items = docArray.map((doc: Doc, index: any) => {
            if (index == 0) {
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

    handlePathClick = (doc: Doc, index: number) => {
        if (doc === this._library) {
            this._activeDoc = doc;
            this._child = null;
            this.switchCurrentView((userDoc: Doc) => doc);
            this._parents.length = index;
        } else if (doc === this._homeDoc) {
            this.returnHome();
        } else {
            console.log(index);
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
                        onClick={() => doc.click}>{doc.title}
                    </div>);
            }
        });

        if (this._homeMenu === true) {
            return (
                <div>
                    <div className="navbar">
                        <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
                        <div className="header" id="header">{this._homeDoc.title}</div>
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
        const workspaces = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
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

        if (this._child) {
            buttons = DocListCast(this._child.data).map((doc: Doc, index: any) => {
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
        }

        if (!this._child) {
            return (
                <div>
                    <div className="navbar">
                        <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
                        <div className="header" id="header">{this._homeDoc.title}</div>
                        <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                    {this.renderPathbar()}
                    <div className="sidebar" id="sidebar">
                        <div className="sidebarButtons">
                            {buttons}
                            {/* <div className="item" key="library" onClick={this.openLibrary}>
                                Library
                            </div> */}
                            {/* <Uploader Document={workspaces} />
                            <div className="item" key="audio" onClick={this.recordAudio}>
                                Record Audio
                            </div>
                            <div className="item" key="presentation" onClick={this.openDefaultPresentation}>
                                Presentation
                            </div> */}
                            {/* <div className="item" key="settings" onClick={() => SettingsManager.Instance.open()}>
                                Settings
                            </div> */}
                            <div className="item" key="ink" id="ink" onClick={() => this.onSwitchInking()}>
                                Ink On
                            </div>
                        </div>
                    </div>
                    {/* <div>
                        {this.renderView}
                    </div> */}
                </div>
            );
        }
        else {
            return (
                <div>
                    <div className="navbar">
                        <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
                        <div className="header" id="header">library</div>
                        <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                    {this.renderPathbar()}
                    <div className="sidebar" id="sidebar">
                        <div className="sidebarButtons">
                            {buttons}
                            <div className="item" key="ink" id="ink" onClick={() => this.onSwitchInking()}>
                                Ink On
                            </div>
                            <div className="item" key="home" onClick={this.returnMain}>
                                Home
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
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

    toggleSelector = () => {
        console.log("toggle selector!");
        let toolbar = document.getElementById("toolbar") as HTMLElement;
        toolbar.classList.toggle('active');
    }

    colorTool = () => {
        if (this._activeDoc._viewType === "docking") {
            const color = InkingControl.Instance.selectedColor;
            console.log(color);
            return (
                <div
                    className="docButton"
                    style={{ backgroundColor: color }}
                    onClick={this.toggleSelector}
                >
                    <div className="toolbar" id="toolbar">
                        <div className="colorSelector">
                            <div className="colorButton"
                                style={{ backgroundColor: "red" }}
                                onClick={() => {
                                    InkingControl.Instance.updateSelectedColor("rgb(255,0,0)");
                                    Doc.UserDoc().inkColor = "rgb(255,0,0)";
                                    console.log(InkingControl.Instance.selectedColor);
                                }}>
                            </div>
                            <div className="colorButton"
                                style={{ backgroundColor: "green" }}
                                onClick={e => {
                                    InkingControl.Instance.updateSelectedColor("rgb(0,128,0)");
                                    Doc.UserDoc().inkColor = "rgb(0,128,0)";
                                    console.log(InkingControl.Instance.selectedColor);
                                }}>
                            </div>
                            <div className="colorButton"
                                style={{ backgroundColor: "blue" }}
                                onClick={e => {
                                    InkingControl.Instance.updateSelectedColor("rgb(0,0,255)");
                                    Doc.UserDoc().inkColor = "rgb(0,0,255)";
                                    console.log(InkingControl.Instance.selectedColor);
                                }}>
                            </div>
                        </div>
                        <div className="widthSelector">
                            <input type="range" min="1" max="100" defaultValue="2" id="myRange" onChange={(e: React.ChangeEvent<HTMLInputElement>) => InkingControl.Instance.switchWidth(e.target.value)} />
                        </div>
                    </div>
                </div>
            );
        }
    }

    onSwitchInking = () => {
        const button = document.getElementById("inkButton") as HTMLElement;
        const color = InkingControl.Instance.selectedColor;
        button.style.backgroundColor = this._ink ? "white" : color;
        button.style.color = this._ink ? "black" : "white";

        if (!this._ink) {
            console.log("INK IS ACTIVE");
            InkingControl.Instance.switchTool(InkTool.Pen);
            MobileInterface.Instance.drawingInk = true;
            this._ink = true;
        } else {
            console.log("INK IS INACTIVE");
            InkingControl.Instance.switchTool(InkTool.None);
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
        console.log(audioDoc);
        if (audioDoc) {
            console.log("audioClicked: " + audioDoc.title);
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
        console.log(audioDoc.proto);
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
        InkingControl.Instance.switchTool(InkTool.None); // TODO: switch to previous tool

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

    setupDefaultPresentation = () => {
        if (this._activeDoc.title !== "Presentation") {
            this._parents.push(this._activeDoc);
        }

        const presentation = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;

        if (presentation) {
            console.log(this._activeDoc.mobile);
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
}

Scripting.addGlobal(function switchMobileView(doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) { return MobileInterface.Instance.switchCurrentView(doc, renderView, onSwitch); });
Scripting.addGlobal(function openMobilePresentation() { return MobileInterface.Instance.setupDefaultPresentation(); });
Scripting.addGlobal(function toggleMobileSidebar() { return MobileInterface.Instance.toggleSidebar(); });
Scripting.addGlobal(function openMobileAudio() { return MobileInterface.Instance.recordAudio(); });
Scripting.addGlobal(function openMobileSettings() { return SettingsManager.Instance.open(); });
Scripting.addGlobal(function switchToLibrary() { return MobileInterface.Instance.switchToLibrary(); });


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