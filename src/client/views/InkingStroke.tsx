import { observer } from "mobx-react";
import { observable } from "mobx";
import { InkingControl } from "./InkingControl";
import { InkTool } from "../../fields/InkField";
import React = require("react");


interface StrokeProps {
    id: number;
    line: Array<{ x: number, y: number }>;
    color: string;
    width: string;
    tool: InkTool;
    deleteCallback: (index: number) => void;
}

@observer
export class InkingStroke extends React.Component<StrokeProps> {

    @observable private _strokeTool: InkTool = this.props.tool;
    @observable private _strokeColor: string = this.props.color;
    @observable private _strokeWidth: string = this.props.width;

    private _canvasColor: string = "#cdcdcd";

    deleteStroke = (e: React.MouseEvent): void => {
        if (InkingControl.getInstance().selectedTool === InkTool.Eraser && e.buttons === 1) {
            this.props.deleteCallback(this.props.id);
        }
    }

    parseData = (line: Array<{ x: number, y: number }>): string => {
        if (line.length === 0) {
            return "";
        }
        const pathData = "M " +
            line.map(p => {
                return p.x + " " + p.y;
            }).join(" L ");
        return pathData;
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

        return (
            <path className={(this._strokeTool === InkTool.Highlighter) ? "highlight" : ""}
                d={pathData} style={pathStyle} strokeLinejoin="round" strokeLinecap="round"
                onMouseOver={this.deleteStroke} onMouseDown={this.deleteStroke} />
        )
    }
}