import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowDown, faArrowUp, faBolt, faCaretUp, faCat, faCheck, faClone, faCloudUploadAlt, faCommentAlt, faCut, faExclamation, faFilePdf, faFilm, faFont, faGlobeAsia, faLongArrowAltRight, faMusic, faObjectGroup, faPause, faPenNib, faPlay, faPortrait, faRedoAlt, faThumbtack, faTree, faUndoAlt, faTv, faChevronRight, faEllipsisV, faCompressArrowsAlt } from '@fortawesome/free-solid-svg-icons';
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
import { RouteStore } from '../../server/RouteStore';
import { emptyFunction, returnEmptyString, returnFalse, returnOne, returnTrue, Utils } from '../../Utils';
import GoogleAuthenticationManager from '../apis/GoogleAuthenticationManager';
import { DocServer } from '../DocServer';
import { Docs, DocumentOptions } from '../documents/Documents';
import { HistoryUtil } from '../util/History';
import SharingManager from '../util/SharingManager';
import { Transform } from '../util/Transform';
import { CollectionLinearView } from './CollectionLinearView';
import { CollectionBaseView, CollectionViewType } from './collections/CollectionBaseView';
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

@observer
export class MainView extends React.Component {
    public static Instance: MainView;
    private _buttonBarHeight = 75;
    private _flyoutSizeOnDown = 0;
    private _urlState: HistoryUtil.DocUrl;

    @observable private _panelWidth: number = 0;
    @observable private _panelHeight: number = 0;
    @observable private _flyoutTranslate: boolean = true;
    @observable public flyoutWidth: number = 250;

    @computed private get userDoc() { return CurrentUserUtils.UserDocument; }
    @computed private get mainContainer() { return this.userDoc ? FieldValue(Cast(this.userDoc.activeWorkspace, Doc)) : CurrentUserUtils.GuestWorkspace; }
    @computed public get mainFreeform(): Opt<Doc> { return (docs => (docs && docs.length > 1) ? docs[1] : undefined)(DocListCast(this.mainContainer!.data)); }

    public isPointerDown = false;

    componentWillMount() {
        var tag = document.createElement('script');

        tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName('script')[0];
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
        if (window.location.pathname !== RouteStore.home) {
            let pathname = window.location.pathname.substr(1).split("/");
            if (pathname.length > 1) {
                let type = pathname[0];
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
        library.add(faPenNib);
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
        library.add(faArrowDown);
        library.add(faArrowUp);
        library.add(faCloudUploadAlt);
        library.add(faBolt);
        library.add(faChevronRight);
        library.add(faEllipsisV);
        this.initEventListeners();
        this.initAuthenticationRouters();
    }

    globalPointerDown = action((e: PointerEvent) => {
        this.isPointerDown = true;
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
        let received = CurrentUserUtils.MainDocId;
        if (received && !this.userDoc) {
            reaction(
                () => CurrentUserUtils.GuestTarget,
                target => target && this.createNewWorkspace(),
                { fireImmediately: true }
            );
        } else {
            if (received && this._urlState.sharing) {
                reaction(() => CollectionDockingView.Instance && CollectionDockingView.Instance.initialized,
                    initialized => initialized && received && DocServer.GetRefField(received).then(field => {
                        if (field instanceof Doc && field.viewType !== CollectionViewType.Docking) {
                            CollectionDockingView.AddRightSplit(field, undefined);
                        }
                    }),
                );
            }
            let doc = this.userDoc && await Cast(this.userDoc.activeWorkspace, Doc);
            if (doc) {
                this.openWorkspace(doc);
            } else {
                this.createNewWorkspace();
            }
        }
    }

    @action
    createNewWorkspace = async (id?: string) => {
        let freeformOptions: DocumentOptions = {
            x: 0,
            y: 400,
            width: this._panelWidth * .7,
            height: this._panelHeight,
            title: "My Blank Collection"
        };
        let workspaces: FieldResult<Doc>;
        let freeformDoc = CurrentUserUtils.GuestTarget || Docs.Create.FreeformDocument([], freeformOptions);
        var dockingLayout = { content: [{ type: 'row', content: [CollectionDockingView.makeDocumentConfig(freeformDoc, freeformDoc, 600)] }] };
        let mainDoc = Docs.Create.DockDocument([freeformDoc], JSON.stringify(dockingLayout), {}, id);
        if (this.userDoc && ((workspaces = Cast(this.userDoc.workspaces, Doc)) instanceof Doc)) {
            if (!this.userDoc.linkManagerDoc) {
                let linkManagerDoc = new Doc();
                linkManagerDoc.allLinks = new List<Doc>([]);
                this.userDoc.linkManagerDoc = linkManagerDoc;
            }
            Doc.AddDocToList(workspaces, "data", mainDoc);
            mainDoc.title = `Workspace ${DocListCast(workspaces.data).length}`;
        }
        // bcz: strangely, we need a timeout to prevent exceptions/issues initializing GoldenLayout (the rendering engine for Main Container)
        setTimeout(() => this.openWorkspace(mainDoc), 0);
    }

    @action
    openWorkspace = async (doc: Doc, fromHistory = false) => {
        CurrentUserUtils.MainDocId = doc[Id];

        if (doc) {  // this has the side-effect of setting the main container since we're assigning the active/guest workspace
            !("presentationView" in doc) && (doc.presentationView = new List<Doc>([Docs.Create.TreeDocument([], { title: "Presentation" })]));
            this.userDoc ? (this.userDoc.activeWorkspace = doc) : (CurrentUserUtils.GuestWorkspace = doc);
        }
        let state = this._urlState;
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
                CollectionBaseView.SetSafeMode(true);
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

    @computed get dockingContent() {
        const mainContainer = this.mainContainer;
        return <Measure offset onResize={this.onResize}>
            {({ measureRef }) =>
                <div ref={measureRef} className="mainView-mainDiv" onDrop={this.onDrop}>
                    {!mainContainer ? (null) :
                        <DocumentView Document={mainContainer}
                            DataDoc={undefined}
                            addDocument={undefined}
                            addDocTab={this.addDocTabFunc}
                            pinToPres={emptyFunction}
                            onClick={undefined}
                            ruleProvider={undefined}
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
                        />}
                </div>
            }
        </Measure>;
    }

    onPointerDown = (e: React.PointerEvent) => {
        if (this._flyoutTranslate) {
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
        if (this.flyoutWidth === 0) {
            this.flyoutWidth = 250;
            this._flyoutTranslate = false;
        }
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
    }
    @action
    onPointerUp = (e: PointerEvent) => {
        if (Math.abs(e.clientX - this._flyoutSizeOnDown) < 4) {
            this.flyoutWidth = this.flyoutWidth < 5 ? 250 : 0;
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }
    flyoutWidthFunc = () => this.flyoutWidth;
    addDocTabFunc = (doc: Doc, data: Opt<Doc>, where: string) => {
        if (where === "close") {
            return CollectionDockingView.CloseRightSplit(doc);
        }
        if (doc.dockingConfig) {
            this.openWorkspace(doc);
            return true;
        } else {
            return CollectionDockingView.AddRightSplit(doc, undefined);
        }
    }
    @computed
    get flyout() {
        let sidebarContent = this.userDoc && this.userDoc.sidebarContainer;
        if (!(sidebarContent instanceof Doc)) {
            return (null);
        }
        let libraryButtonDoc = Cast(CurrentUserUtils.UserDocument.libraryButtons, Doc) as Doc;
        libraryButtonDoc.columnWidth = this.flyoutWidth / 3 - 30;
        return <div className="mainView-flyoutContainer">
            <div className="mainView-tabButtons" style={{ height: `${this._buttonBarHeight}px` }}>
                <DocumentView
                    Document={libraryButtonDoc}
                    DataDoc={undefined}
                    addDocument={undefined}
                    addDocTab={this.addDocTabFunc}
                    pinToPres={emptyFunction}
                    removeDocument={undefined}
                    ruleProvider={undefined}
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
            <div style={{ position: "relative", height: `calc(100% - ${this._buttonBarHeight}px)`, width: "100%", overflow: "auto" }}>
                <DocumentView
                    Document={sidebarContent}
                    DataDoc={undefined}
                    addDocument={undefined}
                    addDocTab={this.addDocTabFunc}
                    pinToPres={emptyFunction}
                    removeDocument={returnFalse}
                    ruleProvider={undefined}
                    onClick={undefined}
                    ScreenToLocalTransform={Transform.Identity}
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
                <button className="mainView-logout" key="logout" onClick={() => window.location.assign(Utils.prepend(RouteStore.logout))}>
                    {CurrentUserUtils.GuestWorkspace ? "Exit" : "Log Out"}
                </button>
            </div></div>;
    }

    @computed
    get mainContent() {
        const sidebar = this.userDoc && this.userDoc.sidebarContainer;
        return !this.userDoc || !(sidebar instanceof Doc) ? (null) : (
            <div className="mainView-mainContent" >
                <div className="mainView-flyoutContainer" onPointerLeave={this.pointerLeaveDragger}>
                    <div className="mainView-libraryHandle"
                        style={{ cursor: "ew-resize", left: `${(this.flyoutWidth * (this._flyoutTranslate ? 1 : 0)) - 10}px`, backgroundColor: `${StrCast(sidebar.backgroundColor, "lightGray")}` }}
                        onPointerDown={this.onPointerDown} onPointerOver={this.pointerOverDragger}>
                        <span title="library View Dragger" style={{
                            width: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "100%" : "3vw",
                            height: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "100%" : "100vh",
                            position: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "absolute" : "fixed",
                            top: (this.flyoutWidth !== 0 && this._flyoutTranslate) ? "" : "0"
                        }} />
                    </div>
                    <div className="mainView-libraryFlyout" style={{
                        width: `${this.flyoutWidth}px`,
                        zIndex: 1,
                        transformOrigin: this._flyoutTranslate ? "" : "left center",
                        transition: this._flyoutTranslate ? "" : "width .5s",
                        transform: `scale(${this._flyoutTranslate ? 1 : 0.8})`,
                        boxShadow: this._flyoutTranslate ? "" : "rgb(156, 147, 150) 0.2vw 0.2vw 0.8vw"
                    }}>
                        {this.flyout}
                        {this.expandButton}
                    </div>
                </div>
                {this.dockingContent}
            </div>);
    }

    @computed get expandButton() {
        return !this._flyoutTranslate ? (<div className="mainView-expandFlyoutButton" title="Re-attach sidebar" onPointerDown={() => {
            runInAction(() => {
                this.flyoutWidth = 250;
                this._flyoutTranslate = true;
            });
        }}><FontAwesomeIcon icon="chevron-right" color="grey" size="lg" /></div>) : (null);
    }

    addButtonDoc = (doc: Doc) => {
        Doc.AddDocToList(CurrentUserUtils.UserDocument, "docButtons", doc);
        return true;
    }
    remButtonDoc = (doc: Doc) => {
        Doc.RemoveDocFromList(CurrentUserUtils.UserDocument, "docButtons", doc);
        return true;
    }
    @computed get docButtons() {
        return <div className="mainView-docButtons" style={{ left: (this._flyoutTranslate ? this.flyoutWidth : 0) + 20 }} >
            <MainViewNotifs />
            <CollectionLinearView Document={CurrentUserUtils.UserDocument} DataDoc={undefined}
                fieldKey={"docButtons"}
                fieldExt={""}
                showHiddenControls={true}
                select={emptyFunction}
                chromeCollapsed={true}
                active={returnFalse}
                isSelected={returnFalse}
                moveDocument={returnFalse}
                CollectionView={undefined}
                addDocument={this.addButtonDoc}
                addDocTab={this.addDocTabFunc}
                pinToPres={emptyFunction}
                removeDocument={this.remButtonDoc}
                ruleProvider={undefined}
                onClick={undefined}
                ScreenToLocalTransform={Transform.Identity}
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

    render() {
        return (<div className="mainView-container">
            <DictationOverlay />
            <SharingManager />
            <GoogleAuthenticationManager />
            <DocumentDecorations />
            {this.mainContent}
            <PreviewCursor />
            <ContextMenu />
            {this.docButtons}
            <PDFMenu />
            <MarqueeOptionsMenu />
            <OverlayView />
        </div >);
    }
}
