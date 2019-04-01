import { computed } from "mobx";
import { observer } from "mobx-react";
import { FieldWaiting, Field } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { CollectionView } from "../collections/CollectionView";
import { AudioBox } from "./AudioBox";
import { DocumentViewProps } from "./DocumentView";
import "./DocumentView.scss";
import { FormattedTextBox } from "./FormattedTextBox";
import { ImageBox } from "./ImageBox";
import { KeyValueBox } from "./KeyValueBox";
import { PDFBox } from "./PDFBox";
import { VideoBox } from "./VideoBox";
import { WebBox } from "./WebBox";
import { HistogramBox } from "../../northstar/dash-nodes/HistogramBox";
import React = require("react");
import { Document } from "../../../fields/Document";
import { FieldViewProps } from "./FieldView";
import { Without } from "../../../Utils";
const JsxParser = require('react-jsx-parser').default; //TODO Why does this need to be imported like this?

type BindingProps = Without<FieldViewProps, 'fieldKey'>
export interface JsxBindings {
    props: BindingProps;
    [keyName: string]: BindingProps | Field;
}

@observer
export class DocumentContentsView extends React.Component<DocumentViewProps & {
    isSelected: () => boolean,
    select: (ctrl: boolean) => void,
    layoutKey: Key
}> {
    @computed get layout(): string { return this.props.Document.GetText(this.props.layoutKey, "<p>Error loading layout data</p>"); }
    @computed get layoutKeys(): Key[] { return this.props.Document.GetData(KeyStore.LayoutKeys, ListField, new Array<Key>()); }
    @computed get layoutFields(): Key[] { return this.props.Document.GetData(KeyStore.LayoutFields, ListField, new Array<Key>()); }


    CreateBindings(): JsxBindings {
        let { Document, isSelected, select, isTopMost, selectOnLoad } = this.props;
        let bindings: JsxBindings = {
            props: {
                Document,
                isSelected,
                select,
                isTopMost,
                selectOnLoad,
            }
        };
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key; // this maps string values of the form <keyname>Key to an actual key Kestore.keyname  e.g,   "DataKey" => KeyStore.Data
        }
        for (const key of this.layoutFields) {
            let field = this.props.Document.Get(key);
            bindings[key.Name] = field && field != FieldWaiting ? field.GetValue() : field;
        }
        return bindings;
    }

    render() {
        let lkeys = this.props.Document.GetT(KeyStore.LayoutKeys, ListField);
        if (!lkeys || lkeys === FieldWaiting) {
            return <p>Error loading layout keys</p>;
        }
        return <JsxParser
            components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, CollectionPDFView, CollectionVideoView, WebBox, KeyValueBox, PDFBox, VideoBox, AudioBox, HistogramBox }}
            bindings={this.CreateBindings()}
            jsx={this.layout}
            showWarnings={true}
            onError={(test: any) => { console.log(test) }}
        />
    }
}