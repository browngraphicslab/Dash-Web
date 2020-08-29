import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { clamp, pull } from 'lodash';
import { action, computed, IReactionDisposer, Lambda, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import * as GoldenLayout from "../../../client/goldenLayout";
import { DataSym, Doc, DocListCast, Opt } from "../../../fields/Doc";
import { Id } from '../../../fields/FieldSymbols';
import { InkTool } from '../../../fields/InkField';
import { List } from '../../../fields/List';
import { FieldId } from "../../../fields/RefField";
import { listSpec } from '../../../fields/Schema';
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { TraceMobx } from '../../../fields/util';
import { emptyFunction, emptyPath, returnFalse, returnOne, returnTrue, returnZero, setupMoveUpEvents, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs } from '../../documents/Documents';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager, dropActionType } from "../../util/DragManager";
import { InteractionUtils } from '../../util/InteractionUtils';
import { Scripting } from '../../util/Scripting';
import { SelectionManager } from '../../util/SelectionManager';
import { SnappingManager } from '../../util/SnappingManager';
import { Transform } from '../../util/Transform';
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocumentView } from "../nodes/DocumentView";
import { PresBox } from '../nodes/PresBox';
import "./CollectionDockingView.scss";
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import { CollectionViewType } from './CollectionView';
import { CollectionDockingViewMenu } from './CollectionDockingViewMenu';
import React = require("react");
const _global = (window /* browser */ || global /* node */) as any;

@observer
export class CollectionDockingView extends CollectionSubView(doc => doc) {
    @observable public static Instance: CollectionDockingView;
    public static makeDocumentConfig(document: Doc, panelName?: string, width?: number) {
        return {
            type: 'react-component',
            component: 'DocumentFrameRenderer',
            title: document.title,
            width: width,
            props: {
                documentId: document[Id],
                panelName   // name of tab that can be used to close or replace its contents
            }
        };
    }

    private _reactionDisposer?: IReactionDisposer;
    private _containerRef = React.createRef<HTMLDivElement>();
    private _flush: UndoManager.Batch | undefined;
    private _ignoreStateChange = "";
    public tabMap: Set<any> = new Set();
    public get initialized() { return this._goldenLayout !== null; }
    public get HasFullScreen() { return this._goldenLayout._maximisedItem !== null; }
    @observable private _goldenLayout: any = null;

    constructor(props: SubCollectionViewProps) {
        super(props);
        runInAction(() => CollectionDockingView.Instance = this);
        //Why is this here?
        (window as any).React = React;
        (window as any).ReactDOM = ReactDOM;
        DragManager.StartWindowDrag = this.StartOtherDrag;
    }

    public StartOtherDrag = (e: any, dragDocs: Doc[]) => {
        !this._flush && (this._flush = UndoManager.StartBatch("golden layout drag"));
        const config = dragDocs.length === 1 ? CollectionDockingView.makeDocumentConfig(dragDocs[0]) :
            { type: 'row', content: dragDocs.map((doc, i) => CollectionDockingView.makeDocumentConfig(doc)) };
        const dragSource = this._goldenLayout.createDragSource(document.createElement("div"), config);
        //dragSource._dragListener.on("dragStop", dragSource.destroy);
        dragSource._dragListener.onMouseDown(e);
    }

    @undoBatch
    public CloseFullScreen = () => {
        this._goldenLayout._maximisedItem?.toggleMaximise();
        this.stateChanged();
    }

    @undoBatch
    public static CloseSplit(document: Opt<Doc>, panelName?: string): boolean {
        const tab = Array.from(CollectionDockingView.Instance.tabMap.keys()).find((tab) => panelName ? tab.contentItem.config.props.panelName === panelName : tab.DashDoc === document);
        if (tab) {
            const j = tab.header.parent.contentItems.indexOf(tab.contentItem);
            if (j !== -1) {
                tab.header.parent.contentItems[j].remove();
                return CollectionDockingView.Instance.layoutChanged();
            }
        }

        return false;
    }

    @undoBatch
    public static OpenFullScreen(doc: Doc, libraryPath?: Doc[]) {
        const instance = CollectionDockingView.Instance;
        if (doc._viewType === CollectionViewType.Docking && doc.layoutKey === "layout") {
            return CurrentUserUtils.openDashboard(Doc.UserDoc(), doc);
        }
        const newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(Doc.MakeAlias(doc))]
        };
        const docconfig = instance._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, instance._goldenLayout);
        instance._goldenLayout.root.contentItems[0].addChild(docconfig);
        docconfig.callDownwards('_$init');
        instance._goldenLayout._$maximiseItem(docconfig);
        instance._goldenLayout.emit('stateChanged');
        instance._ignoreStateChange = JSON.stringify(instance._goldenLayout.toConfig());
        instance.stateChanged();
        return true;
    }

    @undoBatch
    public static ReplaceTab(document: Doc, panelName: string, stack: any, addToSplit?: boolean): boolean {
        const instance = CollectionDockingView.Instance;
        if (!instance) return false;
        const newConfig = CollectionDockingView.makeDocumentConfig(document, panelName);
        if (!panelName && stack) {
            const activeContentItemIndex = stack.contentItems.findIndex((item: any) => item.config === stack._activeContentItem.config);
            const newContentItem = stack.layoutManager.createContentItem(newConfig, instance._goldenLayout);
            stack.addChild(newContentItem.contentItems[0], undefined);
            stack.contentItems[activeContentItemIndex].remove();
            return CollectionDockingView.Instance.layoutChanged();
        }
        const tab = Array.from(CollectionDockingView.Instance.tabMap.keys()).find((tab) => tab.contentItem.config.props.panelName === panelName);
        if (tab) {
            tab.header.parent.addChild(newConfig, undefined);
            const j = tab.header.parent.contentItems.indexOf(tab.contentItem);
            !addToSplit && j !== -1 && tab.header.parent.contentItems[j].remove();
            return CollectionDockingView.Instance.layoutChanged();
        }
        return CollectionDockingView.AddSplit(document, panelName, stack, panelName);
    }


    @undoBatch
    public static ToggleSplit(doc: Doc, location: string, stack?: any, panelName?: string) {
        return Array.from(CollectionDockingView.Instance.tabMap.keys()).findIndex((tab) => tab.DashDoc === doc) !== -1 ?
            CollectionDockingView.CloseSplit(doc) : CollectionDockingView.AddSplit(doc, location, stack, panelName);
    }

    //
    //  Creates a split on any side of the docking view based on the passed input pullSide and then adds the Document to the requested side
    //
    @undoBatch
    public static AddSplit(document: Doc, pullSide: string, stack?: any, panelName?: string) {
        const instance = CollectionDockingView.Instance;
        if (!instance) return false;
        const docContentConfig = CollectionDockingView.makeDocumentConfig(document, panelName);

        if (!pullSide && stack) {
            stack.addChild(docContentConfig, undefined);
        } else {
            const newItemStackConfig = { type: 'stack', content: [docContentConfig] };
            const newContentItem = instance._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, instance._goldenLayout);
            if (instance._goldenLayout.root.contentItems.length === 0) { // if no rows / columns
                instance._goldenLayout.root.addChild(newContentItem);
            } else if (instance._goldenLayout.root.contentItems[0].isRow) { // if row
                switch (pullSide) {
                    default:
                    case "right": instance._goldenLayout.root.contentItems[0].addChild(newContentItem); break;
                    case "left": instance._goldenLayout.root.contentItems[0].addChild(newContentItem, 0); break;
                    case "top":
                    case "bottom":
                        // if not going in a row layout, must add already existing content into column
                        const rowlayout = instance._goldenLayout.root.contentItems[0];
                        const newColumn = rowlayout.layoutManager.createContentItem({ type: "column" }, instance._goldenLayout);
                        rowlayout.parent.replaceChild(rowlayout, newColumn);
                        if (pullSide === "top") {
                            newColumn.addChild(rowlayout, undefined, true);
                            newColumn.addChild(newContentItem, 0, true);
                        } else if (pullSide === "bottom") {
                            newColumn.addChild(newContentItem, undefined, true);
                            newColumn.addChild(rowlayout, 0, true);
                        }

                        rowlayout.config.height = 50;
                        newContentItem.config.height = 50;
                }
            } else if (instance._goldenLayout.root.contentItems[0].isColumn) { // if column
                switch (pullSide) {
                    case "top": instance._goldenLayout.root.contentItems[0].addChild(newContentItem, 0); break;
                    case "bottom": instance._goldenLayout.root.contentItems[0].addChild(newContentItem); break;
                    case "left":
                    case "right":
                    default:
                        // if not going in a row layout, must add already existing content into column
                        const collayout = instance._goldenLayout.root.contentItems[0];
                        const newRow = collayout.layoutManager.createContentItem({ type: "row" }, instance._goldenLayout);
                        collayout.parent.replaceChild(collayout, newRow);

                        if (pullSide === "left") {
                            newRow.addChild(collayout, undefined, true);
                            newRow.addChild(newContentItem, 0, true);
                        } else {
                            newRow.addChild(newContentItem, undefined, true);
                            newRow.addChild(collayout, 0, true);
                        }

                        collayout.config.width = 50;
                        newContentItem.config.width = 50;
                }
            }
            newContentItem.callDownwards('_$init');
        }

        return instance.layoutChanged();
    }

    @undoBatch
    @action
    layoutChanged() {
        this._goldenLayout.root.callDownwards('setSize', [this._goldenLayout.width, this._goldenLayout.height]);
        this._goldenLayout.emit('stateChanged');
        this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
        this.stateChanged();
        return true;
    }

    async setupGoldenLayout() {
        const config = StrCast(this.props.Document.dockingConfig);
        if (config) {
            const matches = config.match(/\"documentId\":\"[a-z0-9-]+\"/g);
            const docids = matches?.map(m => m.replace("\"documentId\":\"", "").replace("\"", "")) ?? [];
            await Promise.all(docids.map(id => DocServer.GetRefField(id)));

            if (this._goldenLayout) {
                if (config === JSON.stringify(this._goldenLayout.toConfig())) {
                    return;
                } else {
                    try {
                        this._goldenLayout.unbind('tabCreated', this.tabCreated);
                        this._goldenLayout.unbind('tabDestroyed', this.tabDestroyed);
                        this._goldenLayout.unbind('stackCreated', this.stackCreated);
                    } catch (e) { }
                }
            }
            this.tabMap.clear();
            this._goldenLayout?.destroy();
            runInAction(() => this._goldenLayout = new GoldenLayout(JSON.parse(config)));
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

    componentDidMount: () => void = () => {
        if (this._containerRef.current) {
            new _global.ResizeObserver(this.onResize).observe(this._containerRef.current);
            this._reactionDisposer = reaction(() => StrCast(this.props.Document.dockingConfig),
                config => {
                    if (!this._goldenLayout || this._ignoreStateChange !== config) {
                        this.setupGoldenLayout();
                    }
                    this._ignoreStateChange = "";
                });
            setTimeout(() => this.setupGoldenLayout(), 0);
            window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
        }
    }

    componentWillUnmount: () => void = () => {
        try {
            this._goldenLayout.unbind('stackCreated', this.stackCreated);
            this._goldenLayout.unbind('tabDestroyed', this.tabDestroyed);
        } catch (e) { }
        this._goldenLayout?.destroy();
        window.removeEventListener('resize', this.onResize);

        this._reactionDisposer?.();
    }

    @action
    onResize = (event: any) => {
        const cur = this._containerRef.current;
        // bcz: since GoldenLayout isn't a React component itself, we need to notify it to resize when its document container's size has changed
        cur && this._goldenLayout?.updateSize(cur.getBoundingClientRect().width, cur.getBoundingClientRect().height);
    }

    @action
    onPointerUp = (e: MouseEvent): void => {
        window.removeEventListener("pointerup", this.onPointerUp);
        if (this._flush) {
            setTimeout(() => {
                CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
                this.stateChanged();
                this._flush!.end();
                this._flush = undefined;
            }, 10);
        }
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        window.addEventListener("mouseup", this.onPointerUp);
        if (!(e.target as HTMLElement).closest("*.lm_content") && ((e.target as HTMLElement).closest("*.lm_tab") || (e.target as HTMLElement).closest("*.lm_stack"))) {
            this._flush = UndoManager.StartBatch("golden layout edit");
        }
        if (!e.nativeEvent.cancelBubble && !InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE) && !InteractionUtils.IsType(e, InteractionUtils.PENTYPE) &&
            Doc.GetSelectedTool() !== InkTool.Highlighter && Doc.GetSelectedTool() !== InkTool.Pen) {
            e.stopPropagation();
        }
    }

    public static Copy(doc: Doc) {
        let json = StrCast(doc.dockingConfig);
        const matches = json.match(/\"documentId\":\"[a-z0-9-]+\"/g);
        const docids = matches?.map(m => m.replace("\"documentId\":\"", "").replace("\"", "")) || [];
        const docs = docids.map(id => DocServer.GetCachedRefField(id)).filter(f => f).map(f => f as Doc);
        const newtabs = docs.map(doc => {
            const copy = Doc.MakeAlias(doc);
            json = json.replace(doc[Id], copy[Id]);
            return copy;
        });
        const copy = Docs.Create.DockDocument(newtabs, json, { title: "Snapshot: " + doc.title });
        const docsublists = DocListCast(doc.data);
        const copysublists = DocListCast(copy.data);
        const docother = Cast(docsublists[1], Doc, null);
        const copyother = Cast(copysublists[1], Doc, null);
        const newother = DocListCast(docother.data).map(doc => Doc.MakeAlias(doc));
        Doc.GetProto(copyother).data = new List<Doc>(newother);

        return copy;
    }

    @action
    stateChanged = () => {
        const json = JSON.stringify(this._goldenLayout.toConfig());
        const matches = json.match(/\"documentId\":\"[a-z0-9-]+\"/g);
        const docids = matches?.map(m => m.replace("\"documentId\":\"", "").replace("\"", ""));
        const docs = !docids ? [] : docids.map(id => DocServer.GetCachedRefField(id)).filter(f => f).map(f => f as Doc);

        this.props.Document.dockingConfig = json;
        const sublists = DocListCast(this.props.Document[this.props.fieldKey]);
        const tabs = Cast(sublists[0], Doc, null);
        const other = Cast(sublists[1], Doc, null);
        const tabdocs = DocListCast(tabs.data);
        const otherdocs = DocListCast(other.data);
        Doc.GetProto(tabs).data = new List<Doc>(docs);
        const otherSet = new Set<Doc>();
        otherdocs.filter(doc => !docs.includes(doc)).forEach(doc => otherSet.add(doc));
        tabdocs.filter(doc => !docs.includes(doc)).forEach(doc => otherSet.add(doc));
        Doc.GetProto(other).data = new List<Doc>(Array.from(otherSet.values()));
    }

    tabDestroyed = (tab: any) => {
        this.tabMap.delete(tab);
        Object.values(tab._disposers).forEach((disposer: any) => disposer?.());
        tab.reactComponents?.forEach((ele: any) => ReactDOM.unmountComponentAtNode(ele));
    }
    tabCreated = (tab: any) => {
        tab.contentItem.element[0]?.firstChild?.firstChild?.InitTab?.(tab);  // have to explicitly initialize tabs that reuse contents from previous abs (ie, when dragging a tab around a new tab is created for the old content)
    }

    stackCreated = (stack: any) => {
        stack.header.element.on('mousedown', (e: any) => {
            if (e.target === stack.header.element[0] && e.button === 2) {
                const emptyPane = CurrentUserUtils.EmptyPane;
                emptyPane["dragFactory-count"] = NumCast(emptyPane["dragFactory-count"]) + 1;
                CollectionDockingView.AddSplit(Docs.Create.FreeformDocument([], {
                    _width: this.props.PanelWidth(), _height: this.props.PanelHeight(), title: `Untitled Tab ${NumCast(emptyPane["dragFactory-count"])}`
                }), "", stack);
            }
        });

        stack.header.controlsContainer.find('.lm_close') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(() => {
                //if (confirm('really close this?')) {
                stack.remove();
                stack.contentItems.forEach((contentItem: any) => Doc.AddDocToList(CurrentUserUtils.MyRecentlyClosed, "data", contentItem.tab.DashDoc, undefined, true, true));
            }));
        stack.header.controlsContainer.find('.lm_popout') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(() => {
                // stack.config.fixed = !stack.config.fixed;  // force the stack to have a fixed size
                const emptyPane = CurrentUserUtils.EmptyPane;
                emptyPane["dragFactory-count"] = NumCast(emptyPane["dragFactory-count"]) + 1;
                CollectionDockingView.AddSplit(Docs.Create.FreeformDocument([], {
                    _width: this.props.PanelWidth(), _height: this.props.PanelHeight(), title: `Untitled Tab ${NumCast(emptyPane["dragFactory-count"])}`
                }), "", stack);
            }));
    }

    render() {
        return <div className="collectiondockingview-container" onPointerDown={this.onPointerDown} ref={this._containerRef}>
            {this.props.renderDepth > 0 ? "Nested dashboards can't be rendered" : (null)}
        </div>;
    }
}

interface DockedFrameProps {
    documentId: FieldId;
    glContainer: any;
}
@observer
export class DockedFrameRenderer extends React.Component<DockedFrameProps> {
    _mainCont: HTMLDivElement | null = null;
    _tabReaction: IReactionDisposer | undefined;
    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;
    @observable private _isActive: boolean = false;
    @observable private _document: Doc | undefined;
    @observable private _view: DocumentView | undefined;

    get stack(): any { return (this.props as any).glContainer.parent.parent; }
    get tab() { return (this.props as any).glContainer.tab; }
    get view() { return this._view; }

    @action
    init = (tab: any, doc: Opt<Doc>) => {
        if (tab.DashDoc !== doc && doc && tab.hasOwnProperty("contentItem") && tab.contentItem.config.type !== "stack") {
            tab._disposers = {} as { [name: string]: IReactionDisposer };
            tab.contentItem.config.fixed && (tab.contentItem.parent.config.fixed = true);
            tab.DashDoc = doc;

            CollectionDockingView.Instance.tabMap.add(tab);
            tab.titleElement[0].onclick = (e: any) => {
                if (Date.now() - tab.titleElement[0].lastClick < 1000) tab.titleElement[0].select();
                tab.titleElement[0].lastClick = Date.now();
                tab.titleElement[0].focus();
            };
            tab.titleElement[0].onchange = (e: any) => {
                tab.titleElement[0].size = e.currentTarget.value.length + 1;
                Doc.GetProto(doc).title = e.currentTarget.value;
            };
            tab.titleElement[0].size = StrCast(doc.title).length + 1;
            tab.titleElement[0].value = doc.title;
            tab.titleElement[0].style["max-width"] = "100px";
            const gearSpan = document.createElement("span");
            gearSpan.className = "collectionDockingView-gear";
            gearSpan.style.position = "relative";
            gearSpan.style.paddingLeft = "0px";
            gearSpan.style.paddingRight = "12px";
            const stack = tab.contentItem.parent;
            tab.element[0].onpointerdown = (e: any) => {
                e.target.className !== "lm_close_tab" && this.view && SelectionManager.SelectDoc(this.view, false);
            };
            // shifts the focus to this tab when another tab is dragged over it
            tab.element[0].onmouseenter = (e: MouseEvent) => {
                if (SnappingManager.GetIsDragging() && tab.contentItem !== tab.header.parent.getActiveContentItem()) {
                    tab.header.parent.setActiveContentItem(tab.contentItem);
                }
                tab.setActive(true);
            };
            const onDown = (e: React.PointerEvent) => {
                setupMoveUpEvents(this, e, (e) => {
                    !e.defaultPrevented && DragManager.StartDocumentDrag([gearSpan], new DragManager.DocumentDragData([doc], doc.dropAction as dropActionType), e.clientX, e.clientY);
                    return !e.defaultPrevented;
                }, returnFalse, emptyFunction);
            };

            tab._disposers.selectionDisposer = reaction(() => SelectionManager.SelectedDocuments().some(v => v.props.Document === doc),
                (selected) => {
                    selected && tab.contentItem !== tab.header.parent.getActiveContentItem() && tab.header.parent.setActiveContentItem(tab.contentItem);
                }
            );
            tab._disposers.buttonDisposer = reaction(() => this.view,
                (view) => {
                    if (view) {
                        ReactDOM.render(<span title="Drag as document" className="collectionDockingView-dragAsDocument" onPointerDown={onDown} >
                            <CollectionDockingViewMenu views={() => [view]} Stack={stack} />
                        </span>,
                            gearSpan);
                        tab._disposers.buttonDisposer?.();
                    }
                }, { fireImmediately: true });

            tab.reactComponents = [gearSpan];
            tab.element.append(gearSpan);
            tab._disposers.reactionDisposer = reaction(() => ({ title: doc.title, degree: Doc.IsBrushedDegree(doc) }), ({ title, degree }) => {
                tab.titleElement[0].value = title;
                tab.titleElement[0].style.padding = degree ? 0 : 2;
                tab.titleElement[0].style.border = `${["gray", "gray", "gray"][degree]} ${["none", "dashed", "solid"][degree]} 2px`;
            }, { fireImmediately: true });
            tab.closeElement.off('click') //unbind the current click handler
                .click(function () {
                    Object.values(tab._disposers).forEach((disposer: any) => disposer?.());
                    Doc.AddDocToList(CurrentUserUtils.MyRecentlyClosed, "data", doc, undefined, true, true);
                    SelectionManager.DeselectAll();
                    tab.contentItem.remove();
                });
        }
    }
    /**
     * Adds a document to the presentation view
     **/
    @undoBatch
    @action
    public static PinDoc(doc: Doc, unpin = false) {
        if (unpin) DockedFrameRenderer.UnpinDoc(doc);
        else {
            //add this new doc to props.Document
            const curPres = CurrentUserUtils.ActivePresentation;
            if (curPres) {
                const pinDoc = Doc.MakeAlias(doc);
                pinDoc.presentationTargetDoc = doc;
                pinDoc.presZoomButton = true;
                pinDoc.context = curPres;
                Doc.AddDocToList(curPres, "data", pinDoc);
                if (curPres.expandBoolean) pinDoc.presExpandInlineButton = true;
                if (!DocumentManager.Instance.getDocumentView(curPres)) {
                    CollectionDockingView.AddSplit(curPres, "right");
                }
                DocumentManager.Instance.jumpToDocument(doc, false, undefined, Cast(doc.context, Doc, null));
            }
        }
    }
    /**
     * Adds a document to the presentation view
     **/
    @undoBatch
    @action
    public static UnpinDoc(doc: Doc) {
        //add this new doc to props.Document
        const curPres = CurrentUserUtils.ActivePresentation;
        if (curPres) {
            const ind = DocListCast(curPres.data).findIndex((val) => Doc.AreProtosEqual(val, doc));
            ind !== -1 && Doc.RemoveDocFromList(curPres, "data", DocListCast(curPres.data)[ind]);
        }
    }

    componentDidMount() {
        const color = () => StrCast(this._document?._backgroundColor, this._document && CollectionDockingView.Instance?.props.backgroundColor?.(this._document, 0) || "white");
        const selected = () => SelectionManager.SelectedDocuments().some(v => v.props.Document === this._document);
        const updateTabColor = () => this.tab?.titleElement[0] && (this.tab.titleElement[0].style.backgroundColor = selected() ? color() : "");
        const observer = new _global.ResizeObserver(action((entries: any) => {
            for (const entry of entries) {
                this._panelWidth = entry.contentRect.width;
                this._panelHeight = entry.contentRect.height;
            }
            updateTabColor();
        }));
        observer.observe(this.props.glContainer._element[0]);
        this.props.glContainer.layoutManager.on("activeContentItemChanged", this.onActiveContentItemChanged);
        this.props.glContainer.tab?.isActive && this.onActiveContentItemChanged();
        this._tabReaction = reaction(() => ({ views: SelectionManager.SelectedDocuments(), color: color() }), updateTabColor, { fireImmediately: true });
    }

    componentWillUnmount() {
        this._tabReaction?.();
        this.props.glContainer.layoutManager.off("activeContentItemChanged", this.onActiveContentItemChanged);
    }

    @action.bound
    private onActiveContentItemChanged() {
        if (this.props.glContainer.tab && this._isActive !== this.props.glContainer.tab.isActive) {
            this._isActive = this.props.glContainer.tab.isActive;
            this._isActive && setTimeout(() => this.view && SelectionManager.SelectDoc(this.view, false), 0);
            (CollectionDockingView.Instance as any)._goldenLayout.isInitialised && CollectionDockingView.Instance.stateChanged();
            !this._isActive && this._document && Doc.UnBrushDoc(this._document); // bcz: bad -- trying to simulate a pointer leave event when a new tab is opened up on top of an existing one.
        }
    }

    get layoutDoc() { return this._document && Doc.Layout(this._document); }
    nativeAspect = () => this.nativeWidth() ? this.nativeWidth() / this.nativeHeight() : 0;
    panelWidth = () => this.layoutDoc?.maxWidth ? Math.min(Math.max(NumCast(this.layoutDoc._width), NumCast(this.layoutDoc._nativeWidth)), this._panelWidth) :
        (this.nativeAspect() && this.nativeAspect() < this._panelWidth / this._panelHeight ? this._panelHeight * this.nativeAspect() : this._panelWidth)
    panelHeight = () => this.nativeAspect() && this.nativeAspect() > this._panelWidth / this._panelHeight ? this._panelWidth / this.nativeAspect() : this._panelHeight;
    nativeWidth = () => !this.layoutDoc?._fitWidth ? NumCast(this.layoutDoc?._nativeWidth) || this._panelWidth : 0;
    nativeHeight = () => !this.layoutDoc?._fitWidth ? NumCast(this.layoutDoc?._nativeHeight) || this._panelHeight : 0;

    contentScaling = () => {
        const nativeH = this.nativeHeight();
        const nativeW = this.nativeWidth();
        let scaling = 1;
        if (!this.layoutDoc?._fitWidth && (!nativeW || !nativeH)) {
            scaling = 1;
        } else if (NumCast(this.layoutDoc?._nativeWidth) && ((this.layoutDoc?._fitWidth) ||
            this._panelHeight / NumCast(this.layoutDoc?._nativeHeight) > this._panelWidth / NumCast(this.layoutDoc?._nativeWidth))) {
            scaling = this._panelWidth / NumCast(this.layoutDoc?._nativeWidth);
        } else if (nativeW && nativeH) {
            const wscale = this.panelWidth() / nativeW;
            scaling = wscale * nativeH > this._panelHeight ? this._panelHeight / nativeH : wscale;
        }
        return scaling;
    }

    ScreenToLocalTransform = () => {
        if (this._mainCont && this._mainCont.children) {
            const { translateX, translateY } = Utils.GetScreenTransform(this._mainCont.children[0].firstChild as HTMLElement);
            const scale = Utils.GetScreenTransform(this._mainCont).scale;
            return CollectionDockingView.Instance?.props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(1 / this.contentScaling() / scale);
        }
        return Transform.Identity();
    }
    get previewPanelCenteringOffset() { return this.nativeWidth() ? (this._panelWidth - this.nativeWidth() * this.contentScaling()) / 2 : 0; }
    get widthpercent() { return this.nativeWidth() ? `${(this.nativeWidth() * this.contentScaling()) / this._panelWidth * 100}% ` : undefined; }

    // adds a tab to the layout based on the locaiton parameter which can be:
    //  close[:{left,right,top,bottom}]  - e.g., "close" will close the tab, "close:left" will close the left tab, 
    //  add[:{left,right,top,bottom}] - e.g., "add" will add a tab to the current stack, "add:right" will add a tab on the right
    //  replace[:{left,right,top,bottom,<any string>}] - e.g., "replace" will replace the current stack contents, 
    //                                  "replace:right" - will replace the stack on the right named "right" if it exists, or create a stack on the right with that name, 
    //                                   "replace:monkeys" - will replace any tab that has the label 'monkeys', or a tab with that label will be created by default on the right
    //  inPlace - will add the document to any collection along the path from the document to the docking view that has a field isInPlaceContainer. if none is found, inPlace adds a tab to current stack
    addDocTab = (doc: Doc, location: string, libraryPath?: Doc[]) => {
        SelectionManager.DeselectAll();
        if (doc._viewType === CollectionViewType.Docking) return CurrentUserUtils.openDashboard(Doc.UserDoc(), doc);
        const locationFields = location.split(":");
        const locationParams = locationFields.length > 1 ? locationFields[1] : "";
        switch (locationFields[0]) {
            case "close": return CollectionDockingView.CloseSplit(doc, locationParams);
            case "fullScreen": return CollectionDockingView.OpenFullScreen(doc);
            case "replace": return CollectionDockingView.ReplaceTab(doc, locationParams, this.stack);
            case "inPlace":
            case "add":
            default: return CollectionDockingView.ToggleSplit(doc, locationParams, this.stack);
        }
    }

    @computed get renderContentBounds() {
        const bounds = this._document ? Cast(this._document._renderContentBounds, listSpec("number"), [0, 0, this.returnMiniSize(), this.returnMiniSize()]) : [0, 0, 0, 0];
        const xbounds = bounds[2] - bounds[0];
        const ybounds = bounds[3] - bounds[1];
        const dim = Math.max(xbounds, ybounds);
        return { l: bounds[0] + xbounds / 2 - dim / 2, t: bounds[1] + ybounds / 2 - dim / 2, cx: bounds[0] + xbounds / 2, cy: bounds[1] + ybounds / 2, dim };
    }
    @computed get miniLeft() { return 50 + (NumCast(this._document?._panX) - this.renderContentBounds.cx) / this.renderContentBounds.dim * 100 - this.miniWidth / 2; }
    @computed get miniTop() { return 50 + (NumCast(this._document?._panY) - this.renderContentBounds.cy) / this.renderContentBounds.dim * 100 - this.miniHeight / 2; }
    @computed get miniWidth() { return this.panelWidth() / NumCast(this._document?._viewScale, 1) / this.renderContentBounds.dim * 100; }
    @computed get miniHeight() { return this.panelHeight() / NumCast(this._document?._viewScale, 1) / this.renderContentBounds.dim * 100; }
    childLayoutTemplate = () => Cast(this._document?.childLayoutTemplate, Doc, null);
    returnMiniSize = () => NumCast(this._document?._miniMapSize, 150);
    miniDown = (e: React.PointerEvent) => {
        this._document && setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            this._document!._panX = clamp(NumCast(this._document!._panX) + delta[0] / this.returnMiniSize() * this.renderContentBounds.dim, this.renderContentBounds.l, this.renderContentBounds.l + this.renderContentBounds.dim);
            this._document!._panY = clamp(NumCast(this._document!._panY) + delta[1] / this.returnMiniSize() * this.renderContentBounds.dim, this.renderContentBounds.t, this.renderContentBounds.t + this.renderContentBounds.dim);
            return false;
        }), emptyFunction, emptyFunction);
    }
    getCurrentFrame = (): number => {
        const presTargetDoc = Cast(PresBox.Instance.childDocs[PresBox.Instance.itemIndex].presentationTargetDoc, Doc, null);
        return Cast(presTargetDoc._currentFrame, "number", null);
    }

    renderMiniMap() {
        return <div className="miniMap" style={{
            width: this.returnMiniSize(), height: this.returnMiniSize(), background: StrCast(this._document!._backgroundColor,
                StrCast(this._document!.backgroundColor, CollectionDockingView.Instance.props.backgroundColor?.(this._document!, 0))),
        }}>
            <CollectionFreeFormView
                Document={this._document!}
                LibraryPath={emptyPath}
                CollectionView={undefined}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                ChildLayoutTemplate={this.childLayoutTemplate} // bcz: Ugh .. should probably be rendering a CollectionView or the minimap should be part of the collectionFreeFormView to avoid havin to set stuff like this.
                noOverlay={true} // don't render overlay Docs since they won't scale
                active={returnTrue}
                select={emptyFunction}
                dropAction={undefined}
                isSelected={returnFalse}
                dontRegisterView={true}
                annotationsKey={""}
                fieldKey={Doc.LayoutFieldKey(this._document!)}
                bringToFront={emptyFunction}
                rootSelected={returnTrue}
                addDocument={returnFalse}
                moveDocument={returnFalse}
                removeDocument={returnFalse}
                ContentScaling={returnOne}
                PanelWidth={this.returnMiniSize}
                PanelHeight={this.returnMiniSize}
                NativeHeight={returnZero}
                NativeWidth={returnZero}
                ScreenToLocalTransform={this.ScreenToLocalTransform}
                renderDepth={0}
                whenActiveChanged={emptyFunction}
                focus={emptyFunction}
                backgroundColor={CollectionDockingView.Instance.props.backgroundColor}
                addDocTab={this.addDocTab}
                pinToPres={DockedFrameRenderer.PinDoc}
                docFilters={CollectionDockingView.Instance.docFilters}
                searchFilterDocs={CollectionDockingView.Instance.searchFilterDocs}
                fitToBox={true}
            />
            <div className="miniOverlay" onPointerDown={this.miniDown} >
                <div className="miniThumb" style={{
                    width: `${this.miniWidth}% `,
                    height: `${this.miniHeight}% `,
                    left: `${this.miniLeft}% `,
                    top: `${this.miniTop}% `,
                }}
                />
            </div>
        </div>;
    }
    setView = action((view: DocumentView) => this._view = view);
    @computed get docView() {
        TraceMobx();
        return !this._document ? (null) :
            <><DocumentView key={this._document[Id]}
                LibraryPath={emptyPath}
                Document={this._document}
                getView={this.setView}
                DataDoc={!Doc.AreProtosEqual(this._document[DataSym], this._document) ? this._document[DataSym] : undefined}
                bringToFront={emptyFunction}
                rootSelected={returnTrue}
                addDocument={undefined}
                removeDocument={undefined}
                ContentScaling={this.contentScaling}
                PanelWidth={this.panelWidth}
                PanelHeight={this.panelHeight}
                NativeHeight={this.nativeHeight}
                NativeWidth={this.nativeWidth}
                ScreenToLocalTransform={this.ScreenToLocalTransform}
                renderDepth={0}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                focus={emptyFunction}
                backgroundColor={CollectionDockingView.Instance.props.backgroundColor}
                addDocTab={this.addDocTab}
                pinToPres={DockedFrameRenderer.PinDoc}
                docFilters={CollectionDockingView.Instance.docFilters}
                searchFilterDocs={CollectionDockingView.Instance.searchFilterDocs}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined} />
                {this._document._viewType === CollectionViewType.Freeform && !this._document?.hideMinimap ? this.renderMiniMap() : (null)}
            </>;
    }

    render() {
        return !this._isActive ? (null) :
            (<div className="collectionDockingView-content" ref={ref => {
                if (this._mainCont = ref) {
                    (this._mainCont as any).InitTab = (tab: any) => this.init(tab, this._document);
                    DocServer.GetRefField(this.tab.contentItem.config.props.documentId).then(action(doc => doc instanceof Doc && (this._document = doc) && this.init(this.tab, this._document)));
                }
            }}
                style={{
                    transform: `translate(${this.previewPanelCenteringOffset}px, 0px)`,
                    height: this.layoutDoc?._fitWidth ? undefined : "100%",
                    width: this.widthpercent
                }}>
                {this.docView}
            </div >);
    }
}
Scripting.addGlobal(function openOnRight(doc: any) { CollectionDockingView.AddSplit(doc, "right"); },
    "opens up the inputted document on the right side of the screen", "(doc: any)");
Scripting.addGlobal(function useRightSplit(doc: any, shiftKey?: boolean) { CollectionDockingView.ReplaceTab(doc, "right", undefined, shiftKey); });
