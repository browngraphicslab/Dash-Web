import React = require("react");
import { Document } from "../../fields/Document";

export interface SearchProps {
    doc: Document;
    //description: string;
    //event: (e: React.MouseEvent<HTMLDivElement>) => void;
}

// export interface SubmenuProps {
//     description: string;
//     subitems: ContextMenuProps[];
// }

// export interface ContextMenuItemProps {
//     type: ContextMenuProps | SubmenuProps;
// }



export class SearchItem extends React.Component<SearchProps> {

    onClick = () => {
        console.log("document clicked: ", this.props.doc);
    }

    render() {
        return (
            <div className="search-item" onClick={this.onClick}>
                <div className="search-title">{this.props.doc.Title}</div>
            </div>
        );
    }
}