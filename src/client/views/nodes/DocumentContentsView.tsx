import { computed } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast } from "../../../new_fields/Types";
import { OmitKeys, Without } from "../../../Utils";
import { HistogramBox } from "../../northstar/dash-nodes/HistogramBox";
import DirectoryImportBox from "../../util/Import & Export/DirectoryImportBox";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionView } from "../collections/CollectionView";
import { LinkFollowBox } from "../linking/LinkFollowBox";
import { YoutubeBox } from "./../../apis/youtube/YoutubeBox";
import { AudioBox } from "./AudioBox";
import { ButtonBox } from "./ButtonBox";
import { DocumentViewProps } from "./DocumentView";
import "./DocumentView.scss";
import { FontIconBox } from "./FontIconBox";
import { FieldView, FieldViewProps } from "./FieldView";
import { FormattedTextBox } from "./FormattedTextBox";
import { IconBox } from "./IconBox";
import { ImageBox } from "./ImageBox";
import { KeyValueBox } from "./KeyValueBox";
import { PDFBox } from "./PDFBox";
import { PresBox } from "./PresBox";
import { QueryBox } from "./QueryBox";
import { ColorBox } from "./ColorBox";
import { DocuLinkBox } from "./DocuLinkBox";
import { PresElementBox } from "../presentationview/PresElementBox";
import { VideoBox } from "./VideoBox";
import { WebBox } from "./WebBox";
import React = require("react");
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

    @computed get finalLayout() {
        return this.props.layoutKey === "overlayLayout" ? "<div/>" : this.layout;
    }

    render() {
        let self = this;
        if (this.props.renderDepth > 7) return (null);
        if (!this.layout && this.props.layoutKey !== "overlayLayout") return (null);
        return <ObserverJsxParser
            blacklistedAttrs={[]}
            components={{
                FormattedTextBox, ImageBox, IconBox, DirectoryImportBox, FontIconBox: FontIconBox, ButtonBox, FieldView,
                CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, WebBox, KeyValueBox,
                PDFBox, VideoBox, AudioBox, HistogramBox, PresBox, YoutubeBox, LinkFollowBox, PresElementBox, QueryBox, ColorBox, DocuLinkBox
            }}
            bindings={this.CreateBindings()}
            jsx={this.finalLayout}
            showWarnings={true}

            onError={(test: any) => { console.log(test); }}
        />;
    }
}