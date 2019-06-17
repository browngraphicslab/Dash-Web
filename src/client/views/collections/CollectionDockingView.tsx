import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, observable, reaction, Lambda, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import Measure, { ContentRect } from "react-measure";
import * as GoldenLayout from "../../../client/goldenLayout";
import { Doc, Field, Opt, DocListCast } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnTrue, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { DragLinksAsDocuments, DragManager } from "../../util/DragManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import "./CollectionDockingView.scss";
import { SubCollectionViewProps } from "./CollectionSubView";
import React = require("react");
import { ParentDocSelector } from './ParentDocumentSelector';
import { DocumentManager } from '../../util/DocumentManager';
import { Id } from '../../../new_fields/FieldSymbols';
import { DockedFrameRenderer } from './DockedFrameRenderer';

@observer
export class CollectionDockingView extends React.Component<SubCollectionViewProps> {
    public static TopLevel: CollectionDockingView;
    private _goldenLayout: any = null;
    private _containerRef = React.createRef<HTMLDivElement>();
    reactionDisposer?: IReactionDisposer;
    _removedDocs: Doc[] = [];
    private _flush: boolean = false;
    private _ignoreStateChange = "";
    private _isPointerDown = false;
    hack: boolean = false;
    undohack: any = null;

    constructor(props: SubCollectionViewProps) {
        super(props);
        CollectionDockingView.TopLevel = this;
        (window as any).React = React;
        (window as any).ReactDOM = ReactDOM;
    }

    componentDidMount: () => void = () => {
        if (this._containerRef.current) {
            this.reactionDisposer = reaction(
                () => StrCast(this.props.Document.dockingConfig),
                () => {
                    if (!this._goldenLayout || this._ignoreStateChange !== this.retrieveConfiguration()) {
                        // Because this is in a set timeout, if this component unmounts right after mounting,
                        // we will leak a GoldenLayout, because we try to destroy it before we ever create it
                        setTimeout(() => this.setupGoldenLayout(), 1);
                    }
                    this._ignoreStateChange = "";
                }, { fireImmediately: true });

            // window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
        }
    }

    componentWillUnmount: () => void = () => {
        try {
            this._goldenLayout.unbind('itemDropped', this.itemDropped);
            this._goldenLayout.unbind('tabCreated', this.tabCreated);
            this._goldenLayout.unbind('stackCreated', this.stackCreated);
            this._goldenLayout.unbind('tabDestroyed', this.tabDestroyed);
        } catch (e) {
            console.log("Unable to unbind Golden Layout event listener...", e);
        }
        if (this._goldenLayout) this._goldenLayout.destroy();
        this._goldenLayout = null;

        if (this.reactionDisposer) {
            this.reactionDisposer();
        }
    }

    setupGoldenLayout() {
        var config = StrCast(this.props.Document.dockingConfig);
        if (config) {
            if (!this._goldenLayout) {
                this.initializeConfiguration(config);
            }
            else {
                if (config === this.retrieveConfiguration()) {
                    return;
                }
                try {
                    this._goldenLayout.unbind('itemDropped', this.itemDropped);
                    this._goldenLayout.unbind('tabCreated', this.tabCreated);
                    this._goldenLayout.unbind('tabDestroyed', this.tabDestroyed);
                    this._goldenLayout.unbind('stackCreated', this.stackCreated);
                } catch (e) { }
                this._goldenLayout.destroy();
                this.initializeConfiguration(config);
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

    private makeDocConfig = (document: Doc, width?: number) => {
        const config = CollectionDockingView.makeDocumentConfig(document, width);
        (config.props as any).parent = this;
        return config;
    }

    public static makeDocumentConfig(document: Doc, width?: number) {
        return {
            type: 'react-component',
            component: 'DocumentFrameRenderer',
            title: document.title,
            width: width,
            props: {
                documentId: document[Id],
            }
        };
    }

    initializeConfiguration = (configText: string) => {
        let configuration: any = JSON.parse(configText);
        this.injectParentProp(configuration.content);
        this._goldenLayout = new GoldenLayout(configuration);
    }

    retrieveConfiguration = () => {
        let configuration: any = this._goldenLayout.toConfig();
        this.injectParentProp(configuration.content, true);
        return JSON.stringify(configuration);
    }

    injectParentProp = (contentArray: any[], reverse: boolean = false) => {
        if (!contentArray || contentArray.length == 0) return;
        contentArray.forEach(member => {
            let baseCase = Object.keys(member).includes("props");
            if (!baseCase) {
                this.injectParentProp(member.content, reverse)
            } else {
                reverse ? delete member.props.parent : member.props.parent = this;
            }
        });
    }

    public StartOtherDrag(dragDocs: Doc[], e: any) {
        this.hack = true;
        this.undohack = UndoManager.StartBatch("goldenDrag");
        dragDocs.map(dragDoc =>
            CollectionDockingView.AddRightSplit(dragDoc, true).contentItems[0].tab._dragListener.
                onMouseDown({ pageX: e.pageX, pageY: e.pageY, preventDefault: emptyFunction, button: 0 }));
    }

    @action
    public static OpenFullScreen(document: Doc, dockingView: CollectionDockingView = CollectionDockingView.TopLevel) {
        dockingView.openFullScreen(document);
    }

    private openFullScreen = (document: Doc) => {
        let newItemStackConfig = {
            type: 'stack',
            content: [this.makeDocConfig(document)]
        };
        var docconfig = this._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, this._goldenLayout);
        this._goldenLayout.root.contentItems[0].addChild(docconfig);
        docconfig.callDownwards('_$init');
        this._goldenLayout._$maximiseItem(docconfig);
        this._ignoreStateChange = this.retrieveConfiguration();
        this.stateChanged();
    }

    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to that split
    //
    public static AddRightSplit = (document: Doc, minimize: boolean = false, dockingView: CollectionDockingView = CollectionDockingView.TopLevel) => {
        return dockingView.addRightSplit(document, minimize);
    }

    private addRightSplit(document: Doc, minimize = false) {
        let docs = Cast(this.props.Document.data, listSpec(Doc));
        if (docs) {
            docs.push(document);
        }
        let newItemStackConfig = {
            type: 'stack',
            content: [this.makeDocConfig(document)]
        };

        var newContentItem = this._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, this._goldenLayout);

        if (this._goldenLayout.root.contentItems[0].isRow) {
            this._goldenLayout.root.contentItems[0].addChild(newContentItem);
        }
        else {
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

    public static AddTab = (stack: any, document: Doc, dockingView: CollectionDockingView = CollectionDockingView.TopLevel) => {
        dockingView.addTab(stack, document);
    }

    private addTab = (stack: any, document: Doc) => {
        let docs = Cast(this.props.Document.data, listSpec(Doc));
        if (docs) {
            docs.push(document);
        }
        let docContentConfig = this.makeDocConfig(document);
        var newContentItem = stack.layoutManager.createContentItem(docContentConfig, this._goldenLayout);
        stack.addChild(newContentItem.contentItems[0], undefined);
        this.layoutChanged();
    }

    @undoBatch
    @action
    public static CloseRightSplit = (document: Doc, dockingView: CollectionDockingView = CollectionDockingView.TopLevel): boolean => {
        let retVal = false;
        if (dockingView._goldenLayout.root.contentItems[0].isRow) {
            retVal = Array.from(dockingView._goldenLayout.root.contentItems[0].contentItems).some((child: any) => {
                if (child.contentItems.length === 1 && child.contentItems[0].config.component === "DocumentFrameRenderer" &&
                    Doc.AreProtosEqual(DocumentManager.Instance.getDocumentViewById(child.contentItems[0].config.props.documentId)!.Document, document)) {
                    child.contentItems[0].remove();
                    dockingView.layoutChanged(document);
                    return true;
                } else {
                    Array.from(child.contentItems).filter((tab: any) => tab.config.component === "DocumentFrameRenderer").some((tab: any, j: number) => {
                        if (Doc.AreProtosEqual(DocumentManager.Instance.getDocumentViewById(tab.config.props.documentId)!.Document, document)) {
                            child.contentItems[j].remove();
                            child.config.activeItemIndex = Math.max(child.contentItems.length - 1, 0);
                            let docs = Cast(dockingView.props.Document.data, listSpec(Doc));
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
            dockingView.stateChanged();
        }
        return retVal;
    }

    @action
    layoutChanged(removed?: Doc) {
        this._goldenLayout.root.callDownwards('setSize', [this._goldenLayout.width, this._goldenLayout.height]);
        this._goldenLayout.emit('stateChanged');
        this._ignoreStateChange = this.retrieveConfiguration();
        if (removed) CollectionDockingView.TopLevel._removedDocs.push(removed);
        this.stateChanged();
    }

    @action
    onResize = (size: ContentRect) => {
        // bcz: since GoldenLayout isn't a React component itself, we need to notify it to resize when its document container's size has changed
        // this._goldenLayout.updateSize(cur!.getBoundingClientRect().width, cur!.getBoundingClientRect().height);
        if (this._goldenLayout) {
            this._goldenLayout.updateSize(size.offset!.width, size.offset!.height);
        }
    }

    @action
    onPointerUp = (e: React.PointerEvent): void => {
        this._isPointerDown = false;
        if (this._flush) {
            this._flush = false;
            setTimeout(() => this.stateChanged(), 10);
        }
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._isPointerDown = true;
        var className = (e.target as any).className;
        if (className === "messageCounter") {
            e.stopPropagation();
            e.preventDefault();
            let x = e.clientX;
            let y = e.clientY;
            let docid = (e.target as any).DashDocId;
            let tab = (e.target as any).parentElement as HTMLElement;
            DocServer.getRefField(docid).then(action(async (sourceDoc: Opt<Field>) =>
                (sourceDoc instanceof Doc) && DragLinksAsDocuments(tab, x, y, sourceDoc)));
        } else
            if ((className === "lm_title" || className === "lm_tab lm_active") && !e.shiftKey) {
                e.stopPropagation();
                e.preventDefault();
                let x = e.clientX;
                let y = e.clientY;
                let docid = (e.target as any).DashDocId;
                let tab = (e.target as any).parentElement as HTMLElement;
                let glTab = (e.target as any).Tab;
                if (glTab && glTab.contentItem && glTab.contentItem.parent) {
                    glTab.contentItem.parent.setActiveContentItem(glTab.contentItem);
                }
                DocServer.getRefField(docid).then(action((f: Opt<Field>) => {
                    if (f instanceof Doc) {
                        DragManager.StartDocumentDrag([tab], new DragManager.DocumentDragData([f]), x, y,
                            {
                                handlers: {
                                    dragComplete: emptyFunction,
                                },
                                hideSource: false
                            });
                    }
                }));
            }
        if (className === "lm_drag_handle" || className === "lm_close" || className === "lm_maximise" || className === "lm_minimise" || className === "lm_close_tab") {
            this._flush = true;
        }
        if (this.props.active()) {
            e.stopPropagation();
        }
    }

    @undoBatch
    stateChanged = () => {
        let docs = Cast(CollectionDockingView.TopLevel.props.Document.data, listSpec(Doc));
        CollectionDockingView.TopLevel._removedDocs.map(theDoc =>
            docs && docs.indexOf(theDoc) !== -1 &&
            docs.splice(docs.indexOf(theDoc), 1));
        CollectionDockingView.TopLevel._removedDocs.length = 0;
        var json = this.retrieveConfiguration();
        this.props.Document.dockingConfig = json;
        if (this.undohack && !this.hack) {
            this.undohack.end();
            this.undohack = undefined;
        }
        this.hack = false;
    }

    private itemDropped = () => {
        this.stateChanged();
    }

    private htmlToElement(html: string) {
        var template = document.createElement('template');
        html = html.trim(); // Never return a text node of whitespace as the result
        template.innerHTML = html;
        return template.content.firstChild;
    }

    private tabCreated = async (tab: any) => {
        if (tab.hasOwnProperty("contentItem") && tab.contentItem.config.type !== "stack") {
            if (tab.contentItem.config.fixed) {
                tab.contentItem.parent.config.fixed = true;
            }
            DocServer.getRefField(tab.contentItem.config.props.documentId).then(async doc => {
                if (doc instanceof Doc) {
                    let counter: any = this.htmlToElement(`<span class="messageCounter">0</div>`);
                    tab.element.append(counter);
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
                    }
                    tab.header.element[0].ondrop = (e: any) => {
                        console.log("DROPPPP THE BASS!", e);
                    }
                    ReactDOM.render(<ParentDocSelector Document={doc} addDocTab={(doc, location) => CollectionDockingView.AddTab(stack, doc)} />, upDiv);
                    tab.reactComponents = [upDiv];
                    tab.element.append(upDiv);
                    counter.DashDocId = tab.contentItem.config.props.documentId;
                    tab.reactionDisposer = reaction(() => [doc.linkedFromDocs, doc.LinkedToDocs, doc.title],
                        () => {
                            counter.innerHTML = DocListCast(doc.linkedFromDocs).length + DocListCast(doc.linkedToDocs).length;
                            tab.titleElement[0].textContent = doc.title;
                        }, { fireImmediately: true });
                    tab.titleElement[0].DashDocId = tab.contentItem.config.props.documentId;
                }
            });
        }
        tab.titleElement[0].Tab = tab;
        tab.closeElement.off('click') //unbind the current click handler
            .click(async function () {
                if (tab.reactionDisposer) {
                    tab.reactionDisposer();
                }
                let doc = await DocServer.getRefField(tab.contentItem.config.props.documentId);
                if (doc instanceof Doc) {
                    let theDoc = doc;
                    CollectionDockingView.TopLevel._removedDocs.push(theDoc);
                }
                tab.contentItem.remove();
            });
    }

    private tabDestroyed = (tab: any) => {
        if (tab.reactComponents) {
            for (const ele of tab.reactComponents) {
                ReactDOM.unmountComponentAtNode(ele);
            }
        }
    }

    private stackCreated = (stack: any) => {
        //stack.header.controlsContainer.find('.lm_popout').hide();
        stack.header.controlsContainer.find('.lm_close') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(function () {
                //if (confirm('really close this?')) {
                stack.remove();
                stack.contentItems.map(async (contentItem: any) => {
                    let doc = await DocServer.getRefField(contentItem.config.props.documentId);
                    if (doc instanceof Doc) {
                        let theDoc = doc;
                        CollectionDockingView.TopLevel._removedDocs.push(theDoc);
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
        return (
            <Measure onResize={this.onResize} offset>
                {({ measureRef }) => (
                    <div ref={measureRef} style={{ width: "100%", height: "100%" }}>
                        <div className="collectiondockingview-container" id="menuContainer"
                            onPointerDown={this.onPointerDown} onPointerUp={this.onPointerUp} ref={this._containerRef} />
                    </div>
                )}
            </Measure>
        );
    }

}