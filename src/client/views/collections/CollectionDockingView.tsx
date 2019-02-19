import * as GoldenLayout from "golden-layout";
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, computed, reaction, observable } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/Key";
import { ListField } from "../../../fields/ListField";
import { DragManager } from "../../util/DragManager";
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionDockingView.scss";
import { CollectionViewBase, CollectionViewProps, COLLECTION_BORDER_WIDTH } from "./CollectionViewBase";
import React = require("react");
import * as ReactDOM from 'react-dom';
import Measure from "react-measure";
import { Utils } from "../../../Utils";
import { FieldId } from "../../../fields/Field";
import { Server } from "../../Server";

@observer
export class CollectionDockingView extends CollectionViewBase {

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
    private _makeFullScreen: boolean = false;
    private _maximizedStack: any = null;

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

    public OpenFullScreen(document: Document) {
        this._makeFullScreen = true;
        this._goldenLayout.root.contentItems[0].addChild(CollectionDockingView.makeDocumentConfig(document));
    }
    public CloseFullScreen() {
        if (this._maximizedStack) {
            this._maximizedStack.header.controlsContainer.find('.lm_close').click();
            this._maximizedStack = null;
        }
    }

    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to that split
    //
    public AddRightSplit(document: Document) {
        let newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document)]
        };
        var newContentItem = new this._goldenLayout._typeToItem[newItemStackConfig.type](this._goldenLayout, newItemStackConfig, parent);

        if (this._goldenLayout.root.contentItems[0].isRow) {
            var rowlayout = this._goldenLayout.root.contentItems[0];
            var lastRowItem = rowlayout.contentItems[rowlayout.contentItems.length - 1];

            lastRowItem.config["width"] *= 0.5;
            newContentItem.config["width"] = lastRowItem.config["width"];
            rowlayout.addChild(newContentItem, rowlayout.contentItems.length, true);
            rowlayout.callDownwards('setSize');
        }
        else {
            var collayout = this._goldenLayout.root.contentItems[0];
            var newRow = collayout.layoutManager.createContentItem({ type: "row" }, this._goldenLayout);
            collayout.parent.replaceChild(collayout, newRow);

            newRow.addChild(newContentItem, undefined, true);
            newRow.addChild(collayout, 0, true);

            collayout.config["width"] = 50;
            newContentItem.config["width"] = 50;
            collayout.parent.callDownwards('setSize');
        }
    }

    componentDidMount: () => void = () => {
        if (this._containerRef.current) {

            this._goldenLayout = new GoldenLayout(JSON.parse(this.props.Document.GetText(KeyStore.Data, "")));
            this._goldenLayout.on('tabCreated', this.tabCreated);
            this._goldenLayout.on('stackCreated', this.stackCreated);
            this._goldenLayout.registerComponent('DocumentFrameRenderer', DockedFrameRenderer);
            this._goldenLayout.container = this._containerRef.current;
            this._goldenLayout.init();

            window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
        }
    }
    componentWillUnmount: () => void = () => {
        window.removeEventListener('resize', this.onResize);
    }
    @action
    onResize = (event: any) => {
        var cur = this.props.ContainingDocumentView!.MainContent.current;

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

    tabCreated = (tab: any) => {
        {
            if (this._dragDiv) {
                this._dragDiv.removeChild(this._dragElement);
                this._dragParent!.removeChild(this._dragFakeElement!);
                this._dragParent!.appendChild(this._dragElement!);
                DragManager.Root().removeChild(this._dragDiv);
                this._dragDiv = null;
            }
            //tab.setTitle(tab.contentItem.config.componentState.title);
            tab.closeElement.off('click') //unbind the current click handler
                .click(function () {
                    tab.contentItem.remove();
                });
        }
    }

    stackCreated = (stack: any) => {
        if (this._makeFullScreen) {
            this._maximizedStack = stack;
            setTimeout(function () { stack.header.controlsContainer.find('.lm_maximise').click() }, 10);
            this._makeFullScreen = false;
        }
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
        const { fieldKey: fieldKey, Document: Document } = this.props;
        const value: Document[] = Document.GetData(fieldKey, ListField, []);
        // bcz: not sure why, but I need these to force the flexlayout to update when the collection size changes.
        // tfs: we should be able to use this.props.ScreenToLocalTransform to get s right?
        var s = this.props.ContainingDocumentView != undefined ? this.props.ContainingDocumentView!.ScalingToScreenSpace : 1;
        var w = Document.GetNumber(KeyStore.Width, 0) / s;
        var h = Document.GetNumber(KeyStore.Height, 0) / s;
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
    constructor(props: any) {
        super(props);
    }

    @observable
    private _parentScaling = 1; // used to transfer the dimensions of the content pane in the DOM to the ParentScaling prop of the DocumentView

    @computed
    private get Document() { return Server.GetField(this.props.documentId, () => { }) as Document }

    render() {
        let nativeWidth = this.Document.GetNumber(KeyStore.NativeWidth, 0);
        var layout = this.Document.GetText(KeyStore.Layout, "");
        var content =
            <div ref={this._mainCont}>
                <DocumentView key={this.Document.Id} Document={this.Document}
                    AddDocument={undefined}
                    RemoveDocument={undefined}
                    Scaling={this._parentScaling}
                    ScreenToLocalTransform={() => {
                        let { scale, translateX, translateY } = Utils.GetScreenTransform(this._mainCont.current!);
                        var props = CollectionDockingView.Instance.props;
                        return props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(scale / this._parentScaling)
                    }}
                    isTopMost={true}
                    ContainingCollectionView={undefined} />
            </div>

        if (nativeWidth > 0 &&
            (layout.indexOf("CollectionFreeForm") == -1 || layout.indexOf("AnnotationsKey") != -1)) { // contents of documents should be scaled if document is not a freeform view, or if the freeformview is an annotation layer (presumably on a document that is not a freeformview)
            return <Measure onResize={action((r: any) => this._parentScaling = nativeWidth > 0 ? r.entry.width / nativeWidth : 1)}>
                {({ measureRef }) => <div ref={measureRef}>  {content} </div>}
            </Measure>
        }
        return content
    }
}