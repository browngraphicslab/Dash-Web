import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Opt, FieldWaiting } from "../../../fields/Field";
import { Key, KeyStore } from "../../../fields/Key";
import { ListField } from "../../../fields/ListField";
import { NumberField } from "../../../fields/NumberField";
import { TextField } from "../../../fields/TextField";
import { Utils } from "../../../Utils";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionViewBase, COLLECTION_BORDER_WIDTH } from "../collections/CollectionViewBase";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import "./NodeView.scss";
import React = require("react");
import { Transform } from "../../util/Transform";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

export interface DocumentViewProps {
    DocumentView: Opt<DocumentView>  // needed only to set ContainingDocumentView on CollectionViewProps when invoked from JsxParser -- is there a better way?
    ContainingCollectionView: Opt<CollectionViewBase>;

    Document: Document;
    AddDocument?: (doc: Document) => void;
    RemoveDocument?: (doc: Document) => boolean;
    GetTransform: () => Transform;
    Scaling: number;
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
    get backgroundLayout(): string {
        return this.props.Document.GetData(KeyStore.BackgroundLayout, TextField, String("<p>Error loading layout data</p>"));
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
            let ss = this.props.ContainingCollectionView.props.DocumentForCollection.GetNumber(KeyStore.Scale, 1);
            return this.props.ContainingCollectionView.props.ContainingDocumentView.ScalingToScreenSpace * ss;
        }
        return 1;
    }


    render() {
        let bindings = { ...this.props } as any;
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key;  // this maps string values of the form <keyname>Key to an actual key Kestore.keyname  e.g,   "DataKey" => KeyStore.Data
        }
        if (!bindings.GetTransform) {
            console.log("test");
        }
        for (const key of this.layoutFields) {
            let field = this.props.Document.Get(key);
            bindings[key.Name] = field && field != FieldWaiting ? field.GetValue() : field;
        }
        if (bindings.DocumentView === undefined) {
            bindings.DocumentView = this; // set the DocumentView to this if it hasn't already been set by a sub-class during its render method.
        }
        var annotated = <JsxParser
            components={{ FormattedTextBox: FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView }}
            bindings={bindings}
            jsx={this.backgroundLayout}
            showWarnings={true}
            onError={(test: any) => { console.log(test) }}
        />;
        bindings["BackgroundView"] = this.backgroundLayout ? annotated : null;

        var width = this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
        var strwidth = width > 0 ? width.toString() + "px" : "100%";
        var height = this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
        var strheight = height > 0 ? height.toString() + "px" : "100%";
        return (
            <div className="node" ref={this._mainCont} style={{ width: strwidth, height: strheight, transformOrigin: "left top", transform: `scale(${this.props.Scaling},${this.props.Scaling})` }}>
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
