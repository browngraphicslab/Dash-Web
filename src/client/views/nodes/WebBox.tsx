import "./WebBox.scss";
import React = require("react")
import { WebField } from '../../../fields/WebField';
import { FieldViewProps, FieldView } from './FieldView';
import { FieldWaiting } from '../../../fields/Field';
import { observer } from "mobx-react"
import { computed } from 'mobx';
import { KeyStore } from '../../../fields/KeyStore';

@observer
export class WebBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(WebBox); }

    constructor(props: FieldViewProps) {
        super(props);
    }

    @computed get html(): string { return this.props.Document.GetHtml(KeyStore.Data, ""); }

    render() {
        let field = this.props.Document.Get(this.props.fieldKey);
        let path = field == FieldWaiting ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
            field instanceof WebField ? field.Data.href : "https://crossorigin.me/" + "https://cs.brown.edu";

        let content = this.html ?
            <span dangerouslySetInnerHTML={{ __html: this.html }}></span> :
            <div style={{ width: "100%", height: "100%", position: "absolute" }}>
                <iframe src={path} style={{ position: "absolute", width: "100%", height: "100%" }}></iframe>
                {this.props.isSelected() ? (null) : <div style={{ width: "100%", height: "100%", position: "absolute" }} />}
            </div>;

        return (
            <div className="webBox-cont"  >
                {content}
            </div>)
    }
}