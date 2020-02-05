import { library } from '@fortawesome/fontawesome-svg-core';
import {
    faStickyNote, faArrowDown, faBullseye, faFilter, faArrowUp, faBolt, faCaretUp, faCat, faCheck, faChevronRight, faClone, faCloudUploadAlt, faCommentAlt, faCut, faEllipsisV, faExclamation, faFilePdf, faFilm, faFont, faGlobeAsia, faLongArrowAltRight,
    faMusic, faObjectGroup, faPause, faMousePointer, faPenNib, faFileAudio, faPen, faEraser, faPlay, faPortrait, faRedoAlt, faThumbtack, faTree, faTv, faUndoAlt, faHighlighter, faMicrophone, faCompressArrowsAlt, faPhone, faStamp, faClipboard
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, configure, observable, reaction, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import "normalize.css";
import * as React from 'react';
import Measure from 'react-measure';
import { Doc, DocListCast, Field, FieldResult, Opt } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { List } from '../../new_fields/List';
import { listSpec } from '../../new_fields/Schema';
import { Cast, FieldValue, StrCast } from '../../new_fields/Types';
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { emptyFunction, returnEmptyString, returnFalse, returnOne, returnTrue, Utils, emptyPath } from '../../Utils';
import GoogleAuthenticationManager from '../apis/GoogleAuthenticationManager';
import { DocServer } from '../DocServer';
import { Docs, DocumentOptions } from '../documents/Documents';
import { HistoryUtil } from '../util/History';
import SharingManager from '../util/SharingManager';
import { Transform } from '../util/Transform';
import { CollectionLinearView } from './collections/CollectionLinearView';
import { CollectionViewType, CollectionView } from './collections/CollectionView';
import { CollectionDockingView } from './collections/CollectionDockingView';
import { ContextMenu } from './ContextMenu';
import { DictationOverlay } from './DictationOverlay';
import { DocumentDecorations } from './DocumentDecorations';
import KeyManager from './GlobalKeyHandler';
import "./MainView.scss";
import { MainViewNotifs } from './MainViewNotifs';
import { DocumentView } from './nodes/DocumentView';
import { OverlayView } from './OverlayView';
import PDFMenu from './pdf/PDFMenu';
import { PreviewCursor } from './PreviewCursor';
import MarqueeOptionsMenu from './collections/collectionFreeForm/MarqueeOptionsMenu';
import GestureOverlay from './GestureOverlay';
import { Scripting } from '../util/Scripting';
import { AudioBox } from './nodes/AudioBox';
import SettingsManager from '../util/SettingsManager';
import { TraceMobx } from '../../new_fields/util';
import { RadialMenu } from './nodes/RadialMenu';
import RichTextMenu from '../util/RichTextMenu';

@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    private _buttonBarHeight = 35;
    private _flyoutSizeOnDown = 0;
    private _urlState: HistoryUtil.DocUrl;
    private _docBtnRef = React.createRef<HTMLDivElement>();

    @observable private _panelWidth: number = 0;
    @observable private _panelHeight: number = 0;
    @observable private _flyoutTranslate: boolean = true;
    @observable public flyoutWidth: number = 250;

    @computed private get userDoc() { return CurrentUserUtils.UserDocument; }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeWorkspace, Doc)) : CurrentUserUtils.GuestWorkspace; }
    @computed public get mainFreeform(): Opt<Doc> { return (docs => (docs && docs.length > 1) ? docs[1] : undefined)(DocListCast(this.mainContainer!.data)); }
    @computed public get sidebarButtonsDoc() { return Cast(CurrentUserUtils.UserDocument.sidebarButtons, Doc) as Doc; }

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
                            CollectionDockingView.AddRightSplit(docField, undefined);
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
        const workspaces = Cast(this.userDoc.workspaces, Doc) as Doc;
        const workspaceCount = DocListCast(workspaces.data).length + 1;
        const freeformOptions: DocumentOptions = {
            x: 0,
            y: 400,
            _width: this._panelWidth * .7,
            _height: this._panelHeight,
            title: "Collection " + workspaceCount,
            backgroundColor: "white"
        };
        const freeformDoc = CurrentUserUtils.GuestTarget || Docs.Create.FreeformDocument([], freeformOptions);
        Doc.AddDocToList(Doc.GetProto(CurrentUserUtils.UserDocument.documents as Doc), "data", freeformDoc);
        const mainDoc = Docs.Create.StandardCollectionDockingDocument([{ doc: freeformDoc, initialWidth: 600, path: [Doc.UserDoc().documents as Doc] }], { title: `Workspace ${workspaceCount}` }, id, "row");
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
            const col = this.userDoc && await Cast(this.userDoc.optionalRightCollection, Doc);
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

    @computed get mainDocView() {
        return <DocumentView Document={this.mainContainer!}
            DataDoc={undefined}
            LibraryPath={emptyPath}
            addDocument={undefined}
            addDocTab={this.addDocTabFunc}
            pinToPres={emptyFunction}
            onClick={undefined}
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
            ContainingCollectionDoc={undefined}
            zoomToScale={emptyFunction}
            getScale={returnOne}
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
    addDocTabFunc = (doc: Doc, data: Opt<Doc>, where: string, libraryPath?: Doc[]): boolean => {
        return where === "close" ? CollectionDockingView.CloseRightSplit(doc) :
            doc.dockingConfig ? this.openWorkspace(doc) :
                CollectionDockingView.AddRightSplit(doc, undefined, libraryPath);
    }
    mainContainerXf = () => new Transform(0, -this._buttonBarHeight, 1);

    @computed get flyout() {
        const sidebarContent = this.userDoc && this.userDoc.sidebarContainer;
        if (!(sidebarContent instanceof Doc)) {
            return (null);
        }
        const sidebarButtonsDoc = Cast(CurrentUserUtils.UserDocument.sidebarButtons, Doc) as Doc;
        return <div className="mainView-flyoutContainer" >
            <div className="mainView-tabButtons" style={{ height: `${this._buttonBarHeight}px` }}>
                <DocumentView
                    Document={sidebarButtonsDoc}
                    DataDoc={undefined}
                    LibraryPath={emptyPath}
                    addDocument={undefined}
                    addDocTab={this.addDocTabFunc}
                    pinToPres={emptyFunction}
                    removeDocument={undefined}
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
                    ContainingCollectionDoc={undefined}
                    zoomToScale={emptyFunction}
                    getScale={returnOne}>
                </DocumentView>
            </div>
            <div className="mainView-contentArea" style={{ position: "relative", height: `calc(100% - ${this._buttonBarHeight}px)`, width: "100%", overflow: "visible" }}>
                <DocumentView
                    Document={sidebarContent}
                    DataDoc={undefined}
                    LibraryPath={emptyPath}
                    addDocument={undefined}
                    addDocTab={this.addDocTabFunc}
                    pinToPres={emptyFunction}
                    removeDocument={returnFalse}
                    onClick={undefined}
                    ScreenToLocalTransform={this.mainContainerXf}
                    ContentScaling={returnOne}
                    PanelWidth={this.flyoutWidthFunc}
                    PanelHeight={this.getContentsHeight}
                    renderDepth={0}
                    focus={emptyFunction}
                    backgroundColor={returnEmptyString}
                    parentActive={returnTrue}
                    whenActiveChanged={emptyFunction}
                    bringToFront={emptyFunction}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    zoomToScale={emptyFunction}
                    getScale={returnOne}>
                </DocumentView>
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
        const sidebar = this.userDoc && this.userDoc.sidebarContainer;
        return !this.userDoc || !(sidebar instanceof Doc) ? (null) : (
            <div className="mainView-mainContent" >
                <div className="mainView-flyoutContainer" onPointerLeave={this.pointerLeaveDragger} style={{ width: this.flyoutWidth }}>
                    <div className="mainView-libraryHandle" onPointerDown={this.onPointerDown} onPointerOver={this.pointerOverDragger}
                        style={{ backgroundColor: `${StrCast(sidebar.backgroundColor, "lightGray")}` }} >
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

    addButtonDoc = (doc: Doc) => Doc.AddDocToList(CurrentUserUtils.UserDocument.expandingButtons as Doc, "data", doc);
    remButtonDoc = (doc: Doc) => Doc.RemoveDocFromList(CurrentUserUtils.UserDocument.expandingButtons as Doc, "data", doc);
    moveButtonDoc = (doc: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => this.remButtonDoc(doc) && addDocument(doc);

    buttonBarXf = () => {
        if (!this._docBtnRef.current) return Transform.Identity();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._docBtnRef.current);
        return new Transform(-translateX, -translateY, 1 / scale);
    }
    @computed get docButtons() {
        if (CurrentUserUtils.UserDocument?.expandingButtons instanceof Doc) {
            return <div className="mainView-docButtons" ref={this._docBtnRef}
                style={{ height: !CurrentUserUtils.UserDocument.expandingButtons.isExpanded ? "42px" : undefined }} >
                <MainViewNotifs />
                <CollectionLinearView
                    Document={CurrentUserUtils.UserDocument.expandingButtons}
                    DataDoc={undefined}
                    LibraryPath={emptyPath}
                    fieldKey={"data"}
                    annotationsKey={""}
                    select={emptyFunction}
                    chromeCollapsed={true}
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

    render() {
        return (<div id="mainView-container">
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
        </div >);
    }
}
Scripting.addGlobal(function freezeSidebar() { MainView.expandFlyout(); });
