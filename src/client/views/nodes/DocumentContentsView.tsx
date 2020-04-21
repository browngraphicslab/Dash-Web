import { computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, Opt, Field } from "../../../new_fields/Doc";
import { Cast, StrCast, NumCast } from "../../../new_fields/Types";
import { OmitKeys, Without, emptyPath } from "../../../Utils";
import DirectoryImportBox from "../../util/Import & Export/DirectoryImportBox";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionView } from "../collections/CollectionView";
import { YoutubeBox } from "./../../apis/youtube/YoutubeBox";
import { AudioBox } from "./AudioBox";
import { LabelBox } from "./LabelBox";
import { SliderBox } from "./SliderBox";
import { LinkBox } from "./LinkBox";
import { ScriptingBox } from "./ScriptingBox";
import { DocHolderBox } from "./DocumentBox";
import { DocumentViewProps } from "./DocumentView";
import "./DocumentView.scss";
import { FontIconBox } from "./FontIconBox";
import { FieldView, FieldViewProps } from "./FieldView";
import { FormattedTextBox } from "./FormattedTextBox";
import { ImageBox } from "./ImageBox";
import { KeyValueBox } from "./KeyValueBox";
import { PDFBox } from "./PDFBox";
import { PresBox } from "./PresBox";
import { QueryBox } from "./QueryBox";
import { ColorBox } from "./ColorBox";
import { DashWebRTCVideo } from "../webcam/DashWebRTCVideo";
import { LinkAnchorBox } from "./LinkAnchorBox";
import { PresElementBox } from "../presentationview/PresElementBox";
import { ScreenshotBox } from "./ScreenshotBox";
import { VideoBox } from "./VideoBox";
import { WebBox } from "./WebBox";
import { InkingStroke } from "../InkingStroke";
import React = require("react");
import { RecommendationsBox } from "../RecommendationsBox";

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


interface DivProps {
    Document: Doc;
}

@observer
export class Div extends React.Component<DivProps> {
    render() {
        const style: { [key: string]: any } = {};
        const divKeys = OmitKeys(this.props, ["children", "Document", "key", "__proto__"]).omit;
        Object.keys(divKeys).map((prop: string) => {
            let p = (this.props as any)[prop] as string;
            if (p?.startsWith("@")) {  // bcz: extend this to support expression -- is this really a script?
                const key = p.substring(1);
                const n = Cast(this.props.Document[key], "number", null);
                p = n ? n.toString() : StrCast(this.props.Document[key], p);
            }
            style[prop] = p;
        });
        return <div style={style}>
            {this.props.children}
        </div>;
    }
}

@observer
export class DocumentContentsView extends React.Component<DocumentViewProps & {
    isSelected: (outsideReaction: boolean) => boolean,
    select: (ctrl: boolean) => void,
    layoutKey: string,
    forceLayout?: string,
    forceFieldKey?: string,
    hideOnLeave?: boolean,
    makeLink?: () => Opt<Doc>,  // function to call when a link is made
}> {
    @computed get layout(): string {
        TraceMobx();
        if (!this.layoutDoc) return "<p>awaiting layout</p>";
        const layout = Cast(this.layoutDoc[StrCast(this.layoutDoc.layoutKey, this.layoutDoc === this.props.Document ? this.props.layoutKey : "layout")], "string");
        if (this.props.layoutKey === "layout_keyValue") {
            return StrCast(this.props.Document.layout_keyValue, KeyValueBox.LayoutString("data"));
        } else
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
        const proto = this.props.DataDoc || Doc.GetProto(this.props.Document);
        return proto instanceof Promise ? undefined : proto;
    }
    get layoutDoc() {
        const params = StrCast(this.props.Document.PARAMS);
        const template: Doc = this.props.LayoutDoc?.() || Doc.Layout(this.props.Document, this.props.layoutKey ? Cast(this.props.Document[this.props.layoutKey], Doc, null) : undefined);
        return Doc.expandTemplateLayout(template, this.props.Document, params ? "(" + params + ")" : this.props.layoutKey);
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
        let layoutFrame = this.layout;
        const replacer = (match: any, p1: string, offset: any, string: any) => {
            const n = Cast(this.props.Document[p1], "number", null);
            return n !== undefined ? n.toString() : StrCast(this.props.Document[p1], p1);
        };
        layoutFrame = layoutFrame.replace(/\{([a-zA-Z0-9_-]+)\}/g, replacer);
        return (this.props.renderDepth > 12 || !layoutFrame || !this.layoutDoc) ? (null) :
            this.props.forceLayout === "FormattedTextBox" && this.props.forceFieldKey ?
                <FormattedTextBox {...this.CreateBindings().props} fieldKey={this.props.forceFieldKey} />
                :
                <ObserverJsxParser
                    key={42}
                    blacklistedAttrs={[]}
                    renderInWrapper={false}
                    components={{
                        FormattedTextBox, ImageBox, DirectoryImportBox, FontIconBox, LabelBox, SliderBox, FieldView,
                        CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, WebBox, KeyValueBox,
                        PDFBox, VideoBox, AudioBox, PresBox, YoutubeBox, PresElementBox, QueryBox,
                        ColorBox, DashWebRTCVideo, LinkAnchorBox, InkingStroke, DocHolderBox, LinkBox, ScriptingBox,
                        RecommendationsBox, ScreenshotBox, Div
                    }}
                    bindings={this.CreateBindings()}
                    jsx={layoutFrame}
                    showWarnings={true}

                    onError={(test: any) => { console.log(test); }}
                />;
    }
}