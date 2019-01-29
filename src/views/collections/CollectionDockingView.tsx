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
                            "component": "grid",
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
                            "component": "grid",
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
            if (e.buttons === 1 && SelectionManager.IsSelected(this.props.ContainingDocumentView!)) {
                e.stopPropagation();
            }
        }
    }
    factory = (node: any): any => {
        var component = node.getComponent();
        if (component === "button") {
            return <button>{node.getName()}</button>;
        }
        if (component === "grid") {
            let which = this._times++ % 3;
            if (which == 0)
                return <div style={{ backgroundColor: "blue", width: 100, height: 100 }}></div>
            if (which == 1)
                return <div style={{ backgroundColor: "yellow", width: 100, height: 100 }}></div>
            if (which == 2)
                return <div style={{ backgroundColor: "red", width: 100, height: 100 }}></div>
        }
    }

    render() {
        const { fieldKey, Document: Document } = this.props;

        const value: Document[] = Document.GetFieldValue(fieldKey, ListField, []);
        const panx: number = Document.GetFieldValue(KeyStore.PanX, NumberField, Number(0));
        const pany: number = Document.GetFieldValue(KeyStore.PanY, NumberField, Number(0));
        const currScale: number = Document.GetFieldValue(KeyStore.Scale, NumberField, Number(1));
        return (
            <div className="border" style={{
                borderStyle: "solid",
                borderWidth: `${CollectionDockingView.BORDER_WIDTH}px`,
            }}>
                <div className="collectiondockingview-container" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} style={{
                    width: "100%",
                    height: `calc(100% - 2*${CollectionDockingView.BORDER_WIDTH}px)`,
                }} ref={this._containerRef}>
                    <div className="collectiondockingview" ref={this._canvasRef}>
                        <FlexLayout.Layout model={this._model} factory={this.factory} />
                    </div>
                </div>
            </div>
        );
    }
}