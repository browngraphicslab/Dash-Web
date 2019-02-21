import * as GoldenLayout from "golden-layout";
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, computed, observable, reaction, trace, untracked } from "mobx";
import { DragManager } from "../../util/DragManager";
import { DocumentView } from "../nodes/DocumentView";
import { Document } from "../../../fields/Document";
import "./CollectionDockingView.scss";
import { CollectionViewBase, COLLECTION_BORDER_WIDTH, CollectionViewProps } from "./CollectionViewBase";
import React = require("react");
import * as ReactDOM from 'react-dom';
import Measure from "react-measure";
import { Utils } from "../../../Utils";
import { FieldId, FieldWaiting, Field } from "../../../fields/Field";
import { Server } from "../../Server";
import { observer } from "mobx-react";
import { ListField } from "../../../fields/ListField";
import { KeyStore } from "../../../fields/KeyStore";
import { Opt } from "../../../fields/Field";

@observer
export class CollectionDockingView extends CollectionViewBase {
    public static ID = Utils.GenerateGuid();
    public static Instance: CollectionDockingView;
    public static LayoutString() { return CollectionViewBase.LayoutString("CollectionDockingView"); }
    public static makeDocumentConfig(document: Document) {
        return {
            type: 'react-component',
            component: 'DocumentFrameRenderer',
            title: document.Title,
            props: {
                documentId: document.Id
            }
        }
    }

    private _goldenLayout: any = null;
    private _dragDiv: any = null;
    private _dragParent: HTMLElement | null = null;
    private _dragElement: HTMLDivElement | undefined;
    private _dragFakeElement: HTMLDivElement | undefined;
    private _containerRef = React.createRef<HTMLDivElement>();
    private _fullScreen: any = null;

    constructor(props: CollectionViewProps) {
        super(props);
        CollectionDockingView.Instance = this;
        (window as any).React = React;
        (window as any).ReactDOM = ReactDOM;
    }

    public StartOtherDrag(dragElement: HTMLDivElement, dragDoc: Document) {
        this._dragElement = dragElement;
        this._dragParent = dragElement.parentElement;
        // bcz: we want to copy this document into the header, not move it there.
        //   However, GoldenLayout is setup to move things, so we have to do some kludgy stuff:

        //   - create a temporary invisible div and register that as a DragSource with GoldenLayout
        this._dragDiv = document.createElement("div");
        this._dragDiv.style.opacity = 0;
        DragManager.Root().appendChild(this._dragDiv);
        this._goldenLayout.createDragSource(this._dragDiv, CollectionDockingView.makeDocumentConfig(dragDoc));

        //   - add our document to that div so that GoldenLayout will get the move events its listening for
        this._dragDiv.appendChild(this._dragElement);

        //   - add a duplicate of our document to the original document's container 
        //     (GoldenLayout will be removing our original one)
        this._dragFakeElement = dragElement.cloneNode(true) as HTMLDivElement;
        this._dragParent!.appendChild(this._dragFakeElement);

        // all of this must be undone when the document has been dropped (see tabCreated)
    }

    @action
    public OpenFullScreen(document: Document) {
        console.log("OPEN FULL");
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document)]
        }
        var docconfig = this._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, this._goldenLayout);
        this._goldenLayout.root.contentItems[0].addChild(docconfig);
        docconfig.callDownwards('_$init');
        this._goldenLayout._$maximiseItem(docconfig);
        this._fullScreen = docconfig;
    }
    @action
    public CloseFullScreen() {
        if (this._fullScreen) {
            this._goldenLayout._$minimiseItem(this._fullScreen);
            this._goldenLayout.root.contentItems[0].removeChild(this._fullScreen);
            this._fullScreen = null;
        }
    }

    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to that split
    //
    @action
    public AddRightSplit(document: Document) {
        console.log("ADD RIGHT");
        this._goldenLayout.emit('stateChanged');
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
        newContentItem.callDownwards('_$init');
        this._goldenLayout.root.callDownwards('setSize', [this._goldenLayout.width, this._goldenLayout.height]);
        this._goldenLayout.emit('stateChanged');
    }

    setupGoldenLayout() {
        var config = this.props.Document.GetText(KeyStore.Data, "");
        if (config) {
            if (!this._goldenLayout)
                this._goldenLayout = new GoldenLayout(JSON.parse(config));
            else {
                return;
                try {
                    this._goldenLayout.unbind('tabCreated', this.tabCreated);
                    this._goldenLayout.unbind('stackCreated', this.stackCreated);
                    this._goldenLayout.unbind('stateChanged', this.stateChanged);
                    this._goldenLayout.unbind('initialised', this.stateChanged);
                } catch (e) {

                }
                this._goldenLayout.destroy();
                this._goldenLayout = new GoldenLayout(JSON.parse(config));
            }
            this._goldenLayout.on('tabCreated', this.tabCreated);
            this._goldenLayout.on('stackCreated', this.stackCreated);
            this._goldenLayout.on('initialised', this.onOpened);
            this._goldenLayout.registerComponent('DocumentFrameRenderer', DockedFrameRenderer);
            this._goldenLayout.container = this._containerRef.current;
            this._goldenLayout.init();
        }
    }
    onOpened = () => {
        this._goldenLayout.on('stateChanged', this.stateChanged);
    }
    componentDidMount: () => void = () => {
        if (this._containerRef.current) {
            reaction(
                () => this.props.Document.GetText(KeyStore.Data, ""),
                () => this.setupGoldenLayout(), { fireImmediately: true });

            window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
        }
    }
    componentWillUnmount: () => void = () => {
        this._goldenLayout.unbind('tabCreated', this.tabCreated);
        this._goldenLayout.unbind('stackCreated', this.stackCreated);
        this._goldenLayout.unbind('stateChanged', this.stateChanged);
        this._goldenLayout.unbind('initialised', this.stateChanged);
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
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button === 2 && this.active) {
            e.stopPropagation();
            e.preventDefault();
        } else {
            if (e.buttons === 1 && this.active) {
                e.stopPropagation();
            }
        }
    }

    stateChanged = () => {
        console.log("STATE CHANGED");
        var json = JSON.stringify(this._goldenLayout.toConfig());
        this.props.Document.SetText(KeyStore.Data, json)
    }

    tabCreated = (tab: any) => {
        if (this._dragDiv) {
            this._dragDiv.removeChild(this._dragElement);
            this._dragParent!.removeChild(this._dragFakeElement!);
            this._dragParent!.appendChild(this._dragElement!);
            DragManager.Root().removeChild(this._dragDiv);
            this._dragDiv = null;
            this.stateChanged();
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
            .click(function () {
                //if (confirm('really close this?')) {
                stack.remove();
                //}
            });
    }

    render() {
        this.props.Document.GetNumber(KeyStore.Width, 0); // bcz: needed to force render when window size changes
        this.props.Document.GetNumber(KeyStore.Height, 0);
        return (
            <div className="collectiondockingview-container" id="menuContainer"
                onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} ref={this._containerRef}
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
}
@observer
export class DockedFrameRenderer extends React.Component<DockedFrameProps> {

    private _mainCont = React.createRef<HTMLDivElement>();
    @observable private _nativeWidth = 0;
    @observable private _nativeHeight = 0;
    @observable private _parentScaling = 1; // used to transfer the dimensions of the content pane in the DOM to the ParentScaling prop of the DocumentView
    @observable private Document: Opt<Document>;

    constructor(props: any) {
        super(props);
        Server.GetField(this.props.documentId, f => this.Document = f as Document)
    }

    @action
    setScaling = (r: any) => {
        let nativeWidth = this.Document!.GetNumber(KeyStore.NativeWidth, 0);
        let nativeHeight = this.Document!.GetNumber(KeyStore.NativeWidth, 0);
        this._parentScaling = nativeWidth > 0 ? r.entry.width / nativeWidth : 1;
        this._nativeWidth = r.entry.width ? r.entry.width : nativeWidth;
        this._nativeHeight = nativeWidth ? r.entry.width / nativeWidth * nativeHeight : nativeHeight;
    }

    ScreenToLocalTransform = () => {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(this._mainCont.current!);
        var props = CollectionDockingView.Instance.props;
        return props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(scale / this._parentScaling)
    }

    render() {
        if (!this.Document)
            return (null)
        var content =
            <div ref={this._mainCont}>
                <DocumentView key={this.Document.Id} Document={this.Document}
                    AddDocument={undefined}
                    RemoveDocument={undefined}
                    Scaling={this._parentScaling}
                    PanelSize={[this._nativeWidth, this._nativeHeight]}
                    ScreenToLocalTransform={this.ScreenToLocalTransform}
                    isTopMost={true}
                    ContainingCollectionView={undefined} />
            </div>

        return <Measure onResize={this.setScaling}>
            {({ measureRef }) => <div ref={measureRef}>  {content} </div>}
        </Measure>
    }
}