import React = require("react");
import { observable, action } from "mobx";
import { observer } from "mobx-react";
import { library, IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export interface OriginalMenuProps {
    description: string;
    event: (e: React.MouseEvent<HTMLDivElement>) => void;
    icon: IconProp; //maybe should be optional (icon?)
}

export interface SubmenuProps {
    description: string;
    subitems: ContextMenuProps[];
}

export type ContextMenuProps = OriginalMenuProps | SubmenuProps;

@observer
export class ContextMenuItem extends React.Component<ContextMenuProps> {
    @observable private _items: Array<ContextMenuProps> = [];
    @observable private overItem = false;

    constructor(props: ContextMenuProps) {
        super(props);
        if ("subitems" in this.props) {
            this.props.subitems.forEach(i => this._items.push(i));
        }
    }

    render() {
        if ("event" in this.props) {
            return (
                <div className="contextMenu-item" onClick={this.props.event}>
                    <span className="icon-background">
                        <FontAwesomeIcon icon="circle" size="sm" />
                        <FontAwesomeIcon icon={this.props.icon} size="sm" />
                    </span>
                    <div className="contextMenu-description"> {this.props.description}</div>
                </div>)
        }
        else {
            let submenu = null;
            if (this.overItem) {
                submenu = (<div className="subMenu-cont" style={{ marginLeft: "100.5%", left: "0px" }}>
                    {this._items.map(prop => {
                        return <ContextMenuItem {...prop} key={prop.description} />
                    })}
                </div>)
            }
            return (
                <div className="contextMenu-item" onMouseEnter={action(() => {
                    this.overItem = true
                })} onMouseLeave={action(() => this.overItem = false)}>
                    <div className="contextMenu-description"> {this.props.description}</div>
                    {submenu}
                </div>)
        }
    }
}