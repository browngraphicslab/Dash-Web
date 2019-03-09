import { observable, action, computed } from "mobx";
import { CirclePicker, ColorResult } from 'react-color'
import React = require("react");
import "./InkingCanvas.scss"
import { InkTool } from "../../fields/InkField";
import { observer } from "mobx-react";

@observer
export class InkingControl extends React.Component {
    static Instance: InkingControl = new InkingControl({});
    @observable private _selectedTool: InkTool = InkTool.None;
    @observable private _selectedColor: string = "#f44336";
    @observable private _selectedWidth: string = "25";

    constructor(props: Readonly<{}>) {
        super(props);
        InkingControl.Instance = this
    }

    @action
    switchTool = (tool: InkTool): void => {
        this._selectedTool = tool;
    }

    @action
    switchColor = (color: ColorResult): void => {
        this._selectedColor = color.hex;
    }

    @action
    switchWidth = (width: string): void => {
        this._selectedWidth = width;
    }

    @computed
    get selectedTool() {
        return this._selectedTool;
    }

    @computed
    get selectedColor() {
        return this._selectedColor;
    }

    @computed
    get selectedWidth() {
        return this._selectedWidth;
    }

    selected = (tool: InkTool) => {
        if (this._selectedTool === tool) {
            return { backgroundColor: "#61aaa3", color: "white" }
        }
        return {}
    }

    render() {
        return (
            <div className="inking-control">
                <div className="ink-tools ink-panel">
                    <button onClick={() => this.switchTool(InkTool.Pen)} style={this.selected(InkTool.Pen)}>Pen</button>
                    <button onClick={() => this.switchTool(InkTool.Highlighter)} style={this.selected(InkTool.Highlighter)}>Highlighter</button>
                    <button onClick={() => this.switchTool(InkTool.Eraser)} style={this.selected(InkTool.Eraser)}>Eraser</button>
                    <button onClick={() => this.switchTool(InkTool.None)} style={this.selected(InkTool.None)}> None</button>
                </div>
                <div className="ink-size ink-panel">
                    <label htmlFor="stroke-width">Size</label>
                    <input type="range" min="1" max="100" defaultValue="25" name="stroke-width"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.switchWidth(e.target.value)} />
                </div>
                <div className="ink-color ink-panel">
                    <CirclePicker onChange={this.switchColor} />
                </div>
            </div>
        )
    }
}