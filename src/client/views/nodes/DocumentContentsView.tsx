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
import { IconBox } from "./IconBox";
import { KeyValueBox } from "./KeyValueBox";
import { PDFBox } from "./PDFBox";
import { VideoBox } from "./VideoBox";
import { FieldView } from "./FieldView";
import { WebBox } from "./WebBox";
import { HistogramBox } from "../../northstar/dash-nodes/HistogramBox";
import React = require("react");
import { FieldViewProps } from "./FieldView";
import { Without, OmitKeys } from "../../../Utils";
import { Cast, StrCast, NumCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
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
    layoutKey: string,
}> {
    @computed get layout(): string {
        const layout = Cast(this.props.Document[this.props.layoutKey], "string");
        if (layout === undefined) {
            return this.props.Document.data ?
                "<FieldView {...props} fieldKey='data' />" :
                KeyValueBox.LayoutString(this.props.Document.proto ? "proto" : "");
        } else if (typeof layout === "string") {
            return layout;
        } else {
            return "<p>Loading layout</p>";
        }
    }

    CreateBindings(): JsxBindings {
        return { props: OmitKeys(this.props, ['parentActive'], (obj: any) => obj.active = this.props.parentActive).omit };
    }

    @computed get templates(): List<string> {
        let field = this.props.Document.templates;
        if (field && field instanceof List) {
            return field;
        }
        return new List<string>();
    }
    @computed get finalLayout() {
        const baseLayout = this.props.layoutKey === "overlayLayout" ? "<div/>" : this.layout;
        let base = baseLayout;
        let layout = baseLayout;

        // bcz: templates are intended only for a document's primary layout or overlay (not background).  However, 
        // a DocumentContentsView is used to render  annotation overlays, so we detect that here 
        // by checking the layoutKey.  This should probably be moved into
        // a prop so that the overlay can explicitly turn off templates.
        if ((this.props.layoutKey === "overlayLayout" && StrCast(this.props.Document.layout).indexOf("CollectionView") !== -1) ||
            (this.props.layoutKey === "layout" && StrCast(this.props.Document.layout).indexOf("CollectionView") === -1)) {
            this.templates.forEach(template => {
                let self = this;
                // this scales constants in the markup by the scaling applied to the document, but caps the constants to be smaller
                // than the width/height of the containing document
                function convertConstantsToNative(match: string, offset: number, x: string) {
                    let px = Number(match.replace("px", ""));
                    return `${Math.min(NumCast(self.props.Document.height, 0),
                        Math.min(NumCast(self.props.Document.width, 0),
                            px * self.props.ScreenToLocalTransform().Scale))}px`;
                }
                // let nativizedTemplate = template.replace(/([0-9]+)px/g, convertConstantsToNative);
                // layout = nativizedTemplate.replace("{layout}", base);
                layout = template.replace("{layout}", base);
                base = layout;
            });
        }
        return layout;
    }

    render() {
        if (!this.layout && (this.props.layoutKey !== "overlayLayout" || !this.templates.length)) return (null);
        return <ObserverJsxParser
            components={{ FormattedTextBox, ImageBox, IconBox, FieldView, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, CollectionPDFView, CollectionVideoView, WebBox, KeyValueBox, PDFBox, VideoBox, AudioBox, HistogramBox }}
            bindings={this.CreateBindings()}
            jsx={this.finalLayout}
            showWarnings={true}
            onError={(test: any) => { console.log(test); }}
        />;
    }
}