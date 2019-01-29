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
// import GoldenLayout, { Row, Stack, createGoldenLayoutComponent } from '../../../node_modules/react-golden-layout/src/internal/';

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

    @computed
    public get active(): boolean {
        var isSelected = (this.props.ContainingDocumentView != undefined && SelectionManager.IsSelected(this.props.ContainingDocumentView));
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == this);
        var topMost = this.props.ContainingDocumentView != undefined && this.props.ContainingDocumentView.props.ContainingCollectionView == undefined;
        return isSelected || childSelected || topMost;
    }

    componentDidMount() {
        // if (this._containerRef.current) {
        //     DragManager.MakeDropTarget(this._containerRef.current, {
        //         handlers: {
        //             drop: this.drop
        //         }
        //     });
        // }
    }


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
        console.log("Gettting " + component);
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
        var w = Document.GetFieldValue(KeyStore.Width, NumberField, Number(0));
        var h = Document.GetFieldValue(KeyStore.Height, NumberField, Number(0));
        return (
            <div className="border" style={{
                borderStyle: "solid",
                borderWidth: `${CollectionDockingView.BORDER_WIDTH}px`,
            }}>
                <div className="collectiondockingview-container" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} ref={this._containerRef}
                    style={{
                        width: "100%",
                        height: `calc(100% - 2*${CollectionDockingView.BORDER_WIDTH}px)`,
                    }} >
                    <FlexLayout.Layout model={this._model} factory={this.factory} />
                </div>
            </div>
        );
    }
}