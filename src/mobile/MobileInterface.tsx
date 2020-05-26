import React = require('react');
import { library } from '@fortawesome/fontawesome-svg-core';
import { faEraser, faHighlighter, faLongArrowAltLeft, faMousePointer, faPenNib, faThumbtack, faHome } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as ReactDOM from "react-dom";
import * as rp from 'request-promise';
import { CurrentUserUtils } from '../client/util/CurrentUserUtils';
import { FieldValue, Cast, StrCast } from '../fields/Types';
import { Doc, DocListCast, Opt } from '../fields/Doc';
import { Docs } from '../client/documents/Documents';
import { CollectionView } from '../client/views/collections/CollectionView';
import { DocumentView } from '../client/views/nodes/DocumentView';
import { emptyPath, emptyFunction, returnFalse, returnOne, returnEmptyString, returnTrue, returnZero, Utils } from '../Utils';
import { Transform } from '../client/util/Transform';
import { Scripting } from '../client/util/Scripting';
import GestureOverlay from '../client/views/GestureOverlay';
import { InkingControl } from '../client/views/InkingControl';
import { InkTool } from '../fields/InkField';
import "./MobileInterface.scss";
import "./MobileMenu.scss";
import { DocServer } from '../client/DocServer';
import { DocumentDecorations } from '../client/views/DocumentDecorations';
import { PreviewCursor } from '../client/views/PreviewCursor';
import { RadialMenu } from '../client/views/nodes/RadialMenu';
import { Id } from '../fields/FieldSymbols';
import { WebField, nullAudio } from "../fields/URLField";
import { FieldResult } from "../fields/Doc";
import { AssignAllExtensions } from '../extensions/General/Extensions';
import { listSpec } from '../fields/Schema';
import { DocumentManager } from '../client/util/DocumentManager';
import RichTextMenu from '../client/views/nodes/formattedText/RichTextMenu';
import { MainView } from '../client/views/MainView';
import SettingsManager from '../client/util/SettingsManager';
import { Uploader } from "./ImageUpload";
import { Upload } from '../server/SharedMediaTypes';
import { createTypePredicateNodeWithModifier } from 'typescript';
import { AudioBox } from '../client/views/nodes/AudioBox';
import { List } from '../fields/List';
import { DockedFrameRenderer } from '../client/views/collections/CollectionDockingView';

library.add(faLongArrowAltLeft);
library.add(faHome);

@observer
export class MobileInterface extends React.Component {
    @observable static Instance: MobileInterface;
    @computed private get userDoc() { return Doc.UserDoc(); }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    @computed private get activeContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeMobile, Doc)) : CurrentUserUtils.GuestMobile; }
    // @observable private currentView: "main" | "ink" | "upload" = "main";
    @observable private mainDoc: any = CurrentUserUtils.setupMobileDoc(this.userDoc);
    @observable private renderView?: () => JSX.Element;

    public _activeDoc: Doc = this.mainDoc;

    // private inkDoc?: Doc;
    public drawingInk: boolean = false;

    // private _uploadDoc: Doc = this.userDoc;
    private _child: Doc | null = null;
    private _parents: Array<Doc> = [];
    private _menu: Doc = this.mainDoc;
    private _open: boolean = false;
    private _library: Doc = Cast(this.userDoc.myWorkspaces, Doc) as Doc;

    constructor(props: Readonly<{}>) {
        super(props);
        MobileInterface.Instance = this;
    }

    @action
    componentDidMount = () => {
        library.add(...[faPenNib, faHighlighter, faEraser, faMousePointer, faThumbtack]);

        if (this.userDoc && !this.mainContainer) {
            this.userDoc.activeMobile = this.mainDoc;
        }
    }

    @action
    switchCurrentView = (doc: (userDoc: Doc) => Doc, renderView?: () => JSX.Element, onSwitch?: () => void) => {
        if (!this.userDoc) return;

        this.userDoc.activeMobile = doc(this.userDoc);
        onSwitch && onSwitch();

        this.renderView = renderView;
    }

    onSwitchInking = () => {
        InkingControl.Instance.switchTool(InkTool.Pen);
        MobileInterface.Instance.drawingInk = true;

        DocServer.Mobile.dispatchOverlayTrigger({
            enableOverlay: true,
            width: window.innerWidth,
            height: window.innerHeight
        });
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
        console.log("clicked");
        let menuButton = document.getElementById("menuButton") as HTMLElement;
        menuButton.classList.toggle('active');

        let sidebar = document.getElementById("sidebar") as HTMLElement;
        sidebar.classList.toggle('active');

        let header = document.getElementById("header") as HTMLElement;

        if (!sidebar.classList.contains('active')) {
            header.textContent = String(this._activeDoc.title);
        } else {
            header.textContent = "menu";
        }
    }

    back = () => {
        let doc = Cast(this._parents.pop(), Doc) as Doc;
        if (doc == Cast(this._menu, Doc) as Doc) {
            this._child = null;
            this.userDoc.activeMobile = this.mainDoc;
        } else {
            if (doc) {
                this._child = doc;
                this.switchCurrentView((userDoc: Doc) => doc);
            }
        }
        if (doc) {
            this._activeDoc = doc;
        }
    }

    returnHome = () => {
        this._parents = [];
        this._activeDoc = this._menu;
        this.switchCurrentView((userDoc: Doc) => this._menu);
        this._child = null;
    }

    displayWorkspaces = () => {
        if (this.mainContainer) {
            const backgroundColor = () => "white";
            return (
                <div style={{ position: "relative", top: '200px', height: `calc(100% - 250px)`, width: "100%", overflow: "hidden" }}>
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
        }
    }

    handleClick(doc: Doc) {
        let children = DocListCast(doc.data);
        if (doc.type !== "collection") {
            this._parents.push(this._activeDoc);
            this._activeDoc = doc;
            this.switchCurrentView((userDoc: Doc) => doc);
            this.toggleSidebar();
        } else if (doc.type === "collection" && children.length === 0) {
            console.log("This collection has no children");
        } else {
            this._parents.push(this._activeDoc);
            this._activeDoc = doc;
            this.switchCurrentView((userDoc: Doc) => doc);
            this._child = doc;
        }

        // let sidebar = document.getElementById("sidebar") as HTMLElement;
        // sidebar.classList.toggle('active');
    }

    createPathname = () => {
        let pathname = "";
        this._parents.map((doc: Doc, index: any) => {
            if (doc === this.mainDoc) {
                pathname = pathname + doc.title;
            } else {
                pathname = pathname + " > " + doc.title;
            }
        });
        if (this._activeDoc === this.mainDoc) {
            pathname = pathname + this._activeDoc.title;
        } else {
            pathname = pathname + " > " + this._activeDoc.title;
        }
        return pathname;
    }

    openLibrary() {
        this._activeDoc = this.mainDoc;
        this.switchCurrentView((userDoc: Doc) => this.mainDoc);
        this._child = this._library;
    }

    renderDefaultContent = () => {
        const workspaces = Cast(this.userDoc.myWorkspaces, Doc) as Doc;
        let buttons = DocListCast(workspaces.data).map((doc: Doc, index: any) => {
            return (
                <div
                    className="item"
                    key={index}
                    onClick={() => this.handleClick(doc)}>{doc.title}
                    <div className="type">{doc.type}</div>
                    <FontAwesomeIcon className="right" icon="angle-right" size="lg" />
                </div>);
        });

        if (this._child) {
            buttons = DocListCast(this._child.data).map((doc: Doc, index: any) => {
                return (
                    <div
                        className="item"
                        key={index}
                        onClick={() => this.handleClick(doc)}>{doc.title}
                        <div className="type">{doc.type}</div>
                        <FontAwesomeIcon className="right" icon="angle-right" size="lg" />
                    </div>);
            });
        }

        if (!this._child) {
            return (
                <div>
                    <div className="navbar">
                        <div className="header" id="header">MENU</div>
                        <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                    <div className="pathbar">
                        <div className="pathname">
                            {this.createPathname()}
                        </div>
                    </div>
                    <div className="sidebar" id="sidebar">
                        <div>
                            <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
                            {buttons}
                            {/* <div className="item" key="library" onClick={this.openLibrary}>
                                Library
                            </div> */}
                            <Uploader Document={workspaces} />
                            <div className="item" key="audio" onClick={this.recordAudio}>
                                Record Audio
                            </div>
                            <div className="item" key="presentation" onClick={this.openDefaultPresentation}>
                                Presentation
                            </div>
                            <div className="item" key="settings" onClick={() => SettingsManager.Instance.open()}>
                                Settings
                            </div>
                        </div>
                    </div>
                    <div>
                        {this.renderView}
                    </div>
                </div>
            );
        }
        else {
            return (
                <div>
                    <div className="navbar">
                        <div className="header" id="header">menu</div>
                        <div className="toggle-btn" id="menuButton" onClick={this.toggleSidebar}>
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                    <div className="pathbar">
                        <div className="pathname">
                            {this.createPathname()}
                        </div>
                    </div>
                    <div className="sidebar" id="sidebar">
                        <FontAwesomeIcon className="home" icon="home" onClick={this.returnHome} />
                        <div className="back" onClick={this.back}>
                            &#8592;
                        </div>
                        <div>
                            {buttons}
                        </div>
                        <div className="item" key="home" onClick={this.returnHome}>
                            Home
                        </div>
                    </div>
                </div>
            );
        }
    }

    pinToPresentation = () => {
        // Only making button available if it is an image
        if (this._activeDoc.type === "image") {
            const isPinned = this._activeDoc && Doc.isDocPinned(this._activeDoc);
            return <div className="pinButton"
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

    recordAudio = async () => {
        // upload to server with known URL 
        this._parents.push(this._activeDoc);
        const audioDoc = Cast(Docs.Create.AudioDocument(nullAudio, { _width: 200, _height: 100, title: "mobile audio" }), Doc) as Doc;
        if (audioDoc) {
            console.log("audioClicked: " + audioDoc.title);
            this._activeDoc = audioDoc;
            this.switchCurrentView((userDoc: Doc) => audioDoc);
            this.toggleSidebar();
        }
        const audioRightSidebar = Cast(Doc.UserDoc().rightSidebarCollection, Doc) as Doc;
        if (audioRightSidebar) {
            console.log(audioRightSidebar.title);
            const data = Cast(audioRightSidebar.data, listSpec(Doc));
            if (data) {
                data.push(audioDoc);
            }
        }
    }

    openDefaultPresentation = () => {
        this._parents.push(this._activeDoc);
        const presentation = Cast(Doc.UserDoc().activePresentation, Doc) as Doc;

        if (presentation) {
            console.log("presentation clicked: " + presentation.title);
            this._activeDoc = presentation;
            this.switchCurrentView((userDoc: Doc) => presentation);
            this.toggleSidebar();
        }
    }

    // mobileHome = () => {
    //     return (
    //         <div className="homeContainer">
    //             <div className="uploadButton">

    //             </div>
    //             <div className="presentationButton">

    //             </div>
    //             <div className="recordAudioButton">

    //             </div>
    //             <div className="inkButton">

    //             </div>
    //             <div className="settingsButton">

    //             </div>
    //         </div>
    //     );
    // }

    renderActiveCollection = (userDoc: Doc) => {
        if (this.activeContainer) {
            const active = Cast(this.activeContainer.data, listSpec(Doc));
            if (active) {
                return (
                    <div className="mobileInterface-background">HELLO!</div>
                );
            }
        }
    }

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
    onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }

    render() {
        // const content = this.currentView === "main" ? this.mainContent :
        //     this.currentView === "ink" ? this.inkContent :
        //         this.currentView === "upload" ? this.uploadContent : <></>;
        return (
            <div className="mobileInterface-container" onDragOver={this.onDragOver}>
                {/* <DocumentDecorations />
                <GestureOverlay>
                    {this.renderView ? this.renderView() : this.renderDefaultContent()}
                </GestureOverlay> */}
                {/* <GestureOverlay> */}
                <SettingsManager />
                {this.displayWorkspaces()}
                {this.pinToPresentation()}
                {/* </GestureOverlay> */}
                {/* <DictationOverlay />
                <SharingManager />
                <GoogleAuthenticationManager /> */}
                {/* <DocumentDecorations /> */}
                <div>
                    {this.renderDefaultContent()}
                </div>
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
// WAS 2

AssignAllExtensions();

(async () => {
    const info = await CurrentUserUtils.loadCurrentUser();
    DocServer.init(window.location.protocol, window.location.hostname, 4321, info.email + " (mobile)");
    await Docs.Prototypes.initialize();
    if (info.id !== "__guest__") {
        // a guest will not have an id registered
        await CurrentUserUtils.loadUserDocument(info);
    }
    document.getElementById('root')!.addEventListener('wheel', event => {
        if (event.ctrlKey) {
            event.preventDefault();
        }
    }, true);
    ReactDOM.render(<MobileInterface />, document.getElementById('root'));
})();


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

// 2
// Scripting.addGlobal(function onSwitchMobileInking() { return MobileInterface.Instance.onSwitchInking(); });
// Scripting.addGlobal(function renderMobileInking() { return MobileInterface.Instance.renderInkingContent(); });
// Scripting.addGlobal(function onSwitchMobileUpload() { return MobileInterface.Instance.onSwitchUpload(); });
// Scripting.addGlobal(function renderMobileUpload() { return MobileInterface.Instance.renderUploadContent(); });
    // Scripting.addGlobal(function addWebToMobileUpload() { return MobileInterface.Instance.addWebToCollection(); });


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