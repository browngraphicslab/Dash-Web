import { Doc } from "../../new_fields/Doc";
import React = require("react");
import "./SearchBox.scss";

export interface ViewitemProps {
    doc: Doc;
    // subitems: FieldViewProps;
}

export class ViewItem extends React.Component<ViewitemProps> {

    render() {
        return (
            <div>{this.props.doc.title}</div>

        );
    }
}