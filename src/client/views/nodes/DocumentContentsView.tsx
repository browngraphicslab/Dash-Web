import { computed } from "mobx";
import { observer } from "mobx-react";
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
import { IconBox } from "./IconBox";
import { KeyValueBox } from "./KeyValueBox";
import { PDFBox } from "./PDFBox";
import { VideoBox } from "./VideoBox";
import { WebBox } from "./WebBox";
import { HistogramBox } from "../../northstar/dash-nodes/HistogramBox";
import React = require("react");
import { FieldViewProps } from "./FieldView";
import { Without, OmitKeys } from "../../../Utils";
import { Cast } from "../../../new_fields/Types";
const JsxParser = require('react-jsx-parser').default; //TODO Why does this need to be imported like this?

type BindingProps = Without<FieldViewProps, 'fieldKey'>;
export interface JsxBindings {
    props: BindingProps;
}

@observer
export class DocumentContentsView extends React.Component<DocumentViewProps & {
    isSelected: () => boolean,
    select: (ctrl: boolean) => void,
    layoutKey: string
}> {
    @computed get layout(): string { return Cast(this.props.Document[this.props.layoutKey], "string", "<p>Error loading layout data</p>"); }

    CreateBindings(): JsxBindings {
        let bindings: JsxBindings = { props: OmitKeys(this.props, ['parentActive'], (obj: any) => obj.active = this.props.parentActive).omit };
        return bindings;
    }

    render() {
        return <JsxParser
            components={{ FormattedTextBox, ImageBox, IconBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, CollectionPDFView, CollectionVideoView, WebBox, KeyValueBox, PDFBox, VideoBox, AudioBox, HistogramBox }}
            bindings={this.CreateBindings()}
            jsx={this.layout}
            showWarnings={true}
            onError={(test: any) => { console.log(test); }}
        />;
    }
}