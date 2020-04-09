import React = require("react");
import { computed } from "mobx";
import { observer } from "mobx-react";

export interface TouchScrollableMenuProps {
    options: JSX.Element[];
    bounds: {
        right: number;
        left: number;
        bottom: number;
        top: number;
        width: number;
        height: number;
    };
    selectedIndex: number;
    x: number;
    y: number;
}

export interface TouchScrollableMenuItemProps {
    text: string;
    onClick: () => any;
}

@observer
export default class TouchScrollableMenu extends React.Component<TouchScrollableMenuProps> {

    @computed
    private get possibilities() { return this.props.options; }

    @computed
    private get selectedIndex() { return this.props.selectedIndex; }

    render() {
        return (
            <div className="inkToTextDoc-cont" style={{
                transform: `translate(${this.props.x}px, ${this.props.y}px)`,
                width: 300,
                height: this.possibilities.length * 25
            }}>
                <div className="inkToTextDoc-scroller" style={{ transform: `translate(0, ${-this.selectedIndex * 25}px)` }}>
                    {this.possibilities}
                </div>
                <div className="shadow" style={{ height: `calc(100% - 25px - ${this.selectedIndex * 25}px)` }}>
                </div>
            </div>
        );
    }
}

export class TouchScrollableMenuItem extends React.Component<TouchScrollableMenuItemProps>{
    render() {
        return (
            <div className="menuItem-cont" onClick={this.props.onClick}>
                {this.props.text}
            </div>
        );
    }
}