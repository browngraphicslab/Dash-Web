import { computed } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast, StrCast } from "../../../new_fields/Types";
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
import { DocumentBox } from "./DocumentBox";
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
import { InkingStroke } from "../InkingStroke";
import React = require("react");
import { TraceMobx } from "../../../new_fields/util";
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
    isSelected: (outsideReaction: boolean) => boolean,
    select: (ctrl: boolean) => void,
    layoutKey: string,
}> {
    @computed get layout(): string {
        TraceMobx();
        if (!this.layoutDoc) return "<p>awaiting layout</p>";
        const layout = Cast(this.layoutDoc[StrCast(this.layoutDoc.layoutKey, this.layoutDoc === this.props.Document ? this.props.layoutKey : "layout")], "string");
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
        if (this.props.DataDoc === undefined && typeof Doc.LayoutField(this.props.Document) !== "string") {
            // if there is no dataDoc (ie, we're not rendering a template layout), but this document has a layout document (not a layout string), 
            // then we render the layout document as a template and use this document as the data context for the template layout.
            const proto = Doc.GetProto(this.props.Document);
            return proto instanceof Promise ? undefined : proto;
        }
        return this.props.DataDoc instanceof Promise ? undefined : this.props.DataDoc;
    }
    get layoutDoc() {
        if (this.props.DataDoc === undefined && typeof Doc.LayoutField(this.props.Document) !== "string") {
            // if there is no dataDoc (ie, we're not rendering a template layout), but this document has a layout document (not a layout string), 
            // then we render the layout document as a template and use this document as the data context for the template layout.
            return Doc.expandTemplateLayout(Doc.Layout(this.props.Document), this.props.Document);
        }
        return Doc.Layout(this.props.Document);
    }

    CreateBindings(): JsxBindings {
        const list = {
            ...OmitKeys(this.props, ['parentActive'], (obj: any) => obj.active = this.props.parentActive).omit,
            Document: this.layoutDoc,
            DataDoc: this.dataDoc,
        };
        return { props: list };
    }

    render() {
        TraceMobx();
        return (this.props.renderDepth > 7 || !this.layout || !this.layoutDoc) ? (null) :
            <ObserverJsxParser
                blacklistedAttrs={[]}
                components={{
                    FormattedTextBox, ImageBox, IconBox, DirectoryImportBox, FontIconBox: FontIconBox, ButtonBox, FieldView,
                    CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, WebBox, KeyValueBox,
                    PDFBox, VideoBox, AudioBox, HistogramBox, PresBox, YoutubeBox, LinkFollowBox, PresElementBox, QueryBox,
                    ColorBox, DocuLinkBox, InkingStroke, DocumentBox
                }}
                bindings={this.CreateBindings()}
                jsx={this.layout}
                showWarnings={true}

                onError={(test: any) => { console.log(test); }}
            />;
    }
}