import { observer } from "mobx-react";
import { KeyStore } from "../../fields/Key";
import React = require("react");
import FlexLayout from "flexlayout-react";
import { action, observable, computed } from "mobx";
import { Document } from "../../fields/Document";
import { DocumentView, CollectionViewProps } from "../nodes/DocumentView";
import { ListField } from "../../fields/ListField";
import { NumberField } from "../../fields/NumberField";
import { SSL_OP_SINGLE_DH_USE } from "constants";
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import "./CollectionDockingView.scss"
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import * as GoldenLayout from "golden-layout";
import * as ReactDOM from 'react-dom';

@observer
export class CollectionDockingView extends React.Component<CollectionViewProps> {

    private static UseGoldenLayout = true;
    public static LayoutString() { return '<CollectionDockingView Document={Document} fieldKey={DataKey} ContainingDocumentView={ContainingDocumentView}/>'; }
    private _containerRef = React.createRef<HTMLDivElement>();
    @computed
    private get modelForFlexLayout() {
        const { fieldKey, Document: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        var docs = value.map(doc => {
            return { type: 'tabset', weight: 50, selected: 0, children: [ { type: "tab", name: doc.Title, component: doc.Id } ] };
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
        const { fieldKey, Document: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        var docs = value.map(doc => {
            return { type: 'component', componentName: 'documentViewComponent', componentState: { doc: doc } };
        });
        return new GoldenLayout({ content: [ { type: 'row', content: docs } ] });
    }
    constructor(props: CollectionViewProps) {
        super(props);
    }

    public static BORDER_WIDTH = 2;
    public static TAB_HEADER_HEIGHT = 20;

    @computed
    public get active(): boolean {
        var isSelected = (this.props.ContainingDocumentView != undefined && SelectionManager.IsSelected(this.props.ContainingDocumentView));
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == this);
        var topMost = this.props.ContainingDocumentView != undefined && this.props.ContainingDocumentView.props.ContainingCollectionView == undefined;
        return isSelected || childSelected || topMost;
    }

    componentDidMount: () => void = () => {
        if (this._containerRef.current && CollectionDockingView.UseGoldenLayout) {
            this.goldenLayoutFactory();
        }
    }
    private nextId = (function () { var _next_id = 0; return function () { return _next_id++; } })();

    @action
    addDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetFieldValue(this.props.fieldKey, ListField, new Array<Document>())
        value.push(doc);
    }

    @action
    removeDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetFieldValue(this.props.fieldKey, ListField, new Array<Document>())
        if (value.indexOf(doc) !== -1) {
            value.splice(value.indexOf(doc), 1)

            SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems()
        }
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
        const { fieldKey, Document: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        for (var i: number = 0; i < value.length; i++) {
            if (value[ i ].Id === component) {
                return (<DocumentView key={value[ i ].Id} ContainingCollectionView={this} Document={value[ i ]} ContainingDocumentView={this.props.ContainingDocumentView} />);
            }
        }
        if (component === "text") {
            return (<div className="panel">Panel {node.getName()}</div>);
        }
    }

    goldenLayoutFactory() {
        var myLayout = this.modelForGoldenLayout;

        myLayout.on('stackCreated', function (stack: any) {
            stack.header.controlsContainer.find('.lm_close') //get the close icon
                .off('click') //unbind the current click handler
                .click(function () {
                    if (confirm('really close this?')) {
                        stack.remove();
                    }
                });
        });

        myLayout.on('tabCreated', function (tab: any) {
            tab.setTitle(tab.contentItem.config.componentState.doc.Title);
            tab.closeElement.off('click') //unbind the current click handler
                .click(function () {
                    if (confirm('really close this?')) {
                        tab.contentItem.remove();
                    }
                });
        });

        var me = this;
        myLayout.registerComponent('documentViewComponent', function (container: any, state: any) {
            // bcz: this is crufty
            // calling html() causes a div tag to be added in the DOM with id 'containingDiv'. 
            // Apparently, we need to wait to allow a live html div element to actually be instantiated.
            // After a timeout, we lookup the live html div element and add our React DocumentView to it.
            var containingDiv = "component_" + me.nextId();
            container.getElement().html("<div id='" + containingDiv + "'></div>");
            setTimeout(function () {
                ReactDOM.render((
                    <DocumentView key={state.doc.Id} Document={state.doc} ContainingCollectionView={me} ContainingDocumentView={me.props.ContainingDocumentView} />
                ),
                    document.getElementById(containingDiv)
                )
            }, 0);
        });
        myLayout.container = this._containerRef.current;
        myLayout.init();
    }


    render() {
        const { fieldKey, Document: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        // bcz: not sure why, but I need these to force the flexlayout to update when the collection size changes.
        var s = this.props.ContainingDocumentView!.ScalingToScreenSpace;
        var w = Document.GetFieldValue(KeyStore.Width, NumberField, Number(0)) / s;
        var h = Document.GetFieldValue(KeyStore.Height, NumberField, Number(0)) / s;

        if (CollectionDockingView.UseGoldenLayout) {
            return (
                <div className="border" style={{
                    borderStyle: "solid",
                    borderWidth: `${CollectionDockingView.BORDER_WIDTH}px`,
                }}>
                    <div className="collectiondockingview-container" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} ref={this._containerRef}
                        style={{
                            width: "100%",
                            height: "100%"
                        }} >
                    </div>
                </div>
            );
        } else {
            return (
                <div className="border" style={{
                    borderStyle: "solid",
                    borderWidth: `${CollectionDockingView.BORDER_WIDTH}px`,
                }}>
                    <div className="collectiondockingview-container" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} ref={this._containerRef}
                        style={{
                            width: s > 1 ? "100%" : w - 2 * CollectionDockingView.BORDER_WIDTH,
                            height: s > 1 ? "100%" : h - 2 * CollectionDockingView.BORDER_WIDTH
                        }} >
                        <FlexLayout.Layout model={this.modelForFlexLayout} factory={this.flexLayoutFactory} />
                    </div>
                </div>
            );
        }
    }
}