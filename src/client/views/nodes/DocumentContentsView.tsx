import { computed, trace } from "mobx";
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
import { DragBox } from "./DragBox";
import { ButtonBox } from "./ButtonBox";
import { PresBox } from "./PresBox";
import { IconBox } from "./IconBox";
import { KeyValueBox } from "./KeyValueBox";
import { PDFBox } from "./PDFBox";
import { VideoBox } from "./VideoBox";
import { FieldView } from "./FieldView";
import { WebBox } from "./WebBox";
import { YoutubeBox } from "./../../apis/youtube/YoutubeBox";
import { HistogramBox } from "../../northstar/dash-nodes/HistogramBox";
import React = require("react");
import { FieldViewProps } from "./FieldView";
import { Without, OmitKeys } from "../../../Utils";
import { Cast, StrCast, NumCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { Doc } from "../../../new_fields/Doc";
import DirectoryImportBox from "../../util/Import & Export/DirectoryImportBox";
import { RecommendationsBox } from "../../views/Recommendations";
import { ScriptField } from "../../../new_fields/ScriptField";
const JsxParser = require('react-jsx-parser').default; //TODO Why does this need to be imported like this?

type BindingProps = Without<FieldViewProps, 'fieldKey'>;
export interface JsxBindings {
    props: BindingProps;
}

class ObserverJsxParser1 extends JsxParser {
    constructor(props: any) {
        super(props);
        observer(this as any);
    }
}

const ObserverJsxParser: typeof JsxParser = ObserverJsxParser1 as any;

@observer
export class DocumentContentsView extends React.Component<DocumentViewProps & {
    isSelected: () => boolean,
    select: (ctrl: boolean) => void,
    onClick?: ScriptField,
    layoutKey: string,
    hideOnLeave?: boolean
}> {
    @computed get layout(): string {
        const layout = Cast(this.layoutDoc[this.props.layoutKey], "string");
        if (layout === undefined) {
            return this.props.Document.data ?
                "<FieldView {...props} fieldKey='data' />" :
                KeyValueBox.LayoutString(this.layoutDoc.proto ? "proto" : "");
        } else if (typeof layout === "string") {
            return layout;
        } else {
            return "<p>Loading layout</p>";
        }
    }

    get dataDoc() {
        if (this.props.DataDoc === undefined && (this.props.Document.layout instanceof Doc || this.props.Document instanceof Promise)) {
            // if there is no dataDoc (ie, we're not rendering a template layout), but this document
            // has a template layout document, then we will render the template layout but use 
            // this document as the data document for the layout.
            return this.props.Document;
        }
        return this.props.DataDoc;
    }
    get layoutDoc() {
        // if this document's layout field contains a document (ie, a rendering template), then we will use that
        // to determine the render JSX string, otherwise the layout field should directly contain a JSX layout string.
        return this.props.Document.layout instanceof Doc ? this.props.Document.layout : this.props.Document;
    }

    CreateBindings(): JsxBindings {
        let list = {
            ...OmitKeys(this.props, ['parentActive'], (obj: any) => obj.active = this.props.parentActive).omit,
            Document: this.layoutDoc,
            DataDoc: this.dataDoc
        };
        return { props: list };
    }

    @computed get templates(): List<string> {
        let field = this.props.Document.templates;
        if (field && field instanceof List) {
            return field;
        }
        return new List<string>();
    }
    @computed get finalLayout() {
        return this.props.layoutKey === "overlayLayout" ? "<div/>" : this.layout;
    }

    render() {
        let self = this;
        if (this.props.renderDepth > 7) return (null);
        if (!this.layout && (this.props.layoutKey !== "overlayLayout" || !this.templates.length)) return (null);
        return <ObserverJsxParser
            blacklistedAttrs={[]}
            components={{ FormattedTextBox, ImageBox, RecommendationsBox, IconBox, DirectoryImportBox, DragBox, ButtonBox, FieldView, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, CollectionPDFView, CollectionVideoView, WebBox, KeyValueBox, PDFBox, VideoBox, AudioBox, HistogramBox, PresBox, YoutubeBox }}
            bindings={this.CreateBindings()}
            jsx={this.finalLayout}
            showWarnings={true}

            onError={(test: any) => { console.log(test); }}
        />;
    }
}