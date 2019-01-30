import { observer } from "mobx-react";
import { Key, KeyStore } from "../../fields/Key";
import React = require("react");
import FlexLayout from "flexlayout-react";
import { action, observable, computed } from "mobx";
import { Document } from "../../fields/Document";
import { DocumentView, DocumentFieldViewProps, CollectionViewProps } from "../nodes/DocumentView";
import { ListField } from "../../fields/ListField";
import { NumberField } from "../../fields/NumberField";
import { SSL_OP_SINGLE_DH_USE } from "constants";
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import "./CollectionDockingView.scss"
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import * as GoldenLayout from "golden-layout";
import { CollectionFreeFormView } from './CollectionFreeFormView';
import * as ReactDOM from 'react-dom';

@observer
export class CollectionDockingView extends React.Component<CollectionViewProps> {

    public static LayoutString() { return '<CollectionDockingView Document={Document} fieldKey={DataKey} ContainingDocumentView={ContainingDocumentView}/>'; }


    private _times: number = 0;
    private _containerRef = React.createRef<HTMLDivElement>();
    private _canvasRef = React.createRef<HTMLDivElement>();
    private _json = {
        global: {},
        borders: [],
        layout: {
            "type": "row",
            "weight": 100,
            "children": [
                {
                    "type": "tabset",
                    "weight": 50,
                    "selected": 0,
                    "children": [
                        {
                            "type": "tab",
                            "name": "CHILD #1",
                            "component": "doc1",
                        }
                    ]
                },
                {
                    "type": "tabset",
                    "weight": 50,
                    "selected": 0,
                    "children": [
                        {
                            "type": "tab",
                            "name": "CHILD #2",
                            "component": "doc2",
                        }
                    ]
                },
                {
                    "type": "tabset",
                    "weight": 50,
                    "selected": 0,
                    "children": [
                        {
                            "type": "tab",
                            "name": "CHILD #3",
                            "component": "doc3",
                        }
                    ]
                }
            ]
        }
    };
    private _model: any;
    constructor(props: CollectionViewProps) {
        super(props);
        this._model = FlexLayout.Model.fromJson(this._json);
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

    myLayout: any = null;
    componentDidMount: () => void = () => {

        const { fieldKey, Document: Document } = this.props;

        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        if (this._containerRef.current) {
            if (this.myLayout == null) {
                this.myLayout = new GoldenLayout({
                    content: [ {
                        type: 'row',
                        content: [ {
                            type: 'component',
                            componentName: 'documentViewComponent',
                            componentState: { x: 0 }
                        }, {
                            type: 'component',
                            componentName: 'documentViewComponent',
                            componentState: { x: 1 }
                        } ]
                    } ]
                });

                this.myLayout.on('stackCreated', function (stack: any) {
                    stack
                        .header
                        .controlsContainer
                        .find('.lm_close') //get the close icon
                        .off('click') //unbind the current click handler
                        .click(function () {
                            //add your own
                            if (confirm('really close this?')) {
                                stack.remove();
                            }
                        });
                });

                this.myLayout.on('tabCreated', function (tab: any) {
                    tab
                        .closeElement
                        .off('click') //unbind the current click handler
                        .click(function () {
                            //add your own
                            if (confirm('really close this?')) {
                                tab.contentItem.remove();
                            }
                        });
                });

                this.myLayout.registerComponent('documentViewComponent', this.registerComponentWithCallback);
                this.myLayout.container = this._containerRef.current;
                this.myLayout.init();
            }
        }
    }
    private nextId = (function () { var _next_id = 0; return function () { return _next_id++; } })();

    private registerComponentWithCallback = (container: any, state: any) => {
        const { fieldKey, Document: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        var containingDiv = "component_" + this.nextId();
        container.getElement().html("<div id='" + containingDiv + "'></div>");
        // var new_state = Object.assign({}, state);
        // new_state[ "location" ] = containingDiv;
        // container.setState(new_state);
        var me = this;
        var docToRender = value[ state.x ];
        setTimeout(function () {
            ReactDOM.render((
                <div style={{ display: "grid" }}>
                    <DocumentView key={docToRender.Id} Document={docToRender} ContainingCollectionView={me} ContainingDocumentView={me.props.ContainingDocumentView} />
                </div>
            ),
                document.getElementById(containingDiv)
            )
        }, 1);
    };


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
    factory = (node: any): any => {
        var component = node.getComponent();
        if (component === "button") {
            return <button>{node.getName()}</button>;
        }
        const { fieldKey, Document: Document } = this.props;
        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        if (component === "doc1" && value.length > 0) {
            return (<DocumentView key={value[ 0 ].Id} ContainingCollectionView={this} Document={value[ 0 ]} ContainingDocumentView={this.props.ContainingDocumentView} />);
        }
        if (component === "doc2" && value.length > 1) {
            return (<DocumentView key={value[ 1 ].Id} ContainingCollectionView={this} Document={value[ 1 ]} ContainingDocumentView={this.props.ContainingDocumentView} />);
        }
        if (component === "doc3" && value.length > 2) {
            return (<DocumentView key={value[ 2 ].Id} ContainingCollectionView={this} Document={value[ 2 ]} ContainingDocumentView={this.props.ContainingDocumentView} />);
        }
        if (component === "text") {
            return (<div className="panel">Panel {node.getName()}</div>);
        }
    }


    render() {

        const { fieldKey, Document: Document } = this.props;

        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        // bcz: not sure why, but I need these to force the flexlayout to update when the collection size changes.
        var s = this.props.ContainingDocumentView!.ScalingToScreenSpace;
        var w = Document.GetFieldValue(KeyStore.Width, NumberField, Number(0)) / s;
        var h = Document.GetFieldValue(KeyStore.Height, NumberField, Number(0)) / s;



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
        // return (
        //     <div className="border" style={{
        //         borderStyle: "solid",
        //         borderWidth: `${CollectionDockingView.BORDER_WIDTH}px`,
        //     }}>
        //         <div className="collectiondockingview-container" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} ref={this._containerRef}
        //             style={{
        //                 width: s > 1 ? "100%" : w - 2 * CollectionDockingView.BORDER_WIDTH,
        //                 height: s > 1 ? "100%" : h - 2 * CollectionDockingView.BORDER_WIDTH
        //             }} >
        //             <FlexLayout.Layout model={this._model} factory={this.factory} />
        //         </div>
        //     </div>
        // );
    }
}