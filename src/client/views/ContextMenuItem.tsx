import React = require("react");

export interface ContextMenuProps {
    description: string;
    event: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export interface SubmenuProps {
    description: string;
    subitems: ContextMenuProps[];
}

export interface ContextMenuItemProps {
    type: ContextMenuProps | SubmenuProps;
}

export class ContextMenuItem extends React.Component<ContextMenuProps> {
    render() {
        return (
            <div className="contextMenu-item" onClick={this.props.event}>
                <div className="contextMenu-description">{this.props.description}</div>
            </div>
        );
    }
}