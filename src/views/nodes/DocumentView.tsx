import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { Opt, FieldWaiting } from "../../fields/Field";
import { Key, KeyStore } from "../../fields/Key";
import { ListField } from "../../fields/ListField";
import { NumberField } from "../../fields/NumberField";
import { TextField } from "../../fields/TextField";
import { Utils } from "../../Utils";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionViewBase, COLLECTION_BORDER_WIDTH } from "../collections/CollectionViewBase";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import "./NodeView.scss";
import React = require("react");
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

export interface DocumentViewProps {
    Document: Document;
    DocumentView: Opt<DocumentView>  // needed only to set ContainingDocumentView on CollectionViewProps when invoked from JsxParser -- is there a better way?
    ContainingCollectionView: Opt<CollectionViewBase>;
}
@observer
export class DocumentView extends React.Component<DocumentViewProps> {

    protected _mainCont = React.createRef<any>();
    get MainContent() {
        return this._mainCont;
    }
    @computed
    get layout(): string {
        return this.props.Document.GetData(KeyStore.Layout, TextField, String("<p>Error loading layout data</p>"));
    }

    @computed
    get layoutKeys(): Key[] {
        return this.props.Document.GetData(KeyStore.LayoutKeys, ListField, new Array<Key>());
    }

    @computed
    get layoutFields(): Key[] {
        return this.props.Document.GetData(KeyStore.LayoutFields, ListField, new Array<Key>());
    }

    // 
    // returns the cumulative scaling between the document and the screen
    //
    @computed
    public get ScalingToScreenSpace(): number {
        if (this.props.ContainingCollectionView != undefined &&
            this.props.ContainingCollectionView.props.ContainingDocumentView != undefined) {
            let ss = this.props.ContainingCollectionView.props.DocumentForCollection.GetData(KeyStore.Scale, NumberField, Number(1));
            return this.props.ContainingCollectionView.props.ContainingDocumentView.ScalingToScreenSpace * ss;
        }
        return 1;
    }

    //
    // Converts a coordinate in the screen space of the app into a local document coordinate.
    //
    public TransformToLocalPoint(screenX: number, screenY: number) {
        // if this collection view is nested within another collection view, then 
        // first transform the screen point into the parent collection's coordinate space.
        let { LocalX: parentX, LocalY: parentY } = this.props.ContainingCollectionView != undefined &&
            this.props.ContainingCollectionView.props.ContainingDocumentView != undefined ?
            this.props.ContainingCollectionView.props.ContainingDocumentView.TransformToLocalPoint(screenX, screenY) :
            { LocalX: screenX, LocalY: screenY };
        let ContainerX: number = parentX - COLLECTION_BORDER_WIDTH;
        let ContainerY: number = parentY - COLLECTION_BORDER_WIDTH;

        var Xx = this.props.Document.GetData(KeyStore.X, NumberField, Number(0));
        var Yy = this.props.Document.GetData(KeyStore.Y, NumberField, Number(0));
        // CollectionDockingViews change the location of their children frames without using a Dash transformation.
        // They also ignore any transformation that may have been applied to their content document.
        // NOTE: this currently assumes CollectionDockingViews aren't nested.
        if (this.props.ContainingCollectionView instanceof CollectionDockingView) {
            var { translateX: rx, translateY: ry } = Utils.GetScreenTransform(this.MainContent.current!);
            Xx = rx - COLLECTION_BORDER_WIDTH;
            Yy = ry - COLLECTION_BORDER_WIDTH;
        }

        let Ss = this.props.Document.GetData(KeyStore.Scale, NumberField, Number(1));
        let Panxx = this.props.Document.GetData(KeyStore.PanX, NumberField, Number(0));
        let Panyy = this.props.Document.GetData(KeyStore.PanY, NumberField, Number(0));
        let LocalX = (ContainerX - (Xx + Panxx)) / Ss;
        let LocalY = (ContainerY - (Yy + Panyy)) / Ss;

        return { LocalX, Ss, Panxx, Xx, LocalY, Panyy, Yy, ContainerX, ContainerY };
    }

    //
    // Converts a point in the coordinate space of a document to a screen space coordinate.
    //
    public TransformToScreenPoint(localX: number, localY: number, Ss: number = 1, Panxx: number = 0, Panyy: number = 0): { ScreenX: number, ScreenY: number } {

        var Xx = this.props.Document.GetData(KeyStore.X, NumberField, Number(0));
        var Yy = this.props.Document.GetData(KeyStore.Y, NumberField, Number(0));
        // CollectionDockingViews change the location of their children frames without using a Dash transformation.
        // They also ignore any transformation that may have been applied to their content document.
        // NOTE: this currently assumes CollectionDockingViews aren't nested.
        if (this.props.ContainingCollectionView instanceof CollectionDockingView) {
            var { translateX: rx, translateY: ry } = Utils.GetScreenTransform(this.MainContent.current!);
            Xx = rx - COLLECTION_BORDER_WIDTH;
            Yy = ry - COLLECTION_BORDER_WIDTH;
        }

        let W = COLLECTION_BORDER_WIDTH;
        let H = COLLECTION_BORDER_WIDTH;
        let parentX = (localX - W) * Ss + (Xx + Panxx) + W;
        let parentY = (localY - H) * Ss + (Yy + Panyy) + H;

        // if this collection view is nested within another collection view, then 
        // first transform the local point into the parent collection's coordinate space.
        let containingDocView = this.props.ContainingCollectionView != undefined ? this.props.ContainingCollectionView.props.ContainingDocumentView : undefined;
        if (containingDocView != undefined) {
            let ss = containingDocView.props.Document.GetData(KeyStore.Scale, NumberField, Number(1));
            let panxx = containingDocView.props.Document.GetData(KeyStore.PanX, NumberField, Number(0)) + COLLECTION_BORDER_WIDTH * ss;
            let panyy = containingDocView.props.Document.GetData(KeyStore.PanY, NumberField, Number(0)) + COLLECTION_BORDER_WIDTH * ss;
            let { ScreenX, ScreenY } = containingDocView.TransformToScreenPoint(parentX, parentY, ss, panxx, panyy);
            parentX = ScreenX;
            parentY = ScreenY;
        }
        return { ScreenX: parentX, ScreenY: parentY };
    }


    render() {
        let bindings = { ...this.props } as any;
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key;  // this maps string values of the form <keyname>Key to an actual key Kestore.keyname  e.g,   "DataKey" => KeyStore.Data
        }
        for (const key of this.layoutFields) {
            let field = this.props.Document.Get(key);
            bindings[key.Name] = field && field != FieldWaiting ? field.GetValue() : field;
        }
        if (bindings.DocumentView === undefined) {
            bindings.DocumentView = this; // set the DocumentView to this if it hasn't already been set by a sub-class during its render method.
        }
        return (
            <div className="node" ref={this._mainCont} style={{ width: "100%", height: "100%", }}>
                <JsxParser
                    components={{ FormattedTextBox: FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView }}
                    bindings={bindings}
                    jsx={this.layout}
                    showWarnings={true}
                    onError={(test: any) => { console.log(test) }}
                />
            </div>
        )
    }
}
