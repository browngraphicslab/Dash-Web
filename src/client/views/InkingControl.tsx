import { observable, action, computed } from "mobx";
import { CirclePicker, ColorResult } from 'react-color'
import React = require("react");
import "./InkingCanvas.scss"
import { InkTool } from "../../fields/InkField";


export class InkingControl extends React.Component {
    private static Instance: InkingControl;

    @observable private _selectedTool: InkTool = InkTool.None;
    @observable private _selectedColor: string = "#f44336";
    @observable private _selectedWidth: string = "25";

    private constructor(props: Readonly<{}>) {
        super(props);
    }

    static getInstance = (): InkingControl => {
        if (!InkingControl.Instance) {
            InkingControl.Instance = new InkingControl({});
        }
        return InkingControl.Instance;
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

    render() {
        console.log(this._selectedTool);
        return (
            <div className="inking-control">
                <div className="ink-tools ink-panel">
                    <button onClick={() => InkingControl.getInstance().switchTool(InkTool.Pen)}>Pen</button>
                    <button onClick={() => InkingControl.getInstance().switchTool(InkTool.Highlighter)}>Highlighter</button>
                    <button onClick={() => InkingControl.getInstance().switchTool(InkTool.Eraser)}>Eraser</button>
                    <button onClick={() => InkingControl.getInstance().switchTool(InkTool.None)}> None</button>
                </div>
                <div className="ink-size ink-panel">
                    <label htmlFor="stroke-width">Size</label>
                    <input type="range" min="1" max="100" defaultValue="25" name="stroke-width"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => InkingControl.getInstance().switchWidth(e.target.value)} />
                </div>
                <div className="ink-color ink-panel">
                    <CirclePicker onChange={InkingControl.getInstance().switchColor} />
                </div>
            </div>
        )
    }
}