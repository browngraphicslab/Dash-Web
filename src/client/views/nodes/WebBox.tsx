import { observer } from "mobx-react";
import { HtmlField } from "../../../new_fields/HtmlField";
import { WebField } from "../../../new_fields/URLField";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from './FieldView';
import "./WebBox.scss";
import React = require("react");
import { InkTool } from "../../../new_fields/InkField";
import { Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { Utils } from "../../../Utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { observable, action, computed } from "mobx";
import { listSpec } from "../../../new_fields/Schema";
import { Field, FieldResult, Doc, Opt } from "../../../new_fields/Doc";
import { RefField } from "../../../new_fields/RefField";
import { ObjectField } from "../../../new_fields/ObjectField";
import { updateSourceFile } from "typescript";
import { KeyValueBox } from "./KeyValueBox";
import { setReactionScheduler } from "mobx/lib/internal";
import { library } from "@fortawesome/fontawesome-svg-core";
import { Docs } from "../../documents/Documents";
import { PreviewCursor } from "../PreviewCursor";
import { SelectionManager } from "../../util/SelectionManager";
import { CollectionView } from "../collections/CollectionView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";

library.add(faStickyNote)

@observer
export class WebBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(WebBox); }
    @observable private collapsed: boolean = true;
    @observable private url: string = "";

    componentWillMount() {

        let field = Cast(this.props.Document[this.props.fieldKey], WebField);
        if (field && field.url.href.indexOf("youtube") !== -1) {
            let youtubeaspect = 400 / 315;
            var nativeWidth = NumCast(this.props.Document.nativeWidth, 0);
            var nativeHeight = NumCast(this.props.Document.nativeHeight, 0);
            if (!nativeWidth || !nativeHeight || Math.abs(nativeWidth / nativeHeight - youtubeaspect) > 0.05) {
                if (!nativeWidth) this.props.Document.nativeWidth = 600;
                this.props.Document.nativeHeight = NumCast(this.props.Document.nativeWidth) / youtubeaspect;
                this.props.Document.height = NumCast(this.props.Document.width) / youtubeaspect;
            }
        }

        this.setURL();
    }

    @action
    onURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.url = e.target.value;
    }

    @action
    submitURL = () => {
        const script = KeyValueBox.CompileKVPScript(`new WebField("${this.url}")`);
        if (!script) return;
        KeyValueBox.ApplyKVPScript(this.props.Document, "data", script);
    }

    @action
    setURL() {
        let urlField: FieldResult<WebField> = Cast(this.props.Document.data, WebField)
        if (urlField) this.url = urlField.url.toString();
        else this.url = "";
    }

    onValueKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.stopPropagation();
            this.submitURL();
        }
    }


    switchToText = () => {
        let url: string = "";
        let field = Cast(this.props.Document[this.props.fieldKey], WebField);
        if (field) url = field.url.href;

        let parent: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
        // let parentDoc: any;
        SelectionManager.SelectedDocuments().map(dv => {
            parent = dv.props.ContainingCollectionView;
            // if(parent) parentDoc = parent.props.Document;
            dv.props.removeDocument && dv.props.removeDocument(dv.props.Document);
        });

        // // let newPoint = PreviewCursor._getTransform().transformPoint(PreviewCursor._clickPoint[0], PreviewCursor._clickPoint[1]);
        let newBox = Docs.Create.TextDocument({
            width: 200, height: 100,
            // x: newPoint[0],
            // y: newPoint[1],
            x: NumCast(this.props.Document.x),
            y: NumCast(this.props.Document.y),
            title: url
        });

        console.log(newBox)
        if (parent) {
            let parentDoc: Doc = parent.props.Document;
            if (parentDoc && parentDoc.props) {
                parentDoc.props.addDocument();
            }
        }

        newBox.proto!.autoHeight = true;
        // PreviewCursor._addLiveTextDoc(newBox);
        // if (parent && parent.props.addDocument) {
        //     console.log("adding doc")
        //     parent.props.addDocument(newBox);
        // }
        return;
    }

    urlEditor() {
        return (
            <div className="webView-urlEditor" style={{ top: this.collapsed ? -70 : 0 }}>
                <div className="urlEditor">
                    <div className="collectionViewBaseChrome">
                        <button className="collectionViewBaseChrome-collapse"
                            style={{
                                top: this.collapsed ? 70 : 10,
                                transform: `rotate(${this.collapsed ? 180 : 0}deg) scale(${this.collapsed ? 0.5 : 1}) translate(${this.collapsed ? "-100%, -100%" : "0, 0"})`,
                                opacity: (this.collapsed && !this.props.isSelected()) ? 0 : 0.9,
                                left: (this.collapsed ? 0 : "unset"),
                            }}
                            title="Collapse Url Editor" onClick={this.toggleCollapse}>
                            <FontAwesomeIcon icon="caret-up" size="2x" />
                        </button>
                        <div style={{ marginLeft: 54, width: "100%", display: this.collapsed ? "none" : "flex" }}>
                            <input className="webpage-urlInput"
                                placeholder="ENTER URL"
                                value={this.url}
                                onChange={this.onURLChange}
                                onKeyDown={this.onValueKeyDown}
                            />
                            <div style={{
                                display: "flex",
                                flexDirection: "row",

                            }}>
                                <button className="submitUrl" onClick={this.submitURL}>
                                    SUBMIT URL
                            </button>
                                <button className="switchToText" onClick={this.switchToText} style={{ paddingLeft: 10 }} >
                                    <FontAwesomeIcon icon={faStickyNote} size={"2x"} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    @action
    toggleCollapse = () => {
        this.collapsed = !this.collapsed;
    }

    _ignore = 0;
    onPreWheel = (e: React.WheelEvent) => {
        this._ignore = e.timeStamp;
    }
    onPrePointer = (e: React.PointerEvent) => {
        this._ignore = e.timeStamp;
    }
    onPostPointer = (e: React.PointerEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }
    onPostWheel = (e: React.WheelEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }
    render() {
        let field = this.props.Document[this.props.fieldKey];
        let view;
        if (field instanceof HtmlField) {
            view = <span id="webBox-htmlSpan" dangerouslySetInnerHTML={{ __html: field.html }} />;
        } else if (field instanceof WebField) {
            view = <iframe src={Utils.CorsProxy(field.url.href)} style={{ position: "absolute", width: "100%", height: "100%", top: 0 }} />;
        } else {
            view = <iframe src={"https://crossorigin.me/https://cs.brown.edu"} style={{ position: "absolute", width: "100%", height: "100%", top: 0 }} />;
        }
        let content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {this.urlEditor()}
                {view}
            </div>;

        let frozen = !this.props.isSelected() || DocumentDecorations.Instance.Interacting;

        let classname = "webBox-cont" + (this.props.isSelected() && InkingControl.Instance.selectedTool === InkTool.None && !DocumentDecorations.Instance.Interacting ? "-interactive" : "");
        return (
            <>
                <div className={classname}  >
                    {content}
                </div>
                {!frozen ? (null) : <div className="webBox-overlay" onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer} />}
            </>);
    }
}