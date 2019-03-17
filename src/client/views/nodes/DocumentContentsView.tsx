import { Document } from "../../../fields/Document";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import { VideoBox } from "../nodes/VideoBox";
import { AudioBox } from "../nodes/AudioBox";
import { KeyValueBox } from "./KeyValueBox"
import { WebBox } from "../nodes/WebBox";
import { PDFBox } from "../nodes/PDFBox";
import "./DocumentView.scss";
import React = require("react");
const JsxParser = require('react-jsx-parser').default; //TODO Why does this need to be imported like this?

interface JsxBindings {
    Document: Document;
    layout: string;
    [prop: string]: any;
}

export class DocumentContentsView extends React.PureComponent<JsxBindings> {
    render() {
        return <JsxParser
            components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, CollectionPDFView, CollectionVideoView, WebBox, KeyValueBox, PDFBox, VideoBox, AudioBox }}
            bindings={this.props}
            jsx={this.props.layout}
            showWarnings={true}
            onError={(test: any) => { console.log(test) }}
        />
    }
}