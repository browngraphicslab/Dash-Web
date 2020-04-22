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
import { ScriptField } from "../../../new_fields/ScriptField";
import XRegExp = require("xregexp");

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


interface HTMLtagProps {
    Document: Doc;
    htmltag: string;
    onClick?: ScriptField;
}
//"<HTMLdiv borderRadius='100px' onClick={this.bannerColor=this.bannerColor==='red'?'green':'red'} width='100%' height='100%' transform='rotate({2*this.x+this.y}deg)'><ImageBox {...props} fieldKey={'data'}/><HTMLspan width='100%'  marginTop='50%'  height='10%'  position='absolute' backgroundColor='{this.bannerColor===`green`?`dark`:`light`}grey'>{this.title}</HTMLspan></HTMLdiv>"@observer
export class HTMLtag extends React.Component<HTMLtagProps> {
    click = (e: React.MouseEvent) => {
        const clickScript = (this.props as any).onClick as Opt<ScriptField>;
        clickScript?.script.run({ this: this.props.Document });
    }
    render() {
        const style: { [key: string]: any } = {};
        const divKeys = OmitKeys(this.props, ["children", "htmltag", "Document", "key", "onClick", "__proto__"]).omit;
        Object.keys(divKeys).map((prop: string) => {
            let p = (this.props as any)[prop] as string;
            const replacer = (match: any, expr: string, offset: any, string: any) => { // bcz: extend this to support expression -- is this really a script?
                return ScriptField.MakeFunction(expr, { self: Doc.name, this: Doc.name })?.script.run({ this: this.props.Document }).result as string || "";
            };
            p = p?.replace(/{([^.'][^}']+)}/g, replacer);

            const replacer2 = (match: any, key: string, offset: any, string: any) => { // bcz: extend this to support expression -- is this really a script?
                const n = Cast(this.props.Document[key], "number", null);
                return n ? n.toString() : StrCast(this.props.Document[key], p);
            };
            style[prop] = p?.replace(/@([a-zA-Z0-9-_]+)/g, replacer2);

        });
        const Tag = this.props.htmltag as keyof JSX.IntrinsicElements;
        return <Tag style={style} onClick={this.click}>
            {this.props.children}
        </Tag>;
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

    CreateBindings(onClick: Opt<ScriptField>): JsxBindings {
        const list = {
            ...OmitKeys(this.props, ['parentActive'], (obj: any) => obj.active = this.props.parentActive).omit,
            Document: this.layoutDoc,
            DataDoc: this.dataDoc,
            onClick: onClick
        };
        return { props: list };
    }

    render() {
        TraceMobx();
        let layoutFrame = this.layout;

        // replace code content with a script  >{content}<   as in  <HTMLdiv>{this.title}</HTMLdiv>
        const replacer = (match: any, expr: string, offset: any, string: any) => {
            return ">" + (ScriptField.MakeFunction(expr, { self: Doc.name, this: Doc.name })?.script.run({ this: this.props.Document }).result as string || "") + "<";
        };
        layoutFrame = layoutFrame.replace(/>\{([^.'][^<}]+)\}</g, replacer);

        // replace HTML<tag> with corresponding HTML tag as in:  <HTMLdiv> becomes  <HTMLtag Document={props.Document} htmltag='div'> 
        const replacer2 = (match: any, p1: string, offset: any, string: any) => {
            return `<HTMLtag Document={props.Document} htmltag='${p1}'`;
        };
        layoutFrame = layoutFrame.replace(/<HTML([a-zA-Z0-9_-]+)/g, replacer2);

        // replace /HTML<tag> with </HTMLdiv>  as in:  </HTMLdiv> becomes  </HTMLtag> 
        const replacer3 = (match: any, p1: string, offset: any, string: any) => {
            return `</HTMLtag`;
        };
        layoutFrame = layoutFrame.replace(/<\/HTML([a-zA-Z0-9_-]+)/g, replacer3);

        // add onClick function to props
        const splits = layoutFrame.split("onClick=");
        let onClick: Opt<ScriptField>;
        if (splits.length > 1) {
            const code = XRegExp.matchRecursive(splits[1], "{", "}", "", { valueNames: ["between", "left", "match", "right", "between"] });
            layoutFrame = splits[0] + " onClick={props.onClick} " + splits[1].substring(code[1].end + 1);
            onClick = ScriptField.MakeScript(code[1].value, { this: Doc.name, self: Doc.name });
        }

        const bindings = this.CreateBindings(onClick);
        //  layoutFrame = splits.length > 1 ? splits[0] + splits[1].replace(/{([^{}]|(?R))*}/, replacer4) : ""; // might have been more elegant if javascript supported recursive patterns

        return (this.props.renderDepth > 12 || !layoutFrame || !this.layoutDoc) ? (null) :
            this.props.forceLayout === "FormattedTextBox" && this.props.forceFieldKey ?
                <FormattedTextBox {...bindings.props} fieldKey={this.props.forceFieldKey} />
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
                        RecommendationsBox, ScreenshotBox, HTMLtag
                    }}
                    bindings={bindings}
                    jsx={layoutFrame}
                    showWarnings={true}

                    onError={(test: any) => { console.log(test); }}
                />;
    }
}