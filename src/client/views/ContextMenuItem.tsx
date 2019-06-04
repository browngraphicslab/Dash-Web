import React = require("react");
import { observable, action } from "mobx";
import { observer } from "mobx-react";
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export interface OriginalMenuProps {
    description: string;
    event: (e: React.MouseEvent<HTMLDivElement>) => void;
    icon?: IconProp; //maybe should be optional (icon?)
    closeMenu?: () => void;
}

export interface SubmenuProps {
    description: string;
    subitems: ContextMenuProps[];
    closeMenu?: () => void;
}

export interface ContextMenuItemProps {
    type: ContextMenuProps | SubmenuProps;
}
export type ContextMenuProps = OriginalMenuProps | SubmenuProps;

@observer
export class ContextMenuItem extends React.Component<ContextMenuProps> {
    @observable private _items: Array<ContextMenuProps> = [];
    @observable private overItem = false;

    constructor(props: ContextMenuProps | SubmenuProps) {
        super(props);
        if ("subitems" in this.props) {
            this.props.subitems.forEach(i => this._items.push(i));
        }
    }

    handleEvent = (e: React.MouseEvent<HTMLDivElement>) => {
        if ("event" in this.props) {
            this.props.event(e);
            this.props.closeMenu && this.props.closeMenu();
        }
    }

    render() {
        if ("event" in this.props) {
            return (
                <div className="contextMenu-item" onClick={this.handleEvent}>
                    <span className="icon-background">
                        {this.props.icon ? <FontAwesomeIcon icon={this.props.icon} size="sm" /> : <FontAwesomeIcon icon="circle" size="sm" />}
                    </span>
                    <div className="contextMenu-description">
                        {this.props.description}
                    </div>
                </div>
            );
        }
        else {
            let submenu = !this.overItem ? (null) :
                <div className="contextMenu-subMenu-cont" style={{ marginLeft: "100.5%", left: "0px" }}>
                    {this._items.map(prop => <ContextMenuItem {...prop} key={prop.description} closeMenu={this.props.closeMenu} />)}
                </div>;
            return (
                <div className="contextMenu-item" onMouseEnter={action(() => { this.overItem = true; })} onMouseLeave={action(() => this.overItem = false)}>
                    <div className="contextMenu-description">
                        {this.props.description}
                    </div>
                    {submenu}
                </div>
            );
        }
    }
}