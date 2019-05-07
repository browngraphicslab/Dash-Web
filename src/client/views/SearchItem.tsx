import React = require("react");
import { Doc } from "../../new_fields/Doc";

export interface SearchProps {
    doc: Doc;
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
                <div className="search-title">{this.props.doc.title}</div>
            </div>
        );
    }
} 