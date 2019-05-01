import "./WebBox.scss";
import React = require("react");
import { WebField } from '../../../fields/WebField';
import { FieldViewProps, FieldView } from './FieldView';
import { FieldWaiting, Opt } from '../../../fields/Field';
import { observer } from "mobx-react";
import { computed, reaction, IReactionDisposer } from 'mobx';
import { KeyStore } from '../../../fields/KeyStore';
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";

@observer
export class WebBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(WebBox); }

    @computed get html(): string { return this.props.Document.GetHtml(KeyStore.Data, ""); }

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
        let field = this.props.Document.Get(this.props.fieldKey);
        let path = field === FieldWaiting ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
            field instanceof WebField ? field.Data.href : "https://crossorigin.me/" + "https://cs.brown.edu";

        let content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {this.html ? <span id="webBox-htmlSpan" dangerouslySetInnerHTML={{ __html: this.html }} /> :
                    <iframe src={path} style={{ position: "absolute", width: "100%", height: "100%" }} />}
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