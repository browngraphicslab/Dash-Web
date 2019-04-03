import { observer } from "mobx-react";
import { observable } from "mobx";
import { InkingControl } from "./InkingControl";
import { InkTool } from "../../fields/InkField";
import React = require("react");


interface StrokeProps {
    id: string;
    line: Array<{ x: number, y: number }>;
    color: string;
    width: string;
    tool: InkTool;
    deleteCallback: (index: string) => void;
}

@observer
export class InkingStroke extends React.Component<StrokeProps> {

    @observable private _strokeTool: InkTool = this.props.tool;
    @observable private _strokeColor: string = this.props.color;
    @observable private _strokeWidth: string = this.props.width;

    deleteStroke = (e: React.PointerEvent): void => {
        if (InkingControl.Instance.selectedTool === InkTool.Eraser && e.buttons === 1) {
            this.props.deleteCallback(this.props.id);
        }
    }

    parseData = (line: Array<{ x: number, y: number }>): string => {
        return !line.length ? "" : "M " + line.map(p => p.x + " " + p.y).join(" L ");
    }

    createStyle() {
        switch (this._strokeTool) {
            // add more tool styles here
            default:
                return {
                    fill: "none",
                    stroke: this._strokeColor,
                    strokeWidth: this._strokeWidth + "px",
                }
        }
    }


    render() {
        let pathStyle = this.createStyle();
        let pathData = this.parseData(this.props.line);

        let pointerEvents: any = InkingControl.Instance.selectedTool == InkTool.Eraser ? "all" : "none";
        return (
            <path className={(this._strokeTool === InkTool.Highlighter) ? "highlight" : "normal"}
                d={pathData} style={{ ...pathStyle, pointerEvents: pointerEvents }} strokeLinejoin="round" strokeLinecap="round"
                onPointerOver={this.deleteStroke} onPointerDown={this.deleteStroke} />
        )
    }
}