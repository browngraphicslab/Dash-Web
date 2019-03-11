import React = require("react");
import { observable, action } from "mobx";

export interface OriginalMenuProps {
    description: string;
    event: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export interface SubmenuProps {
    description: string;
    subitems: OriginalMenuProps[];
}

export type ContextMenuProps = OriginalMenuProps | SubmenuProps;

export class ContextMenuItem extends React.Component<ContextMenuProps> {
    @observable private _items: Array<ContextMenuProps> = [{ description: "test", event: (e: React.MouseEvent) => e.preventDefault() }];
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _display: string = "none";
    @observable private overItem = false;

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
                submenu = (<div className="subMenu-cont" style={{ left: this._pageX, marginLeft: "100%", top: this._pageY, display: this._display }}>
                    {this._items.map(prop => {
                        return <ContextMenuItem {...prop} key={prop.description} />
                    })}
                </div>)
            }
            return (
                <div className="contextMenu-item" onMouseEnter={action(() => this.overItem = true)} onMouseLeave={action(() => this.overItem = false)}>
                    <div className="contextMenu-description"> {this.props.description}</div>
                    {submenu}
                </div>)
        }
    }
}