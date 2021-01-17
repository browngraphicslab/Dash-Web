import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import * as GoldenLayout from "../../../client/goldenLayout";
import { Doc, DocListCast, Opt, DocListCastAsync } from "../../../fields/Doc";
import { Id } from '../../../fields/FieldSymbols';
import { InkTool } from '../../../fields/InkField';
import { List } from '../../../fields/List';
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { DocServer } from "../../DocServer";
import { Docs } from '../../documents/Documents';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { DragManager } from "../../util/DragManager";
import { InteractionUtils } from '../../util/InteractionUtils';
import { Scripting } from '../../util/Scripting';
import { undoBatch, UndoManager } from "../../util/UndoManager";
import "./CollectionDockingView.scss";
import { CollectionSubView, SubCollectionViewProps } from "./CollectionSubView";
import { CollectionViewType } from './CollectionView';
import { TabDocView } from './TabDocView';
import React = require("react");
import { stat } from 'fs';
import { DocumentType } from '../../documents/DocumentTypes';
import { listSpec } from '../../../fields/Schema';
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
    public static OpenFullScreen(doc: Doc) {
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
    @action
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
    @action
    public static AddSplit(document: Doc, pullSide: string, stack?: any, panelName?: string) {
        if (document.type === DocumentType.PRES) {
            const docs = Cast(Cast(Doc.UserDoc().myOverlayDocs, Doc, null).data, listSpec(Doc), []);
            if (docs.includes(document)) {
                docs.splice(docs.indexOf(document), 1);
            }
        }
        if (document._viewType === CollectionViewType.Docking) return CurrentUserUtils.openDashboard(Doc.UserDoc(), document);

        const tab = Array.from(CollectionDockingView.Instance.tabMap).find(tab => tab.DashDoc === document);
        if (tab) {
            tab.header.parent.setActiveContentItem(tab.contentItem);
            return true;
        }
        const instance = CollectionDockingView.Instance;
        if (!instance) return false;
        const docContentConfig = CollectionDockingView.makeDocumentConfig(document, panelName);

        if (!pullSide && stack) {
            stack.addChild(docContentConfig, undefined);
            stack.setActiveContentItem(stack.contentItems[stack.contentItems.length - 1]);
        } else {
            const newItemStackConfig = { type: 'stack', content: [docContentConfig] };
            const newContentItem = instance._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, instance._goldenLayout);
            if (instance._goldenLayout.root.contentItems.length === 0) { // if no rows / columns
                instance._goldenLayout.root.addChild(newContentItem);
            } else if (instance._goldenLayout.root.contentItems[0].isStack) {
                instance._goldenLayout.root.contentItems[0].addChild(docContentConfig);
            } else if (
                instance._goldenLayout.root.contentItems.length === 1 &&
                instance._goldenLayout.root.contentItems[0].contentItems.length === 1 &&
                instance._goldenLayout.root.contentItems[0].contentItems[0].contentItems.length === 0) {
                instance._goldenLayout.root.contentItems[0].contentItems[0].addChild(docContentConfig);
            }
            else if (instance._goldenLayout.root.contentItems[0].isRow) { // if row
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
            } else {// if (instance._goldenLayout.root.contentItems[0].isColumn) { // if column
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
            instance._ignoreStateChange = JSON.stringify(instance._goldenLayout.toConfig());
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
            this._goldenLayout.registerComponent('DocumentFrameRenderer', TabDocView);
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
                    if (!this._goldenLayout || this._ignoreStateChange !== config) {  //  bcz: TODO! really need to diff config with ignoreStateChange and modify the current goldenLayout instead of building a new one.
                        this.setupGoldenLayout();
                    }
                    this._ignoreStateChange = "";
                });
            setTimeout(() => this.setupGoldenLayout(), 0);
            //window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
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
                this._flush?.end();
                this._flush = undefined;
            }, 10);
        }
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        let hitFlyout = false;
        for (let par = e.target as any; !hitFlyout && par; par = par.parentElement) {
            hitFlyout = (par.className === "dockingViewButtonSelector");
        }
        if (!hitFlyout) {
            window.addEventListener("mouseup", this.onPointerUp);
            if (!(e.target as HTMLElement).closest("*.lm_content") && ((e.target as HTMLElement).closest("*.lm_tab") || (e.target as HTMLElement).closest("*.lm_stack"))) {
                this._flush = UndoManager.StartBatch("golden layout edit");
            }
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
        setTimeout(async () => {
            const sublists = DocListCast(this.props.Document[this.props.fieldKey]);
            const tabs = Cast(sublists[0], Doc, null);
            const other = Cast(sublists[1], Doc, null);
            const tabdocs = await DocListCastAsync(tabs.data);
            const otherdocs = await DocListCastAsync(other.data);
            Doc.GetProto(tabs).data = new List<Doc>(docs);
            const otherSet = new Set<Doc>();
            otherdocs?.filter(doc => !docs.includes(doc)).forEach(doc => otherSet.add(doc));
            tabdocs?.filter(doc => !docs.includes(doc)).forEach(doc => otherSet.add(doc));
            Doc.GetProto(other).data = new List<Doc>(Array.from(otherSet.values()));
        }, 0);
    }

    tabDestroyed = (tab: any) => {
        this.tabMap.delete(tab);
        tab._disposers && Object.values(tab._disposers).forEach((disposer: any) => disposer?.());
        tab.reactComponents?.forEach((ele: any) => ReactDOM.unmountComponentAtNode(ele));
    }
    tabCreated = (tab: any) => {
        tab.contentItem.element[0]?.firstChild?.firstChild?.InitTab?.(tab);  // have to explicitly initialize tabs that reuse contents from previous abs (ie, when dragging a tab around a new tab is created for the old content)
    }

    stackCreated = (stack: any) => {
        stack.header?.element.on('mousedown', (e: any) => {
            if (e.target === stack.header?.element[0] && e.button === 2) {
                const emptyPane = CurrentUserUtils.EmptyPane;
                emptyPane["dragFactory-count"] = NumCast(emptyPane["dragFactory-count"]) + 1;
                CollectionDockingView.AddSplit(Docs.Create.FreeformDocument([], {
                    _width: this.props.PanelWidth(), _height: this.props.PanelHeight(), title: `Untitled Tab ${NumCast(emptyPane["dragFactory-count"])}`
                }), "", stack);
            }
        });

        stack.header?.controlsContainer.find('.lm_close') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(() => {
                //if (confirm('really close this?')) {
                if (!stack.parent.parent.isRoot || stack.parent.contentItems.length > 1) {
                    stack.remove();
                    stack.contentItems.forEach((contentItem: any) => Doc.AddDocToList(CurrentUserUtils.MyRecentlyClosed, "data", contentItem.tab.DashDoc, undefined, true, true));
                } else {
                    alert('cant delete the last stack');
                }
            }));
        stack.header?.controlsContainer.find('.lm_popout') //get the close icon
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

Scripting.addGlobal(function openOnRight(doc: any) { CollectionDockingView.AddSplit(doc, "right"); },
    "opens up the inputted document on the right side of the screen", "(doc: any)");
Scripting.addGlobal(function useRightSplit(doc: any, shiftKey?: boolean) { CollectionDockingView.ReplaceTab(doc, "right", undefined, shiftKey); });
