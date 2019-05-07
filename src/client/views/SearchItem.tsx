import React = require("react");
import { Doc } from "../../new_fields/Doc";
import { DocumentManager } from "../util/DocumentManager";

export interface SearchProps {
    doc: Doc;
}

export class SearchItem extends React.Component<SearchProps> {

    onClick = () => {
        DocumentManager.Instance.jumpToDocument(this.props.doc)
    }

    render() {
        return (
            <div className="search-item" onClick={this.onClick}>
                <div className="search-title">{this.props.doc.title}</div>
            </div>
        );
    }
} 