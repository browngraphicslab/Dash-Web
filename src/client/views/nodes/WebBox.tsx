import "./WebBox.scss";
import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import { computed } from 'mobx';
import { HtmlField } from "../../../new_fields/HtmlField";
import { WebField } from "../../../new_fields/URLField";

@observer
export class WebBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(WebBox); }

    constructor(props: FieldViewProps) {
        super(props);
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
            view = <span id="webBox-htmlSpan" dangerouslySetInnerHTML={{ __html: field.html }} />
        } else if (field instanceof WebField) {
            view = <iframe src={field.url.href} style={{ position: "absolute", width: "100%", height: "100%" }} />
        } else {
            view = <iframe src={"https://crossorigin.me/https://cs.brown.edu"} style={{ position: "absolute", width: "100%", height: "100%" }} />
        }
        let content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {view}
            </div>;

        return (
            <>
                <div className="webBox-cont"  >
                    {content}
                </div>
                {this.props.isSelected() ? (null) : <div onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer} style={{ width: "100%", height: "100%", position: "absolute" }} />}
            </>);
    }
}