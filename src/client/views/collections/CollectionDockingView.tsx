import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, Lambda, observable, reaction, computed, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import Measure from "react-measure";
import * as GoldenLayout from "../../../client/goldenLayout";
import { DateField } from '../../../new_fields/DateField';
import { Doc, DocListCast, Field, Opt } from "../../../new_fields/Doc";
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { FieldId } from "../../../new_fields/RefField";
import { listSpec } from "../../../new_fields/Schema";
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { emptyFunction, returnEmptyString, returnFalse, returnOne, returnTrue, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs } from '../../documents/Documents';
import { DocumentManager } from '../../util/DocumentManager';
import { DragLinksAsDocuments, DragManager } from "../../util/DragManager";
import { SelectionManager } from '../../util/SelectionManager';
import { Transform } from '../../util/Transform';
import { undoBatch } from "../../util/UndoManager";
import { MainView } from '../MainView';
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionDockingView.scss";
import { SubCollectionViewProps } from "./CollectionSubView";
import React = require("react");
import { ButtonSelector } from './ParentDocumentSelector';
import { DocumentType } from '../../documents/DocumentTypes';
import { ComputedField } from '../../../new_fields/ScriptField';
import { InteractionUtils } from '../../util/InteractionUtils';
library.add(faFile);
const _global = (window /* browser */ || global /* node */) as any;

@observer
export class CollectionDockingView extends React.Component<SubCollectionViewProps> {
    @observable public static Instances: CollectionDockingView[] = [];
    @computed public static get Instance() { return CollectionDockingView.Instances[0]; }
    public static makeDocumentConfig(document: Doc, dataDoc: Doc | undefined, width?: number) {
        return {
            type: 'react-component',
            component: 'DocumentFrameRenderer',
            title: document.title,
            width: width,
            props: {
                documentId: document[Id],
                dataDocumentId: dataDoc && dataDoc[Id] !== document[Id] ? dataDoc[Id] : ""
                //collectionDockingView: CollectionDockingView.Instance
            }
        };
    }

    @computed public get initialized() {
        return this._goldenLayout !== null;
    }

    @observable private _goldenLayout: any = null;
    private _containerRef = React.createRef<HTMLDivElement>();
    private _flush: boolean = false;
    private _ignoreStateChange = "";
    private _isPointerDown = false;
    private _maximizedSrc: Opt<DocumentView>;

    constructor(props: SubCollectionViewProps) {
        super(props);
        runInAction(() => !CollectionDockingView.Instances ? CollectionDockingView.Instances = [this] : CollectionDockingView.Instances.push(this));
        //Why is this here?
        (window as any).React = React;
        (window as any).ReactDOM = ReactDOM;
    }
    hack: boolean = false;
    undohack: any = null;
    public StartOtherDrag(e: any, dragDocs: Doc[]) {
        let config: any;
        if (dragDocs.length === 1) {
            config = CollectionDockingView.makeDocumentConfig(dragDocs[0], undefined);
        } else {
            config = {
                type: 'row',
                content: dragDocs.map((doc, i) => {
                    CollectionDockingView.makeDocumentConfig(doc, undefined);
                })
            };
        }
        const div = document.createElement("div");
        const dragSource = this._goldenLayout.createDragSource(div, config);
        dragSource._dragListener.on("dragStop", () => {
            dragSource.destroy();
        });
        dragSource._dragListener.onMouseDown(e);
    }

    @undoBatch
    @action
    public OpenFullScreen(docView: DocumentView) {
        let document = Doc.MakeAlias(docView.props.Document);
        let dataDoc = docView.props.DataDoc;
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
        SelectionManager.DeselectAll();
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
    public static CloseRightSplit(document: Doc): boolean {
        if (!CollectionDockingView.Instance) return false;
        let instance = CollectionDockingView.Instance;
        let retVal = false;
        if (instance._goldenLayout.root.contentItems[0].isRow) {
            retVal = Array.from(instance._goldenLayout.root.contentItems[0].contentItems).some((child: any) => {
                if (child.contentItems.length === 1 && child.contentItems[0].config.component === "DocumentFrameRenderer" &&
                    DocumentManager.Instance.getDocumentViewById(child.contentItems[0].config.props.documentId) &&
                    Doc.AreProtosEqual(DocumentManager.Instance.getDocumentViewById(child.contentItems[0].config.props.documentId)!.Document, document)) {
                    child.contentItems[0].remove();
                    instance.layoutChanged(document);
                    return true;
                } else {
                    Array.from(child.contentItems).filter((tab: any) => tab.config.component === "DocumentFrameRenderer").some((tab: any, j: number) => {
                        if (DocumentManager.Instance.getDocumentViewById(tab.config.props.documentId) &&
                            Doc.AreProtosEqual(DocumentManager.Instance.getDocumentViewById(tab.config.props.documentId)!.Document, document)) {
                            child.contentItems[j].remove();
                            child.config.activeItemIndex = Math.max(child.contentItems.length - 1, 0);
                            let docs = Cast(instance.props.Document.data, listSpec(Doc));
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
            instance.stateChanged();
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

    public Has = (document: Doc) => {
        let docs = Cast(this.props.Document.data, listSpec(Doc));
        if (!docs) {
            return false;
        }
        return docs.includes(document);
    }

    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to that split
    //
    @undoBatch
    @action
    public static AddRightSplit(document: Doc, dataDoc: Doc | undefined, minimize: boolean = false) {
        if (!CollectionDockingView.Instance) return false;
        let instance = CollectionDockingView.Instance;
        let docs = Cast(instance.props.Document.data, listSpec(Doc));
        if (docs) {
            docs.push(document);
        }
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document, dataDoc)]
        };

        var newContentItem = instance._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, instance._goldenLayout);

        if (instance._goldenLayout.root.contentItems.length === 0) {
            instance._goldenLayout.root.addChild(newContentItem);
        } else if (instance._goldenLayout.root.contentItems[0].isRow) {
            instance._goldenLayout.root.contentItems[0].addChild(newContentItem);
        } else {
            var collayout = instance._goldenLayout.root.contentItems[0];
            var newRow = collayout.layoutManager.createContentItem({ type: "row" }, instance._goldenLayout);
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
        instance.layoutChanged();
        return true;
    }

    @undoBatch
    @action
    public AddTab = (stack: any, document: Doc, dataDocument: Doc | undefined) => {
        Doc.GetProto(document).lastOpened = new DateField;
        let docs = Cast(this.props.Document.data, listSpec(Doc));
        if (docs) {
            docs.push(document);
        }
        let docContentConfig = CollectionDockingView.makeDocumentConfig(document, dataDocument);
        if (stack === undefined) {
            let stack: any = this._goldenLayout.root;
            while (!stack.isStack) {
                if (stack.contentItems.length) {
                    stack = stack.contentItems[0];
                } else {
                    stack.addChild({ type: 'stack', content: [docContentConfig] });
                    stack = undefined;
                    break;
                }
            }
            if (stack) {
                stack.addChild(docContentConfig);
            }
        } else {
            stack.addChild(docContentConfig, undefined);
        }
        this.layoutChanged();
        return true;
    }

    setupGoldenLayout() {
        var config = StrCast(this.props.Document.dockingConfig);
        if (config) {
            if (!this._goldenLayout) {
                runInAction(() => this._goldenLayout = new GoldenLayout(JSON.parse(config)));
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
                runInAction(() => this._goldenLayout = new GoldenLayout(JSON.parse(config)));
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
                        let userDoc = CurrentUserUtils.UserDocument;
                        userDoc && DocListCast((userDoc.workspaces as Doc).data).map(d => d.workspaceBrush = false);
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
        this._goldenLayout && this._goldenLayout.destroy();
        runInAction(() => {
            CollectionDockingView.Instances.splice(CollectionDockingView.Instances.indexOf(this), 1);
            this._goldenLayout = null;
        });
        window.removeEventListener('resize', this.onResize);

        this.reactionDisposer && this.reactionDisposer();
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
                let gearSpan = document.createElement("span");
                gearSpan.style.position = "relative";
                gearSpan.style.paddingLeft = "0px";
                gearSpan.style.paddingRight = "12px";
                let upDiv = document.createElement("span");
                const stack = tab.contentItem.parent;
                // shifts the focus to this tab when another tab is dragged over it
                tab.element[0].onmouseenter = (e: any) => {
                    if (!this._isPointerDown || !SelectionManager.GetIsDragging()) return;
                    var activeContentItem = tab.header.parent.getActiveContentItem();
                    if (tab.contentItem !== activeContentItem) {
                        tab.header.parent.setActiveContentItem(tab.contentItem);
                    }
                    tab.setActive(true);
                };
                ReactDOM.render(<span title="Drag as document"
                    className="collectionDockingView-dragAsDocument"
                    onPointerDown={
                        e => {
                            e.preventDefault();
                            e.stopPropagation();
                            DragManager.StartDocumentDrag([dragSpan], new DragManager.DocumentDragData([doc]), e.clientX, e.clientY, {
                                handlers: { dragComplete: emptyFunction },
                                hideSource: false
                            });
                        }}><FontAwesomeIcon icon="file" size="lg" /></span>, dragSpan);
                ReactDOM.render(<ButtonSelector Document={doc} Stack={stack} />, gearSpan);
                // ReactDOM.render(<ParentDocSelector Document={doc} addDocTab={(doc, data, where) => {
                //     where === "onRight" ? CollectionDockingView.AddRightSplit(doc, dataDoc) : CollectionDockingView.Instance.AddTab(stack, doc, dataDoc);
                //     return true;
                // }} />, upDiv);
                tab.reactComponents = [dragSpan, gearSpan, upDiv];
                tab.element.append(dragSpan);
                tab.element.append(gearSpan);
                tab.element.append(upDiv);
                tab.reactionDisposer = reaction(() => [doc.title, Doc.IsBrushedDegree(doc)], () => {
                    tab.titleElement[0].textContent = doc.title, { fireImmediately: true };
                    tab.titleElement[0].style.outline = `${["transparent", "white", "white"][Doc.IsBrushedDegreeUnmemoized(doc)]} ${["none", "dashed", "solid"][Doc.IsBrushedDegreeUnmemoized(doc)]} 1px`;
                });
                //TODO why can't this just be doc instead of the id?
                tab.titleElement[0].DashDocId = tab.contentItem.config.props.documentId;
            }
        }
        tab.titleElement[0].Tab = tab;
        tab.closeElement.off('click') //unbind the current click handler
            .click(async function () {
                tab.reactionDisposer && tab.reactionDisposer();
                let doc = await DocServer.GetRefField(tab.contentItem.config.props.documentId);
                if (doc instanceof Doc) {
                    let theDoc = doc;
                    CollectionDockingView.Instance._removedDocs.push(theDoc);

                    let userDoc = CurrentUserUtils.UserDocument;
                    let recent: Doc | undefined;
                    if (userDoc && (recent = await Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc))) {
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

        // starter code for bezel to add new pane
        // stack.element.on("touchstart", (e: TouchEvent) => {
        // if (e.targetTouches.length === 2) {
        //     let pt1 = e.targetTouches.item(0);
        //     let pt2 = e.targetTouches.item(1);
        //     let threshold = 40 * window.devicePixelRatio;
        //     if (pt1 && pt2 && InteractionUtils.TwoPointEuclidist(pt1, pt2) < threshold) {
        //         let edgeThreshold = 30 * window.devicePixelRatio;
        //         let center = InteractionUtils.CenterPoint([pt1, pt2]);
        //         let stackRect: DOMRect = stack.element.getBoundingClientRect();
        //         let nearLeft = center.X - stackRect.x < edgeThreshold;
        //         let nearTop = center.Y - stackRect.y < edgeThreshold;
        //         let nearRight = stackRect.right - center.X < edgeThreshold;
        //         let nearBottom = stackRect.bottom - center.Y < edgeThreshold;
        //         let ns = [nearLeft, nearTop, nearRight, nearBottom].filter(n => n);
        //         if (ns.length === 1) {

        //         }
        //     }
        // }
        // });
        stack.header.controlsContainer.find('.lm_close') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(async function () {
                //if (confirm('really close this?')) {

                stack.remove();
                stack.contentItems.forEach(async (contentItem: any) => {
                    let doc = await DocServer.GetRefField(contentItem.config.props.documentId);
                    if (doc instanceof Doc) {
                        let recent: Doc | undefined;
                        if (CurrentUserUtils.UserDocument && (recent = await Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc))) {
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
                // var url = Utils.prepend("/doc/" + stack.contentItems[0].tab.contentItem.config.props.documentId);
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
    _mainCont: HTMLDivElement | null = null;
    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;
    @observable private _document: Opt<Doc>;
    @observable private _dataDoc: Opt<Doc>;
    @observable private _isActive: boolean = false;

    get _stack(): any {
        return (this.props as any).glContainer.parent.parent;
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

    /**
     * Adds a document to the presentation view
     **/
    @undoBatch
    @action
    public PinDoc(doc: Doc) {
        //add this new doc to props.Document
        let curPres = Cast(CurrentUserUtils.UserDocument.curPresentation, Doc) as Doc;
        if (curPres) {
            let pinDoc = Docs.Create.PresElementBoxDocument({ backgroundColor: "transparent" });
            Doc.GetProto(pinDoc).presentationTargetDoc = doc;
            Doc.GetProto(pinDoc).title = ComputedField.MakeFunction('(this.presentationTargetDoc instanceof Doc) && this.presentationTargetDoc.title.toString()');
            const data = Cast(curPres.data, listSpec(Doc));
            if (data) {
                data.push(pinDoc);
            } else {
                curPres.data = new List([pinDoc]);
            }
            if (!DocumentManager.Instance.getDocumentView(curPres)) {
                this.addDocTab(curPres, undefined, "onRight");
            }
        }
    }

    componentDidMount() {
        let observer = new _global.ResizeObserver(action((entries: any) => {
            for (let entry of entries) {
                this._panelWidth = entry.contentRect.width;
                this._panelHeight = entry.contentRect.height;
            }
        }));
        observer.observe(this.props.glContainer._element[0]);
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
            !this._isActive && this._document && Doc.UnBrushDoc(this._document); // bcz: bad -- trying to simulate a pointer leave event when a new tab is opened up on top of an existing one.
        }
    }

    get layoutDoc() { return this._document && Doc.Layout(this._document); }
    panelWidth = () => this.layoutDoc && this.layoutDoc.maxWidth ? Math.min(Math.max(NumCast(this.layoutDoc.width), NumCast(this.layoutDoc.nativeWidth)), this._panelWidth) : this._panelWidth;
    panelHeight = () => this._panelHeight;

    nativeWidth = () => !this.layoutDoc!.ignoreAspect && !this.layoutDoc!.fitWidth ? NumCast(this.layoutDoc!.nativeWidth) || this._panelWidth : 0;
    nativeHeight = () => !this.layoutDoc!.ignoreAspect && !this.layoutDoc!.fitWidth ? NumCast(this.layoutDoc!.nativeHeight) || this._panelHeight : 0;

    contentScaling = () => {
        if (this.layoutDoc!.type === DocumentType.PDF) {
            if ((this.layoutDoc && this.layoutDoc.fitWidth) ||
                this._panelHeight / NumCast(this.layoutDoc!.nativeHeight) > this._panelWidth / NumCast(this.layoutDoc!.nativeWidth)) {
                return this._panelWidth / NumCast(this.layoutDoc!.nativeWidth);
            } else {
                return this._panelHeight / NumCast(this.layoutDoc!.nativeHeight);
            }
        }
        const nativeH = this.nativeHeight();
        const nativeW = this.nativeWidth();
        if (!nativeW || !nativeH) return 1;
        let wscale = this.panelWidth() / nativeW;
        return wscale * nativeH > this._panelHeight ? this._panelHeight / nativeH : wscale;
    }

    ScreenToLocalTransform = () => {
        if (this._mainCont && this._mainCont.children) {
            let { scale, translateX, translateY } = Utils.GetScreenTransform(this._mainCont.children[0].firstChild as HTMLElement);
            scale = Utils.GetScreenTransform(this._mainCont).scale;
            return CollectionDockingView.Instance.props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(1 / this.contentScaling() / scale);
        }
        return Transform.Identity();
    }
    get previewPanelCenteringOffset() { return this.nativeWidth() && !this.layoutDoc!.ignoreAspect ? (this._panelWidth - this.nativeWidth() * this.contentScaling()) / 2 : 0; }

    addDocTab = (doc: Doc, dataDoc: Opt<Doc>, location: string) => {
        SelectionManager.DeselectAll();
        if (doc.dockingConfig) {
            MainView.Instance.openWorkspace(doc);
            return true;
        } else if (location === "onRight") {
            return CollectionDockingView.AddRightSplit(doc, dataDoc);
        } else if (location === "close") {
            return CollectionDockingView.CloseRightSplit(doc);
        } else {
            return CollectionDockingView.Instance.AddTab(this._stack, doc, dataDoc);
        }
    }

    @computed get docView() {
        if (!this._document) return (null);
        const document = this._document;
        let resolvedDataDoc = document.layout instanceof Doc ? document : this._dataDoc;
        return <DocumentView key={document[Id]}
            Document={document}
            DataDoc={resolvedDataDoc}
            bringToFront={emptyFunction}
            addDocument={undefined}
            removeDocument={undefined}
            ruleProvider={undefined}
            ContentScaling={this.contentScaling}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight}
            ScreenToLocalTransform={this.ScreenToLocalTransform}
            renderDepth={0}
            parentActive={returnTrue}
            whenActiveChanged={emptyFunction}
            focus={emptyFunction}
            backgroundColor={returnEmptyString}
            addDocTab={this.addDocTab}
            pinToPres={this.PinDoc}
            ContainingCollectionView={undefined}
            ContainingCollectionDoc={undefined}
            zoomToScale={emptyFunction}
            getScale={returnOne} />;
    }

    render() {
        return (!this._isActive || !this.layoutDoc) ? (null) :
            (<div className="collectionDockingView-content" ref={ref => this._mainCont = ref}
                style={{
                    transform: `translate(${this.previewPanelCenteringOffset}px, 0px)`,
                    height: this.layoutDoc && this.layoutDoc.fitWidth ? undefined : "100%"
                }}>
                {this.docView}
            </div >);
    }
}