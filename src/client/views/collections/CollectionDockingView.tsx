import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, Lambda, observable, reaction, trace, computed } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import Measure from "react-measure";
import * as GoldenLayout from "../../../client/goldenLayout";
import { Doc, DocListCast, Field, Opt } from "../../../new_fields/Doc";
import { Id } from '../../../new_fields/FieldSymbols';
import { FieldId } from "../../../new_fields/RefField";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, NumCast, StrCast, BoolCast } from "../../../new_fields/Types";
import { emptyFunction, returnTrue, Utils, returnOne } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { DocumentManager } from '../../util/DocumentManager';
import { DragLinksAsDocuments, DragManager } from "../../util/DragManager";
import { SelectionManager } from '../../util/SelectionManager';
import { Transform } from '../../util/Transform';
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocumentView } from "../nodes/DocumentView";
import { CollectionViewType } from './CollectionBaseView';
import "./CollectionDockingView.scss";
import { SubCollectionViewProps } from "./CollectionSubView";
import { ParentDocSelector } from './ParentDocumentSelector';
import React = require("react");
import { MainView } from '../MainView';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile, faUnlockAlt } from '@fortawesome/free-solid-svg-icons';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { Docs } from '../../documents/Documents';
library.add(faFile);

@observer
export class CollectionDockingView extends React.Component<SubCollectionViewProps> {
    public static Instance: CollectionDockingView;
    public static makeDocumentConfig(document: Doc, dataDoc: Doc | undefined, width?: number) {
        return {
            type: 'react-component',
            component: 'DocumentFrameRenderer',
            title: document.title,
            width: width,
            props: {
                documentId: document[Id],
                dataDocumentId: dataDoc ? dataDoc[Id] : ""
                //collectionDockingView: CollectionDockingView.Instance
            }
        };
    }

    private _goldenLayout: any = null;
    private _containerRef = React.createRef<HTMLDivElement>();
    private _flush: boolean = false;
    private _ignoreStateChange = "";
    private _isPointerDown = false;
    private _maximizedSrc: Opt<DocumentView>;

    constructor(props: SubCollectionViewProps) {
        super(props);
        if (props.addDocTab === emptyFunction) CollectionDockingView.Instance = this;
        //Why is this here?
        (window as any).React = React;
        (window as any).ReactDOM = ReactDOM;
    }
    hack: boolean = false;
    undohack: any = null;
    public StartOtherDrag(e: any, dragDocs: Doc[], dragDataDocs: (Doc | undefined)[] = []) {
        let config: any;
        if (dragDocs.length === 1) {
            config = CollectionDockingView.makeDocumentConfig(dragDocs[0], dragDataDocs[0]);
        } else {
            config = {
                type: 'row',
                content: dragDocs.map((doc, i) => {
                    CollectionDockingView.makeDocumentConfig(doc, dragDataDocs[i]);
                })
            };
        }
        const div = document.createElement("div");
        const dragSource = this._goldenLayout.createDragSource(div, config);
        dragSource._dragListener.on("dragStop", () => {
            dragSource.destroy();
        });
        dragSource._dragListener.onMouseDown(e);
        // dragSource.destroy();
        // this.hack = true;
        // this.undohack = UndoManager.StartBatch("goldenDrag");
        // dragDocs.map((dragDoc, i) =>
        //     this.AddRightSplit(dragDoc, dragDataDocs[i], true).contentItems[0].tab._dragListener.
        //         onMouseDown({ pageX: e.pageX, pageY: e.pageY, preventDefault: emptyFunction, button: 0 }));
    }

    @action
    public OpenFullScreen(docView: DocumentView) {
        let document = Doc.MakeAlias(docView.props.Document);
        let dataDoc = docView.dataDoc;
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document, dataDoc)]
        };
        var docconfig = this._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, this._goldenLayout);
        this._goldenLayout.root.contentItems[0].addChild(docconfig);
        docconfig.callDownwards('_$init');
        this._goldenLayout._$maximiseItem(docconfig);
        this._maximizedSrc = docView;
        this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
        this.stateChanged();
    }

    public CloseFullScreen = () => {
        let target = this._goldenLayout._maximisedItem;
        if (target !== null && this._maximizedSrc) {
            this._goldenLayout._maximisedItem.remove();
            SelectionManager.SelectDoc(this._maximizedSrc, false);
            this._maximizedSrc = undefined;
            this.stateChanged();
        }
    }

    public HasFullScreen = () => {
        return this._goldenLayout._maximisedItem !== null;
    }

    @undoBatch
    @action
    public CloseRightSplit = (document: Doc): boolean => {
        let retVal = false;
        if (this._goldenLayout.root.contentItems[0].isRow) {
            retVal = Array.from(this._goldenLayout.root.contentItems[0].contentItems).some((child: any) => {
                if (child.contentItems.length === 1 && child.contentItems[0].config.component === "DocumentFrameRenderer" &&
                    Doc.AreProtosEqual(DocumentManager.Instance.getDocumentViewById(child.contentItems[0].config.props.documentId)!.Document, document)) {
                    child.contentItems[0].remove();
                    this.layoutChanged(document);
                    return true;
                } else {
                    Array.from(child.contentItems).filter((tab: any) => tab.config.component === "DocumentFrameRenderer").some((tab: any, j: number) => {
                        if (Doc.AreProtosEqual(DocumentManager.Instance.getDocumentViewById(tab.config.props.documentId)!.Document, document)) {
                            child.contentItems[j].remove();
                            child.config.activeItemIndex = Math.max(child.contentItems.length - 1, 0);
                            let docs = Cast(this.props.Document.data, listSpec(Doc));
                            docs && docs.indexOf(document) !== -1 && docs.splice(docs.indexOf(document), 1);
                            return true;
                        }
                        return false;
                    });
                }
                return false;
            });
        }
        if (retVal) {
            this.stateChanged();
        }
        return retVal;
    }

    @action
    layoutChanged(removed?: Doc) {
        this._goldenLayout.root.callDownwards('setSize', [this._goldenLayout.width, this._goldenLayout.height]);
        this._goldenLayout.emit('stateChanged');
        this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
        if (removed) CollectionDockingView.Instance._removedDocs.push(removed);
        this.stateChanged();
    }

    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to that split
    //
    @action
    public AddRightSplit = (document: Doc, dataDoc: Doc | undefined, minimize: boolean = false) => {
        let docs = Cast(this.props.Document.data, listSpec(Doc));
        if (docs) {
            docs.push(document);
        }
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document, dataDoc)]
        };

        var newContentItem = this._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, this._goldenLayout);

        if (this._goldenLayout.root.contentItems.length === 0) {
            this._goldenLayout.root.addChild(newContentItem);
        } else if (this._goldenLayout.root.contentItems[0].isRow) {
            this._goldenLayout.root.contentItems[0].addChild(newContentItem);
        } else {
            var collayout = this._goldenLayout.root.contentItems[0];
            var newRow = collayout.layoutManager.createContentItem({ type: "row" }, this._goldenLayout);
            collayout.parent.replaceChild(collayout, newRow);

            newRow.addChild(newContentItem, undefined, true);
            newRow.addChild(collayout, 0, true);

            collayout.config.width = 50;
            newContentItem.config.width = 50;
        }
        if (minimize) {
            // bcz: this makes the drag image show up better, but it also messes with fixed layout sizes
            // newContentItem.config.width = 10;
            // newContentItem.config.height = 10;
        }
        newContentItem.callDownwards('_$init');
        this.layoutChanged();

        return newContentItem;
    }
    @action
    public AddTab = (stack: any, document: Doc, dataDocument: Doc | undefined) => {
        let docs = Cast(this.props.Document.data, listSpec(Doc));
        if (docs) {
            docs.push(document);
        }
        let docContentConfig = CollectionDockingView.makeDocumentConfig(document, dataDocument);
        var newContentItem = stack.layoutManager.createContentItem(docContentConfig, this._goldenLayout);
        stack.addChild(newContentItem.contentItems[0], undefined);
        this.layoutChanged();
    }

    setupGoldenLayout() {
        var config = StrCast(this.props.Document.dockingConfig);
        if (config) {
            if (!this._goldenLayout) {
                this._goldenLayout = new GoldenLayout(JSON.parse(config));
            }
            else {
                if (config === JSON.stringify(this._goldenLayout.toConfig())) {
                    return;
                }
                try {
                    this._goldenLayout.unbind('itemDropped', this.itemDropped);
                    this._goldenLayout.unbind('tabCreated', this.tabCreated);
                    this._goldenLayout.unbind('tabDestroyed', this.tabDestroyed);
                    this._goldenLayout.unbind('stackCreated', this.stackCreated);
                } catch (e) { }
                this._goldenLayout.destroy();
                this._goldenLayout = new GoldenLayout(JSON.parse(config));
            }
            this._goldenLayout.on('itemDropped', this.itemDropped);
            this._goldenLayout.on('tabCreated', this.tabCreated);
            this._goldenLayout.on('tabDestroyed', this.tabDestroyed);
            this._goldenLayout.on('stackCreated', this.stackCreated);
            this._goldenLayout.registerComponent('DocumentFrameRenderer', DockedFrameRenderer);
            this._goldenLayout.container = this._containerRef.current;
            if (this._goldenLayout.config.maximisedItemId === '__glMaximised') {
                try {
                    this._goldenLayout.config.root.getItemsById(this._goldenLayout.config.maximisedItemId)[0].toggleMaximise();
                } catch (e) {
                    this._goldenLayout.config.maximisedItemId = null;
                }
            }
            this._goldenLayout.init();
        }
    }
    reactionDisposer?: Lambda;
    componentDidMount: () => void = () => {
        if (this._containerRef.current) {
            this.reactionDisposer = reaction(
                () => StrCast(this.props.Document.dockingConfig),
                () => {
                    if (!this._goldenLayout || this._ignoreStateChange !== JSON.stringify(this._goldenLayout.toConfig())) {
                        // Because this is in a set timeout, if this component unmounts right after mounting,
                        // we will leak a GoldenLayout, because we try to destroy it before we ever create it
                        setTimeout(() => this.setupGoldenLayout(), 1);
                        DocListCast((CurrentUserUtils.UserDocument.workspaces as Doc).data).map(d => d.workspaceBrush = false);
                        this.props.Document.workspaceBrush = true;
                    }
                    this._ignoreStateChange = "";
                }, { fireImmediately: true });

            window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
        }
    }
    componentWillUnmount: () => void = () => {
        try {
            this.props.Document.workspaceBrush = false;
            this._goldenLayout.unbind('itemDropped', this.itemDropped);
            this._goldenLayout.unbind('tabCreated', this.tabCreated);
            this._goldenLayout.unbind('stackCreated', this.stackCreated);
            this._goldenLayout.unbind('tabDestroyed', this.tabDestroyed);
        } catch (e) {

        }
        if (this._goldenLayout) this._goldenLayout.destroy();
        this._goldenLayout = null;
        window.removeEventListener('resize', this.onResize);

        if (this.reactionDisposer) {
            this.reactionDisposer();
        }
    }
    @action
    onResize = (event: any) => {
        var cur = this._containerRef.current;

        // bcz: since GoldenLayout isn't a React component itself, we need to notify it to resize when its document container's size has changed
        this._goldenLayout && this._goldenLayout.updateSize(cur!.getBoundingClientRect().width, cur!.getBoundingClientRect().height);
    }

    @action
    onPointerUp = (e: React.PointerEvent): void => {
        if (this._flush) {
            this._flush = false;
            setTimeout(() => {
                CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
                this.stateChanged();
            }, 10);
        }
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._isPointerDown = true;
        let onPointerUp = action(() => {
            window.removeEventListener("pointerup", onPointerUp);
            this._isPointerDown = false;
        });
        window.addEventListener("pointerup", onPointerUp);
        var className = (e.target as any).className;
        if (className === "messageCounter") {
            e.stopPropagation();
            e.preventDefault();
            let x = e.clientX;
            let y = e.clientY;
            let docid = (e.target as any).DashDocId;
            let tab = (e.target as any).parentElement as HTMLElement;
            DocServer.GetRefField(docid).then(action(async (sourceDoc: Opt<Field>) =>
                (sourceDoc instanceof Doc) && DragLinksAsDocuments(tab, x, y, sourceDoc)));
        }
        if (className === "lm_drag_handle" || className === "lm_close" || className === "lm_maximise" || className === "lm_minimise" || className === "lm_close_tab") {
            this._flush = true;
        }
    }

    @undoBatch
    stateChanged = () => {
        let docs = Cast(CollectionDockingView.Instance.props.Document.data, listSpec(Doc));
        CollectionDockingView.Instance._removedDocs.map(theDoc =>
            docs && docs.indexOf(theDoc) !== -1 &&
            docs.splice(docs.indexOf(theDoc), 1));
        CollectionDockingView.Instance._removedDocs.length = 0;
        var json = JSON.stringify(this._goldenLayout.toConfig());
        this.props.Document.dockingConfig = json;
        if (this.undohack && !this.hack) {
            this.undohack.end();
            this.undohack = undefined;
        }
        this.hack = false;
    }

    itemDropped = () => {
        CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
        this.stateChanged();
    }

    htmlToElement(html: string) {
        var template = document.createElement('template');
        html = html.trim(); // Never return a text node of whitespace as the result
        template.innerHTML = html;
        return template.content.firstChild;
    }

    tabCreated = async (tab: any) => {
        if (tab.hasOwnProperty("contentItem") && tab.contentItem.config.type !== "stack") {
            if (tab.contentItem.config.fixed) {
                tab.contentItem.parent.config.fixed = true;
            }

            let doc = await DocServer.GetRefField(tab.contentItem.config.props.documentId) as Doc;
            let dataDoc = await DocServer.GetRefField(tab.contentItem.config.props.dataDocumentId) as Doc;
            if (doc instanceof Doc) {
                let dragSpan = document.createElement("span");
                dragSpan.style.position = "relative";
                dragSpan.style.bottom = "6px";
                dragSpan.style.paddingLeft = "4px";
                dragSpan.style.paddingRight = "2px";
                let upDiv = document.createElement("span");
                const stack = tab.contentItem.parent;
                // shifts the focus to this tab when another tab is dragged over it
                tab.element[0].onmouseenter = (e: any) => {
                    if (!this._isPointerDown) return;
                    var activeContentItem = tab.header.parent.getActiveContentItem();
                    if (tab.contentItem !== activeContentItem) {
                        tab.header.parent.setActiveContentItem(tab.contentItem);
                    }
                    tab.setActive(true);
                };
                ReactDOM.render(<span title="Drag as document" onPointerDown={
                    e => {
                        e.preventDefault();
                        e.stopPropagation();
                        DragManager.StartDocumentDrag([dragSpan], new DragManager.DocumentDragData([doc], [dataDoc]), e.clientX, e.clientY, {
                            handlers: { dragComplete: emptyFunction },
                            hideSource: false
                        });
                    }}><FontAwesomeIcon icon="file" size="lg" /></span>, dragSpan);
                ReactDOM.render(<ParentDocSelector Document={doc} addDocTab={doc => CollectionDockingView.Instance.AddTab(stack, doc, dataDoc)} />, upDiv);
                tab.reactComponents = [dragSpan, upDiv];
                tab.element.append(dragSpan);
                tab.element.append(upDiv);
                tab.reactionDisposer = reaction(() => [doc.title],
                    () => {
                        tab.titleElement[0].textContent = doc.title;
                    }, { fireImmediately: true });
                //TODO why can't this just be doc instead of the id?
                tab.titleElement[0].DashDocId = tab.contentItem.config.props.documentId;
            }
        }
        tab.titleElement[0].Tab = tab;
        tab.closeElement.off('click') //unbind the current click handler
            .click(async function () {
                if (tab.reactionDisposer) {
                    tab.reactionDisposer();
                }
                let doc = await DocServer.GetRefField(tab.contentItem.config.props.documentId);
                if (doc instanceof Doc) {
                    let theDoc = doc;
                    CollectionDockingView.Instance._removedDocs.push(theDoc);

                    const recent = await Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc);
                    if (recent) {
                        Doc.AddDocToList(recent, "data", doc, undefined, true, true);
                    }
                    SelectionManager.DeselectAll();
                }
                CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
                tab.contentItem.remove();
                CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
            });
    }

    tabDestroyed = (tab: any) => {
        if (tab.reactComponents) {
            for (const ele of tab.reactComponents) {
                ReactDOM.unmountComponentAtNode(ele);
            }
        }
    }
    _removedDocs: Doc[] = [];

    stackCreated = (stack: any) => {
        //stack.header.controlsContainer.find('.lm_popout').hide();
        stack.header.element[0].style.backgroundColor = DocServer.Control.isReadOnly() ? "#228540" : undefined;
        stack.header.element.on('mousedown', (e: any) => {
            if (e.target === stack.header.element[0] && e.button === 1) {
                this.AddTab(stack, Docs.Create.FreeformDocument([], { width: this.props.PanelWidth(), height: this.props.PanelHeight(), title: "Untitled Collection" }), undefined);
            }
        });
        stack.header.controlsContainer.find('.lm_close') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(async function () {
                //if (confirm('really close this?')) {
                const recent = await Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc);
                stack.remove();
                stack.contentItems.forEach(async (contentItem: any) => {
                    let doc = await DocServer.GetRefField(contentItem.config.props.documentId);
                    if (doc instanceof Doc) {
                        if (recent) {
                            Doc.AddDocToList(recent, "data", doc, undefined, true, true);
                        }
                        let theDoc = doc;
                        CollectionDockingView.Instance._removedDocs.push(theDoc);
                    }
                });
                //}
            }));
        stack.header.controlsContainer.find('.lm_popout') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(function () {
                stack.config.fixed = !stack.config.fixed;
                // var url = DocServer.prepend("/doc/" + stack.contentItems[0].tab.contentItem.config.props.documentId);
                // let win = window.open(url, stack.contentItems[0].tab.title, "width=300,height=400");
            }));
    }

    render() {
        if (this.props.renderDepth > 0) {
            return <div style={{ width: "100%", height: "100%" }}>Nested workspaces can't be rendered</div>;
        }
        return (
            <Measure offset onResize={this.onResize}>
                {({ measureRef }) =>
                    <div ref={measureRef}>
                        <div className="collectiondockingview-container" id="menuContainer"
                            onPointerDown={this.onPointerDown} onPointerUp={this.onPointerUp} ref={this._containerRef} />
                    </div>
                }
            </Measure>
        );
    }

}

interface DockedFrameProps {
    documentId: FieldId;
    dataDocumentId: FieldId;
    glContainer: any;
    //collectionDockingView: CollectionDockingView
}
@observer
export class DockedFrameRenderer extends React.Component<DockedFrameProps> {
    _mainCont = React.createRef<HTMLDivElement>();
    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;
    @observable private _document: Opt<Doc>;
    @observable private _dataDoc: Opt<Doc>;

    @observable private _isActive: boolean = false;

    get _stack(): any {
        let parent = (this.props as any).glContainer.parent.parent;
        if (this._document && this._document.excludeFromLibrary && parent.parent && parent.parent.contentItems.length > 1) {
            return parent.parent.contentItems[1];
        }
        return parent;
    }
    constructor(props: any) {
        super(props);
        DocServer.GetRefField(this.props.documentId).then(action((f: Opt<Field>) => {
            this._document = f as Doc;
            if (this.props.dataDocumentId && this.props.documentId !== this.props.dataDocumentId) {
                DocServer.GetRefField(this.props.dataDocumentId).then(action((f: Opt<Field>) => this._dataDoc = f as Doc));
            }
        }));
    }

    componentDidMount() {
        this.props.glContainer.layoutManager.on("activeContentItemChanged", this.onActiveContentItemChanged);
        this.props.glContainer.on("tab", this.onActiveContentItemChanged);
        this.onActiveContentItemChanged();
    }

    componentWillUnmount() {
        this.props.glContainer.layoutManager.off("activeContentItemChanged", this.onActiveContentItemChanged);
        this.props.glContainer.off("tab", this.onActiveContentItemChanged);
    }

    @action.bound
    private onActiveContentItemChanged() {
        if (this.props.glContainer.tab) {
            this._isActive = this.props.glContainer.tab.isActive;
        }
    }


    nativeWidth = () => NumCast(this._document!.nativeWidth, this._panelWidth);
    nativeHeight = () => {
        let nh = NumCast(this._document!.nativeHeight, this._panelHeight);
        let res = BoolCast(this._document!.ignoreAspect) ? this._panelHeight : nh;
        return res;
    }
    contentScaling = () => {
        const nativeH = this.nativeHeight();
        const nativeW = this.nativeWidth();
        let wscale = this._panelWidth / nativeW;
        return wscale * nativeH > this._panelHeight ? this._panelHeight / nativeH : wscale;
    }

    ScreenToLocalTransform = () => {
        if (this._mainCont.current && this._mainCont.current.children) {
            let { scale, translateX, translateY } = Utils.GetScreenTransform(this._mainCont.current.children[0].firstChild as HTMLElement);
            scale = Utils.GetScreenTransform(this._mainCont.current).scale;
            return CollectionDockingView.Instance.props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(1 / this.contentScaling() / scale);
        }
        return Transform.Identity();
    }
    get scaleToFitMultiplier() {
        let docWidth = NumCast(this._document!.width);
        let docHeight = NumCast(this._document!.height);
        if (NumCast(this._document!.nativeWidth) || !docWidth || !this._panelWidth || !this._panelHeight) return 1;
        if (StrCast(this._document!.layout).indexOf("Collection") === -1 ||
            !BoolCast(this._document!.fitToContents, false) ||
            NumCast(this._document!.viewType) !== CollectionViewType.Freeform) return 1;
        let scaling = Math.max(1, this._panelWidth / docWidth * docHeight > this._panelHeight ?
            this._panelHeight / docHeight : this._panelWidth / docWidth);
        return scaling;
    }
    get previewPanelCenteringOffset() { return (this._panelWidth - this.nativeWidth() * this.contentScaling()) / 2; }

    addDocTab = (doc: Doc, dataDoc: Doc | undefined, location: string) => {
        if (doc.dockingConfig) {
            MainView.Instance.openWorkspace(doc);
        } else if (location === "onRight") {
            CollectionDockingView.Instance.AddRightSplit(doc, dataDoc);
        } else {
            CollectionDockingView.Instance.AddTab(this._stack, doc, dataDoc);
        }
    }
    @computed get docView() {
        if (!this._document) {
            return (null);
        }
        let resolvedDataDoc = this._document.layout instanceof Doc ? this._document : this._dataDoc;
        return <DocumentView key={this._document[Id]}
            Document={this._document}
            DataDoc={resolvedDataDoc}
            bringToFront={emptyFunction}
            addDocument={undefined}
            removeDocument={undefined}
            ContentScaling={this.contentScaling}
            PanelWidth={this.nativeWidth}
            PanelHeight={this.nativeHeight}
            ScreenToLocalTransform={this.ScreenToLocalTransform}
            renderDepth={0}
            selectOnLoad={false}
            parentActive={returnTrue}
            whenActiveChanged={emptyFunction}
            focus={emptyFunction}
            addDocTab={this.addDocTab}
            ContainingCollectionView={undefined}
            zoomToScale={emptyFunction}
            getScale={returnOne} />;
    }

    @computed get content() {
        if (!this._document) {
            return (null);
        }
        return (
            <div className="collectionDockingView-content" ref={this._mainCont}
                style={{ transform: `translate(${this.previewPanelCenteringOffset}px, 0px) scale(${this.scaleToFitMultiplier})` }}>
                {this.docView}
            </div >);
    }

    render() {
        if (!this._isActive) return null;
        let theContent = this.content;
        return !this._document ? (null) :
            <Measure offset onResize={action((r: any) => { this._panelWidth = r.offset.width; this._panelHeight = r.offset.height; })}>
                {({ measureRef }) => <div ref={measureRef}>
                    {theContent}
                </div>}
            </Measure>;
    }
}