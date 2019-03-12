import React = require("react");
import { observable, action } from "mobx";
import { observer } from "mobx-react";

export interface OriginalMenuProps {
    description: string;
    event: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export interface SubmenuProps {
    description: string;
    subitems: ContextMenuProps[];
}

export type ContextMenuProps = OriginalMenuProps | SubmenuProps;

@observer
export class ContextMenuItem extends React.Component<ContextMenuProps> {
    @observable private _items: Array<ContextMenuProps> = [];
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
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
                    <div className="contextMenu-description"> {this.props.description}</div>
                </div>)
        }
        else {
            let submenu = null;
            if (this.overItem) {
                submenu = (<div className="subMenu-cont" style={{ left: this._pageX, top: this._pageY, marginLeft: "47.5%" }}>
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