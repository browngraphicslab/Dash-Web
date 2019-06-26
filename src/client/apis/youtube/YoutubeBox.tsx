import "../../views/nodes/WebBox.scss";
import React = require("react");
import { FieldViewProps, FieldView } from "../../views/nodes/FieldView";
import { HtmlField } from "../../../new_fields/HtmlField";
import { WebField } from "../../../new_fields/URLField";
import { observer } from "mobx-react";
import { computed, reaction, IReactionDisposer } from 'mobx';
import { DocumentDecorations } from "../../views/DocumentDecorations";
import { InkingControl } from "../../views/InkingControl";
import { Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";


@observer
export class YoutubeBox extends React.Component<FieldViewProps> {


    public static LayoutString() { return FieldView.LayoutString(YoutubeBox); }

    componentWillMount() {
        DocServer.getYoutubeChannels();
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
            view = <iframe src={field.url.href} style={{ position: "absolute", width: "100%", height: "100%" }} />;
        } else {
            view = <iframe src={"https://crossorigin.me/https://cs.brown.edu"} style={{ position: "absolute", width: "100%", height: "100%" }} />;
        }
        let content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {view}
            </div>;

        let frozen = !this.props.isSelected() || DocumentDecorations.Instance.Interacting;

        let classname = "webBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool && !DocumentDecorations.Instance.Interacting ? "-interactive" : "");
        return (
            <>
                <div className={classname}  >
                    {content}
                </div>
                {!frozen ? (null) : <div className="webBox-overlay" onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer} />}
            </>);
    }
}