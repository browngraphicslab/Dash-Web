import { observer } from "mobx-react";
import { KeyStore } from "../../fields/Key";
import React = require("react");
import FlexLayout from "flexlayout-react";
import { action, observable, computed } from "mobx";
import { Document } from "../../fields/Document";
import { DocumentView } from "../nodes/DocumentView";
import { ListField } from "../../fields/ListField";
import { NumberField } from "../../fields/NumberField";
import { SSL_OP_SINGLE_DH_USE } from "constants";
import "./CollectionDockingView.scss"
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import * as GoldenLayout from "golden-layout";
import * as ReactDOM from 'react-dom';
import { DragManager } from "../../util/DragManager";
import { CollectionViewBase, CollectionViewProps, COLLECTION_BORDER_WIDTH } from "./CollectionViewBase";

@observer
export class CollectionDockingView extends CollectionViewBase {

    private static UseGoldenLayout = true;
    public static LayoutString() { return CollectionViewBase.LayoutString("CollectionDockingView"); }
    private _containerRef = React.createRef<HTMLDivElement>();
    @computed
    private get modelForFlexLayout() {
        const { CollectionFieldKey: fieldKey, DocumentForCollection: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        var docs = value.map(doc => {
            return { type: 'tabset', weight: 50, selected: 0, children: [{ type: "tab", name: doc.Title, component: doc.Id }] };
        });
        return FlexLayout.Model.fromJson({
            global: {}, borders: [],
            layout: {
                "type": "row",
                "weight": 100,
                "children": docs
            }
        });
    }
    @computed
    private get modelForGoldenLayout(): any {
        const { CollectionFieldKey: fieldKey, DocumentForCollection: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        var docs = value.map(doc => {
            return { type: 'component', componentName: 'documentViewComponent', componentState: { doc: doc } };
        });
        return new GoldenLayout({
            settings: {
                selectionEnabled: true
            }, content: [{ type: 'row', content: docs }]
        });
    }
    constructor(props: CollectionViewProps) {
        super(props);
    }

    componentDidMount: () => void = () => {
        if (this._containerRef.current && CollectionDockingView.UseGoldenLayout) {
            this.goldenLayoutFactory();
            window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
        }
    }
    componentWillUnmount: () => void = () => {
        window.removeEventListener('resize', this.onResize);
    }
    private nextId = (function () { var _next_id = 0; return function () { return _next_id++; } })();


    @action
    onResize = (event: any) => {
        var cur = this.props.DocumentContentsOfCollection!.MainContent.current;

        // bcz: since GoldenLayout isn't a React component itself, we need to notify it to resize when its document container's size has changed
        CollectionDockingView.myLayout.updateSize(cur!.getBoundingClientRect().width, cur!.getBoundingClientRect().height);
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

    flexLayoutFactory = (node: any): any => {
        var component = node.getComponent();
        if (component === "button") {
            return <button>{node.getName()}</button>;
        }
        const { CollectionFieldKey: fieldKey, DocumentForCollection: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        for (var i: number = 0; i < value.length; i++) {
            if (value[i].Id === component) {
                return (<DocumentView key={value[i].Id} ContainingCollectionView={this} Document={value[i]} DocumentContentsView={undefined} />);
            }
        }
        if (component === "text") {
            return (<div className="panel">Panel {node.getName()}</div>);
        }
    }

    public static myLayout: any = null;

    private static _dragDiv: any = null;
    private static _dragParent: HTMLElement | null = null;
    private static _dragElement: HTMLDivElement;
    private static _dragFakeElement: HTMLDivElement;
    public static StartOtherDrag(dragElement: HTMLDivElement, dragDoc: Document) {
        var newItemConfig = {
            type: 'component',
            componentName: 'documentViewComponent',
            componentState: { doc: dragDoc }
        };
        this._dragElement = dragElement;
        this._dragParent = dragElement.parentElement;
        // bcz: we want to copy this document into the header, not move it there.
        //   However, GoldenLayout is setup to move things, so we have to do some kludgy stuff:

        //   - create a temporary invisible div and register that as a DragSource with GoldenLayout
        this._dragDiv = document.createElement("div");
        this._dragDiv.style.opacity = 0;
        DragManager.Root().appendChild(this._dragDiv);
        CollectionDockingView.myLayout.createDragSource(this._dragDiv, newItemConfig);

        //   - add our document to that div so that GoldenLayout will get the move events its listening for
        this._dragDiv.appendChild(this._dragElement);

        //   - add a duplicate of our document to the original document's container 
        //     (GoldenLayout will be removing our original one)
        this._dragFakeElement = dragElement.cloneNode(true) as HTMLDivElement;
        this._dragParent!.appendChild(this._dragFakeElement);

        // all of this must be undone when the document has been dropped (see tabCreated)
    }

    _makeFullScreen: boolean = false;
    _maximizedStack: any = null;
    public static OpenFullScreen(document: Document) {
        var newItemConfig = {
            type: 'component',
            componentName: 'documentViewComponent',
            componentState: { doc: document }
        };
        CollectionDockingView.myLayout._makeFullScreen = true;
        CollectionDockingView.myLayout.root.contentItems[0].addChild(newItemConfig);
    }
    public static CloseFullScreen() {
        if (CollectionDockingView.myLayout._maximizedStack != null) {
            CollectionDockingView.myLayout._maximizedStack.header.controlsContainer.find('.lm_close').click();
            CollectionDockingView.myLayout._maximizedStack = null;
        }
    }

    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to that split
    //
    public static AddRightSplit(document: Document) {
        var newItemConfig = {
            type: 'component',
            componentName: 'documentViewComponent',
            componentState: { doc: document }
        }
        let newItemStackConfig = {
            type: 'stack',
            content: [newItemConfig]
        };
        var newContentItem = new CollectionDockingView.myLayout._typeToItem[newItemStackConfig.type](CollectionDockingView.myLayout, newItemStackConfig, parent);

        if (CollectionDockingView.myLayout.root.contentItems[0].isRow) {
            var rowlayout = CollectionDockingView.myLayout.root.contentItems[0];
            var lastRowItem = rowlayout.contentItems[rowlayout.contentItems.length - 1];

            lastRowItem.config["width"] *= 0.5;
            newContentItem.config["width"] = lastRowItem.config["width"];
            rowlayout.addChild(newContentItem, rowlayout.contentItems.length, true);
            rowlayout.callDownwards('setSize');
        }
        else {
            var collayout = CollectionDockingView.myLayout.root.contentItems[0];
            var newRow = collayout.layoutManager.createContentItem({ type: "row" }, CollectionDockingView.myLayout);
            collayout.parent.replaceChild(collayout, newRow);

            newRow.addChild(newContentItem, undefined, true);
            newRow.addChild(collayout, 0, true);

            collayout.config["width"] = 50;
            newContentItem.config["width"] = 50;
            collayout.parent.callDownwards('setSize');
        }
    }
    goldenLayoutFactory() {
        CollectionDockingView.myLayout = this.modelForGoldenLayout;

        var layout = CollectionDockingView.myLayout;
        CollectionDockingView.myLayout.on('tabCreated', function (tab: any) {
            if (CollectionDockingView._dragDiv) {
                CollectionDockingView._dragDiv.removeChild(CollectionDockingView._dragElement);
                CollectionDockingView._dragParent!.removeChild(CollectionDockingView._dragFakeElement);
                CollectionDockingView._dragParent!.appendChild(CollectionDockingView._dragElement);
                DragManager.Root().removeChild(CollectionDockingView._dragDiv);
                CollectionDockingView._dragDiv = null;
            }
            tab.setTitle(tab.contentItem.config.componentState.doc.Title);
            tab.closeElement.off('click') //unbind the current click handler
                .click(function () {
                    tab.contentItem.remove();
                });
        });

        CollectionDockingView.myLayout.on('stackCreated', function (stack: any) {
            if (CollectionDockingView.myLayout._makeFullScreen) {
                CollectionDockingView.myLayout._maximizedStack = stack;
                CollectionDockingView.myLayout._maxstack = stack.header.controlsContainer.find('.lm_maximise');
            }
            stack.header.controlsContainer.find('.lm_popout').hide();
            stack.header.controlsContainer.find('.lm_close') //get the close icon
                .off('click') //unbind the current click handler
                .click(function () {
                    //if (confirm('really close this?')) {
                    stack.remove();
                    //}
                });
        });

        var me = this;
        CollectionDockingView.myLayout.registerComponent('documentViewComponent', function (container: any, state: any) {
            // bcz: this is crufty
            // calling html() causes a div tag to be added in the DOM with id 'containingDiv'. 
            // Apparently, we need to wait to allow a live html div element to actually be instantiated.
            // After a timeout, we lookup the live html div element and add our React DocumentView to it.
            var containingDiv = "component_" + me.nextId();
            container.getElement().html("<div id='" + containingDiv + "'></div>");
            setTimeout(function () {
                ReactDOM.render((
                    <DocumentView key={state.doc.Id} Document={state.doc} ContainingCollectionView={me} DocumentContentsView={undefined} /> // bcz: need to fill in DocumentContentsView with value of DocumentContents when created...
                ),
                    document.getElementById(containingDiv)
                );
                if (CollectionDockingView.myLayout._maxstack != null) {
                    CollectionDockingView.myLayout._maxstack.click();
                }
            }, 0);
        });
        CollectionDockingView.myLayout.container = this._containerRef.current;
        CollectionDockingView.myLayout.init();
    }


    render() {
        const { CollectionFieldKey: fieldKey, DocumentForCollection: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        // bcz: not sure why, but I need these to force the flexlayout to update when the collection size changes.
        var s = this.props.DocumentContentsOfCollection != undefined ? this.props.DocumentContentsOfCollection!.ScalingToScreenSpace : 1;
        var w = Document.GetFieldValue(KeyStore.Width, NumberField, Number(0)) / s;
        var h = Document.GetFieldValue(KeyStore.Height, NumberField, Number(0)) / s;

        var chooseLayout = () => {
            if (!CollectionDockingView.UseGoldenLayout)
                return <FlexLayout.Layout model={this.modelForFlexLayout} factory={this.flexLayoutFactory} />;
        }

        return (
            <div className="border" style={{
                borderStyle: "solid",
                borderWidth: `${COLLECTION_BORDER_WIDTH}px`,
            }}>
                <div className="collectiondockingview-container" id="menuContainer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} ref={this._containerRef}
                    style={{
                        width: CollectionDockingView.UseGoldenLayout || s > 1 ? "100%" : w - 2 * COLLECTION_BORDER_WIDTH,
                        height: CollectionDockingView.UseGoldenLayout || s > 1 ? "100%" : h - 2 * COLLECTION_BORDER_WIDTH
                    }} >
                    {chooseLayout()}
                </div>
            </div>
        );
    }
}