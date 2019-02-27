import { FieldViewProps, FieldView } from "./FieldView";
import { computed } from "mobx";
import { observer } from "mobx-react";
import { KeyStore } from "../../../fields/KeyStore";
import React = require('react')
import { HtmlField } from "../../../fields/HtmlField";

@observer
export class WebView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(WebView, fieldStr) }

    @computed
    get html(): string {
        return this.props.doc.GetData(KeyStore.Data, HtmlField, "" as string);
    }

    render() {
        return <span dangerouslySetInnerHTML={{ __html: this.html }}></span>
    }
}