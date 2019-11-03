import { observer } from "mobx-react";
import { observable, trace, runInAction } from "mobx";
import { InkingControl } from "./InkingControl";
import React = require("react");
import { InkTool } from "../../new_fields/InkField";
import "./InkingStroke.scss";
import { AudioBox } from "./nodes/AudioBox";
import { Doc } from "../../new_fields/Doc";


interface StrokeProps {
    offsetX: number;
    offsetY: number;
    id: string;
    count: number;
    line: Array<{ x: number, y: number }>;
    color: string;
    width: string;
    tool: InkTool;
    creationTime: number;
    deleteCallback: (index: string) => void;
}

export type InkDocAndStroke = {
    Document: Doc;
    Ink: Map<any, any>;
};

@observer
export class InkingStroke extends React.Component<StrokeProps> {

    @observable private _strokeTool: InkTool = this.props.tool;
    @observable private _strokeColor: string = this.props.color;
    @observable private _strokeWidth: string = this.props.width;

    deleteStroke = (e: React.PointerEvent): void => {
        if (InkingControl.Instance.selectedTool === InkTool.Eraser && e.buttons === 1) {
            this.props.deleteCallback(this.props.id);
            e.stopPropagation();
            e.preventDefault();
        }
        if (InkingControl.Instance.selectedTool === InkTool.Scrubber && e.buttons === 1) {
            AudioBox.SetScrubTime(this.props.creationTime);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    parseData = (line: Array<{ x: number, y: number }>): string => {
        return !line.length ? "" : "M " + line.map(p => (p.x + this.props.offsetX) + " " + (p.y + this.props.offsetY)).join(" L ");
    }

    createStyle() {
        switch (this._strokeTool) {
            // add more tool styles here
            default:
                return {
                    fill: "none",
                    stroke: this._strokeColor,
                    strokeWidth: this._strokeWidth + "px",
                };
        }
    }

    render() {
        let pathStyle = this.createStyle();
        let pathData = this.parseData(this.props.line);
        let pathlength = this.props.count; // bcz: this is needed to force reactions to the line's data changes
        let marker = this.props.tool === InkTool.Highlighter ? "-marker" : "";

        let pointerEvents: any = InkingControl.Instance.selectedTool === InkTool.Eraser ||
            InkingControl.Instance.selectedTool === InkTool.Scrubber ? "all" : "none";
        return (<path className={`inkingStroke${marker}`} d={pathData} style={{ ...pathStyle, pointerEvents: pointerEvents }}
            strokeLinejoin="round" strokeLinecap="round" onPointerOver={this.deleteStroke} onPointerDown={this.deleteStroke} />);
    }
}