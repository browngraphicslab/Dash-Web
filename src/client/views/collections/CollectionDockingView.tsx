import * as GoldenLayout from "golden-layout";
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, observable, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import Measure from "react-measure";
import { FieldId, Opt, Field } from "../../../fields/Field";
import { Utils } from "../../../Utils";
import { Server } from "../../Server";
import { undoBatch } from "../../util/UndoManager";
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionDockingView.scss";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";
import React = require("react");
import { SubCollectionViewProps } from "./CollectionViewBase";
import { ServerUtils } from "../../../server/ServerUtil";
import { DragManager } from "../../util/DragManager";
import { TextField } from "../../../fields/TextField";

@observer
export class CollectionDockingView extends React.Component<SubCollectionViewProps> {
    public static Instance: CollectionDockingView;
    public static makeDocumentConfig(document: Document) {
        return {
            type: 'react-component',
            component: 'DocumentFrameRenderer',
            title: document.Title,
            props: {
                documentId: document.Id,
                //collectionDockingView: CollectionDockingView.Instance
            }
        }
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
    public StartOtherDrag(dragDocs: Document[], e: any) {
        dragDocs.map(dragDoc =>
            this.AddRightSplit(dragDoc, true).contentItems[0].tab._dragListener.
                onMouseDown({ pageX: e.pageX, pageY: e.pageY, preventDefault: () => { }, button: 0 }));
    }

    @action
    public OpenFullScreen(document: Document) {
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document)]
        }
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
    public AddRightSplit(document: Document, minimize: boolean = false) {
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document)]
        }

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

            collayout.config["width"] = 50;
            newContentItem.config["width"] = 50;
        }
        if (minimize) {
            newContentItem.config["width"] = 10;
            newContentItem.config["height"] = 10;
        }
        newContentItem.callDownwards('_$init');
        this._goldenLayout.root.callDownwards('setSize', [this._goldenLayout.width, this._goldenLayout.height]);
        this._goldenLayout.emit('stateChanged');
        this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
        this.stateChanged();

        return newContentItem;
    }

    setupGoldenLayout() {
        var config = this.props.Document.GetText(KeyStore.Data, "");
        if (config) {
            if (!this._goldenLayout) {
                this._goldenLayout = new GoldenLayout(JSON.parse(config));
            }
            else {
                if (config == JSON.stringify(this._goldenLayout.toConfig()))
                    return;
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
                () => this.props.Document.GetText(KeyStore.Data, ""),
                () => {
                    if (!this._goldenLayout || this._ignoreStateChange != JSON.stringify(this._goldenLayout.toConfig())) {
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
        this._goldenLayout.destroy();
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
        if ((className == "lm_title" || className == "lm_tab lm_active") && (e.ctrlKey || e.altKey)) {
            e.stopPropagation();
            e.preventDefault();
            let docid = (e.target as any).DashDocId;
            let tab = (e.target as any).parentElement as HTMLElement;
            Server.GetField(docid, action((f: Opt<Field>) => {
                if (f instanceof Document)
                    DragManager.StartDocumentDrag([tab], new DragManager.DocumentDragData([f as Document]),
                        {
                            handlers: {
                                dragComplete: action(() => { }),
                            },
                            hideSource: false
                        })
            }));
        }
        if (className == "lm_drag_handle" || className == "lm_close" || className == "lm_maximise" || className == "lm_minimise" || className == "lm_close_tab") {
            this._flush = true;
        }
        if (this.props.active()) {
            e.stopPropagation();
        }
    }

    @undoBatch
    stateChanged = () => {
        var json = JSON.stringify(this._goldenLayout.toConfig());
        this.props.Document.SetText(KeyStore.Data, json)
    }

    itemDropped = () => {
        this.stateChanged();
    }
    tabCreated = (tab: any) => {
        if (tab.hasOwnProperty("contentItem") && tab.contentItem.config.type != "stack") {
            if (tab.titleElement[0].textContent.indexOf("-waiting") != -1) {
                Server.GetField(tab.contentItem.config.props.documentId, action((f: Opt<Field>) => {
                    if (f != undefined && f instanceof Document) {
                        f.GetTAsync(KeyStore.Title, TextField, (tfield) => {
                            if (tfield != undefined) {
                                tab.titleElement[0].textContent = f.Title;
                            }
                        })
                    }
                }));
                tab.titleElement[0].DashDocId = tab.contentItem.config.props.documentId;
            }
            tab.titleElement[0].DashDocId = tab.contentItem.config.props.documentId;
        }
        tab.closeElement.off('click') //unbind the current click handler
            .click(function () {
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
        trace();
        return (
            <div className="collectiondockingview-container" id="menuContainer"
                onPointerDown={this.onPointerDown} onPointerUp={this.onPointerUp} ref={this._containerRef}
                style={{
                    width: "100%",
                    height: "100%",
                    borderStyle: "solid",
                    borderWidth: `${COLLECTION_BORDER_WIDTH}px`,
                }} />
        );
    }
}

interface DockedFrameProps {
    documentId: FieldId,
    //collectionDockingView: CollectionDockingView
}
@observer
export class DockedFrameRenderer extends React.Component<DockedFrameProps> {

    private _mainCont = React.createRef<HTMLDivElement>();
    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;
    @observable private _document: Opt<Document>;

    constructor(props: any) {
        super(props);
        Server.GetField(this.props.documentId, action((f: Opt<Field>) => this._document = f as Document));
    }

    private _nativeWidth = () => { return this._document!.GetNumber(KeyStore.NativeWidth, this._panelWidth); }
    private _nativeHeight = () => { return this._document!.GetNumber(KeyStore.NativeHeight, this._panelHeight); }
    private _contentScaling = () => { return this._panelWidth / (this._nativeWidth() ? this._nativeWidth() : this._panelWidth); }

    ScreenToLocalTransform = () => {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(this._mainCont.current!);
        return CollectionDockingView.Instance.props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(scale / this._contentScaling())
    }

    render() {
        trace();
        if (!this._document)
            return (null);
        var content =
            <div className="collectionDockingView-content" ref={this._mainCont}>
                <DocumentView key={this._document.Id} Document={this._document}
                    AddDocument={undefined}
                    RemoveDocument={undefined}
                    ContentScaling={this._contentScaling}
                    PanelWidth={this._nativeWidth}
                    PanelHeight={this._nativeHeight}
                    ScreenToLocalTransform={this.ScreenToLocalTransform}
                    isTopMost={true}
                    SelectOnLoad={false}
                    focus={(doc: Document) => { }}
                    ContainingCollectionView={undefined} />
            </div>

        return <Measure onResize={action((r: any) => { this._panelWidth = r.entry.width; this._panelHeight = r.entry.height; })}>
            {({ measureRef }) => <div ref={measureRef}>  {content} </div>}
        </Measure>
    }
}