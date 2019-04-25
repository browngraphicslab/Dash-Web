import * as GoldenLayout from "golden-layout";
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, observable, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import Measure from "react-measure";
import { Utils, returnTrue, emptyFunction, returnOne, returnZero } from "../../../Utils";
import { Server } from "../../Server";
import { undoBatch } from "../../util/UndoManager";
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionDockingView.scss";
import React = require("react");
import { SubCollectionViewProps } from "./CollectionSubView";
import { ServerUtils } from "../../../server/ServerUtil";
import { DragManager, DragLinksAsDocuments } from "../../util/DragManager";
import { Transform } from '../../util/Transform';
import { Doc, Id, Opt, Field, FieldId } from "../../../new_fields/Doc";
import { Cast, NumCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { DocServer } from "../../DocServer";
import { listSpec } from "../../../new_fields/Schema";

@observer
export class CollectionDockingView extends React.Component<SubCollectionViewProps> {
    public static Instance: CollectionDockingView;
    public static makeDocumentConfig(document: Doc) {
        return {
            type: 'react-component',
            component: 'DocumentFrameRenderer',
            title: document.title,
            props: {
                documentId: document[Id],
                //collectionDockingView: CollectionDockingView.Instance
            }
        };
    }

    private _goldenLayout: any = null;
    private _containerRef = React.createRef<HTMLDivElement>();
    private _fullScreen: any = null;
    private _flush: boolean = false;
    private _ignoreStateChange = "";

    constructor(props: SubCollectionViewProps) {
        super(props);
        CollectionDockingView.Instance = this;
        (window as any).React = React;
        (window as any).ReactDOM = ReactDOM;
    }
    public StartOtherDrag(dragDocs: Doc[], e: any) {
        dragDocs.map(dragDoc =>
            this.AddRightSplit(dragDoc, true).contentItems[0].tab._dragListener.
                onMouseDown({ pageX: e.pageX, pageY: e.pageY, preventDefault: emptyFunction, button: 0 }));
    }

    @action
    public OpenFullScreen(document: Doc) {
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document)]
        };
        var docconfig = this._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, this._goldenLayout);
        this._goldenLayout.root.contentItems[0].addChild(docconfig);
        docconfig.callDownwards('_$init');
        this._goldenLayout._$maximiseItem(docconfig);
        this._fullScreen = docconfig;
        this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
        this.stateChanged();
    }
    @action
    public CloseFullScreen() {
        if (this._fullScreen) {
            this._goldenLayout._$minimiseItem(this._fullScreen);
            this._goldenLayout.root.contentItems[0].removeChild(this._fullScreen);
            this._fullScreen = null;
            this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
            this.stateChanged();
        }
    }

    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to that split
    //
    @action
    public AddRightSplit(document: Doc, minimize: boolean = false) {
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document)]
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
            newContentItem.config.width = 10;
            newContentItem.config.height = 10;
        }
        newContentItem.callDownwards('_$init');
        this._goldenLayout.root.callDownwards('setSize', [this._goldenLayout.width, this._goldenLayout.height]);
        this._goldenLayout.emit('stateChanged');
        this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
        this.stateChanged();

        return newContentItem;
    }

    setupGoldenLayout() {
        var config = Cast(this.props.Document.data, "string", "");
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
                    this._goldenLayout.unbind('stackCreated', this.stackCreated);
                } catch (e) { }
                this._goldenLayout.destroy();
                this._goldenLayout = new GoldenLayout(JSON.parse(config));
            }
            this._goldenLayout.on('itemDropped', this.itemDropped);
            this._goldenLayout.on('tabCreated', this.tabCreated);
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
            reaction(
                () => Cast(this.props.Document.data, "string", ""),
                () => {
                    if (!this._goldenLayout || this._ignoreStateChange !== JSON.stringify(this._goldenLayout.toConfig())) {
                        setTimeout(() => this.setupGoldenLayout(), 1);
                    }
                    this._ignoreStateChange = "";
                }, { fireImmediately: true });

            window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
        }
    }
    componentWillUnmount: () => void = () => {
        try {
            this._goldenLayout.unbind('itemDropped', this.itemDropped);
            this._goldenLayout.unbind('tabCreated', this.tabCreated);
            this._goldenLayout.unbind('stackCreated', this.stackCreated);
        } catch (e) {

        }
        if (this._goldenLayout) this._goldenLayout.destroy();
        this._goldenLayout = null;
        window.removeEventListener('resize', this.onResize);
    }
    @action
    onResize = (event: any) => {
        var cur = this._containerRef.current;

        // bcz: since GoldenLayout isn't a React component itself, we need to notify it to resize when its document container's size has changed
        this._goldenLayout.updateSize(cur!.getBoundingClientRect().width, cur!.getBoundingClientRect().height);
    }

    @action
    onPointerUp = (e: React.PointerEvent): void => {
        if (this._flush) {
            this._flush = false;
            setTimeout(() => this.stateChanged(), 10);
        }
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        var className = (e.target as any).className;
        if (className === "messageCounter") {
            e.stopPropagation();
            e.preventDefault();
            let x = e.clientX;
            let y = e.clientY;
            let docid = (e.target as any).DashDocId;
            let tab = (e.target as any).parentElement as HTMLElement;
            Server.GetField(docid, action(async (sourceDoc: Opt<Field>) =>
                (sourceDoc instanceof Doc) && DragLinksAsDocuments(tab, x, y, sourceDoc)));
        } else
            if ((className === "lm_title" || className === "lm_tab lm_active") && !e.shiftKey) {
                e.stopPropagation();
                e.preventDefault();
                let x = e.clientX;
                let y = e.clientY;
                let docid = (e.target as any).DashDocId;
                let tab = (e.target as any).parentElement as HTMLElement;
                Server.GetField(docid, action((f: Opt<Field>) => {
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
        var json = JSON.stringify(this._goldenLayout.toConfig());
        this.props.Document.data = json;
    }

    itemDropped = () => {
        this.stateChanged();
    }

    htmlToElement(html: string) {
        var template = document.createElement('template');
        html = html.trim(); // Never return a text node of whitespace as the result
        template.innerHTML = html;
        return template.content.firstChild;
    }

    tabCreated = (tab: any) => {
        if (tab.hasOwnProperty("contentItem") && tab.contentItem.config.type !== "stack") {
            DocServer.GetRefField(tab.contentItem.config.props.documentId).then(async f => {
                if (f instanceof Doc) {
                    const tfield = await Cast(f.title, "string");
                    if (tfield !== undefined) {
                        tab.titleElement[0].textContent = f.Title;
                    }
                    const lf = await Cast(f.linkedFromDocs, listSpec(Doc));
                    const lt = await Cast(f.linkedToDocs, listSpec(Doc));
                    let count = (lf ? lf.length : 0) + (lt ? lt.length : 0);
                    let counter: any = this.htmlToElement(`<div class="messageCounter">${count}</div>`);
                    tab.element.append(counter);
                    counter.DashDocId = tab.contentItem.config.props.documentId;
                    tab.reactionDisposer = reaction((): [List<Field> | null | undefined, List<Field> | null | undefined] => [lf, lt],
                        ([linkedFrom, linkedTo]) => {
                            let count = (linkedFrom ? linkedFrom.length : 0) + (linkedTo ? linkedTo.length : 0);
                            counter.innerHTML = count;
                        });
                    tab.titleElement[0].DashDocId = tab.contentItem.config.props.documentId;
                }
            });
        }
        tab.closeElement.off('click') //unbind the current click handler
            .click(function () {
                if (tab.reactionDisposer) {
                    tab.reactionDisposer();
                }
                tab.contentItem.remove();
            });
    }

    stackCreated = (stack: any) => {
        //stack.header.controlsContainer.find('.lm_popout').hide();
        stack.header.controlsContainer.find('.lm_close') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(function () {
                //if (confirm('really close this?')) {
                stack.remove();
                //}
            }));
        stack.header.controlsContainer.find('.lm_popout') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(function () {
                var url = ServerUtils.prepend("/doc/" + stack.contentItems[0].tab.contentItem.config.props.documentId);
                let win = window.open(url, stack.contentItems[0].tab.title, "width=300,height=400");
            }));
    }

    render() {
        return (
            <div className="collectiondockingview-container" id="menuContainer"
                onPointerDown={this.onPointerDown} onPointerUp={this.onPointerUp} ref={this._containerRef} />
        );
    }
}

interface DockedFrameProps {
    documentId: FieldId;
    //collectionDockingView: CollectionDockingView
}
@observer
export class DockedFrameRenderer extends React.Component<DockedFrameProps> {

    _mainCont = React.createRef<HTMLDivElement>();
    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;
    @observable private _document: Opt<Doc>;

    constructor(props: any) {
        super(props);
        DocServer.GetRefField(this.props.documentId).then(action((f: Opt<Field>) => this._document = f as Doc));
    }

    nativeWidth = () => NumCast(this._document!.nativeWidth, this._panelWidth);
    nativeHeight = () => NumCast(this._document!.nativeHeight, this._panelHeight);
    contentScaling = () => {
        const nativeH = this.nativeHeight();
        const nativeW = this.nativeWidth();
        let wscale = this._panelWidth / nativeW;
        if (wscale * nativeH > this._panelHeight) {
            return this._panelHeight / nativeH;
        }
        return wscale;
    }

    ScreenToLocalTransform = () => {
        if (this._mainCont.current && this._mainCont.current.children) {
            let { scale, translateX, translateY } = Utils.GetScreenTransform(this._mainCont.current.children[0].firstChild as HTMLElement);
            scale = Utils.GetScreenTransform(this._mainCont.current).scale;
            return CollectionDockingView.Instance.props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(scale / this.contentScaling());
        }
        return Transform.Identity();
    }
    get previewPanelCenteringOffset() { return (this._panelWidth - this.nativeWidth() * this.contentScaling()) / 2; }

    get content() {
        return (
            <div className="collectionDockingView-content" ref={this._mainCont}
                style={{ transform: `translate(${this.previewPanelCenteringOffset}px, 0px)` }}>
                <DocumentView key={this._document![Id]} Document={this._document!}
                    toggleMinimized={emptyFunction}
                    addDocument={undefined}
                    removeDocument={undefined}
                    ContentScaling={this.contentScaling}
                    PanelWidth={this.nativeWidth}
                    PanelHeight={this.nativeHeight}
                    ScreenToLocalTransform={this.ScreenToLocalTransform}
                    isTopMost={true}
                    selectOnLoad={false}
                    parentActive={returnTrue}
                    whenActiveChanged={emptyFunction}
                    focus={emptyFunction}
                    ContainingCollectionView={undefined} />
            </div >);
    }

    render() {
        return !this._document ? (null) :
            <Measure onResize={action((r: any) => { this._panelWidth = r.entry.width; this._panelHeight = r.entry.height; })}>
                {({ measureRef }) => <div ref={measureRef}>  {this.content} </div>}
            </Measure>;
    }
}